export type StitchType = "sc" | "hdc" | "dc" | "tr" | "ch" | "slst" | "dec";

export interface Stitch {
  id: number;
  round: number;
  index: number;
  type: StitchType;
  color: string;
  parents: number[];
  previous: number | null;
  sourceLine: number;
  isIncrease: boolean;
}

export interface PatternRound {
  number: number;
  color: string;
  stitches: Stitch[];
  inputCount: number;
  outputCount: number;
  declaredCount: number | null;
  increases: number;
  decreases: number;
  line: number;
}

export interface Diagnostic {
  line: number;
  message: string;
  severity: "error" | "warning";
}

export interface ParsedPattern {
  rounds: PatternRound[];
  stitches: Stitch[];
  diagnostics: Diagnostic[];
  name: string;
}

export const MAX_STITCHES = 8000;
export const MAX_ROUNDS = 150;

/** Deliberately small yarn palette; arbitrary yarns can use a hex color directive. */
export const YARN_COLORS: Readonly<Record<string, string>> = {
  red: "#c63e36",
  beige: "#e5dec5",
  cream: "#eee6d2",
  white: "#f4f2ea",
  black: "#303431",
  green: "#718b75",
  sage: "#9eaf99",
  forest: "#345d4a",
  blue: "#6b91b5",
  navy: "#374a65",
  teal: "#408c88",
  turquoise: "#57a7a4",
  pink: "#d996a4",
  rose: "#c57885",
  coral: "#dd8775",
  burgundy: "#803d4d",
  purple: "#8d7ca5",
  lavender: "#b0a3c7",
  lilac: "#bcaaca",
  yellow: "#dfc369",
  mustard: "#ba984e",
  orange: "#d89455",
  brown: "#987358",
  tan: "#c5a783",
  sand: "#d1c2a5",
  oatmeal: "#d7cdb7",
  oat: "#d7cdb7",
  gray: "#a0a39e",
  grey: "#a0a39e",
  charcoal: "#545c58",
  terracotta: "#bd765f",
  rust: "#af6248",
  ivory: "#eeeadb",
  mint: "#a9c6b5",
};

type Operation = StitchType | "inc";
interface Token {
  value: string;
  position: number;
}

class PatternSyntaxError extends Error {}

/** Tokenize a restricted language. No user text is ever evaluated as JavaScript. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < source.length) {
    const rest = source.slice(position);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      position += whitespace[0].length;
      continue;
    }
    const token = /^(?:\d+|[a-z]+|[\[\],*])/i.exec(rest);
    if (!token) {
      throw new PatternSyntaxError(
        `Unexpected “${rest[0]}” near column ${position + 1}. Use stitches such as sc, inc, dec or [sc, inc] rep 6 times.`,
      );
    }
    tokens.push({ value: token[0].toLowerCase(), position });
    position += token[0].length;
  }
  return tokens;
}

function parseOperations(source: string): Operation[] {
  const tokens = tokenize(source);
  let cursor = 0;

  function readCount(): number {
    const token = tokens[cursor];
    if (!token || !/^\d+$/.test(token.value))
      throw new PatternSyntaxError(
        "A repeat needs a number, for example [sc, inc] rep 6 times.",
      );
    cursor++;
    const count = Number(token.value);
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_STITCHES) {
      throw new PatternSyntaxError(
        `Stitch and repeat counts must be between 1 and ${MAX_STITCHES.toLocaleString()}.`,
      );
    }
    return count;
  }

  function append(target: Operation[], group: Operation[], count: number) {
    if (target.length + group.length * count > MAX_STITCHES) {
      throw new PatternSyntaxError(
        `This repeat is too large. Keep the pattern below ${MAX_STITCHES.toLocaleString()} stitches.`,
      );
    }
    for (let i = 0; i < count; i++) target.push(...group);
  }

  function sequence(depth: number): Operation[] {
    if (depth > 12)
      throw new PatternSyntaxError(
        "Repeats are nested too deeply. Use at most 12 levels.",
      );
    const result: Operation[] = [];
    while (cursor < tokens.length && tokens[cursor].value !== "]") {
      if (tokens[cursor].value === ",") {
        cursor++;
        continue;
      }
      if (tokens[cursor].value === "[") {
        cursor++;
        const group = sequence(depth + 1);
        if (tokens[cursor]?.value !== "]")
          throw new PatternSyntaxError("This repeat is missing its closing ].");
        cursor++;
        if (!group.length)
          throw new PatternSyntaxError("A repeat group cannot be empty.");
        let repetitions = 1;
        if (["rep", "repeat", "x", "*"].includes(tokens[cursor]?.value ?? "")) {
          cursor++;
          repetitions = readCount();
          if (["time", "times"].includes(tokens[cursor]?.value ?? "")) cursor++;
        }
        append(result, group, repetitions);
        continue;
      }
      let count = 1;
      if (/^\d+$/.test(tokens[cursor].value)) count = readCount();
      const token = tokens[cursor++];
      if (!token)
        throw new PatternSyntaxError(
          "Add a stitch after the number, for example 6 sc.",
        );
      const aliases: Record<string, Operation> = {
        sc: "sc",
        hdc: "hdc",
        dc: "dc",
        tr: "tr",
        ch: "ch",
        chain: "ch",
        slst: "slst",
        ss: "slst",
        inc: "inc",
        increase: "inc",
        dec: "dec",
        decrease: "dec",
      };
      const operation = Object.hasOwn(aliases, token.value)
        ? aliases[token.value]
        : undefined;
      if (!operation)
        throw new PatternSyntaxError(
          `Unknown stitch “${token.value}”. Supported: sc, hdc, dc, tr, ch, slst, inc and dec.`,
        );
      append(result, [operation], count);
    }
    return result;
  }

  const operations = sequence(0);
  if (cursor < tokens.length)
    throw new PatternSyntaxError("There is a closing ] without a matching [.");
  if (!operations.length)
    throw new PatternSyntaxError("This round has no stitches yet.");
  return operations;
}

/**
 * Parse continuous-round patterns into a construction graph.
 * IDs/indexes are zero-based; round labels and source lines are one-based.
 * On an error, previously valid rounds remain available, but the invalid round
 * is never silently added to the model.
 */
export function parsePattern(source: string): ParsedPattern {
  const parsed: ParsedPattern = {
    rounds: [],
    stitches: [],
    diagnostics: [],
    name: "Untitled pattern",
  };
  let color = YARN_COLORS.red;
  let named = false;
  const lines = source.split(/\r?\n/);

  if (source.length > 120_000) {
    parsed.diagnostics.push({
      line: 1,
      severity: "error",
      message:
        "This pattern is too long. Keep the editor below 120,000 characters.",
    });
    return parsed;
  }

  for (let offset = 0; offset < lines.length; offset++) {
    const lineNumber = offset + 1;
    const line = lines[offset].split("//")[0].trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (!named && line.slice(1).trim()) {
        parsed.name = line.replace(/^#+\s*/, "").trim();
        named = true;
      }
      continue;
    }

    try {
      const directive = /^\[([^\[\]]+)\]$/.exec(line);
      if (
        directive &&
        !/\b(?:sc|hdc|dc|tr|inc|dec|ch|slst)\b/i.test(directive[1])
      ) {
        const name = directive[1].trim().toLowerCase();
        const resolved = Object.hasOwn(YARN_COLORS, name)
          ? YARN_COLORS[name]
          : /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(name)
            ? name
            : null;
        if (!resolved)
          throw new PatternSyntaxError(
            `Unknown yarn color “${name}”. Use a named color such as sage or a hex value such as [#a6b49d].`,
          );
        color = resolved;
        continue;
      }

      const roundMatch = /^(?:(?:r(?:ound)?\.?)\s*)?(\d+)\s*:\s*(.*)$/i.exec(
        line,
      );
      if (!roundMatch)
        throw new PatternSyntaxError(
          "Start each round with its number, for example 1: 6 sc in mc (6).",
        );
      const roundNumber = Number(roundMatch[1]);
      if (parsed.rounds.length >= MAX_ROUNDS || roundNumber > MAX_ROUNDS)
        throw new PatternSyntaxError(
          `This preview supports up to ${MAX_ROUNDS} rounds.`,
        );
      if (roundNumber !== parsed.rounds.length + 1)
        throw new PatternSyntaxError(
          `Expected round ${parsed.rounds.length + 1}, but found round ${roundNumber}. Keep round numbers consecutive, starting at 1.`,
        );

      let instruction = roundMatch[2].trim();
      const declaredMatch = /\s*\((\d+)\)\s*$/.exec(instruction);
      const declaredCount = declaredMatch ? Number(declaredMatch[1]) : null;
      if (declaredMatch)
        instruction = instruction.slice(0, declaredMatch.index).trim();
      const foundation = /\s+in\s+(?:mc|mr|magic\s+ring)\s*$/i.test(
        instruction,
      );
      if (foundation)
        instruction = instruction
          .replace(/\s+in\s+(?:mc|mr|magic\s+ring)\s*$/i, "")
          .trim();
      if (foundation && roundNumber !== 1)
        throw new PatternSyntaxError(
          "A magic ring can only start round 1. Start another component as a separate pattern.",
        );
      const operations = parseOperations(instruction);
      if (
        roundNumber === 1 &&
        operations.some((op) => op === "inc" || op === "dec")
      )
        throw new PatternSyntaxError(
          "Start with foundation stitches, for example 1: 6 sc in mc (6). Increases and decreases need an existing round.",
        );

      let consumed = 0;
      let produced = 0;
      let increases = 0;
      let decreases = 0;
      for (const operation of operations) {
        consumed += operation === "ch" ? 0 : operation === "dec" ? 2 : 1;
        produced += operation === "inc" ? 2 : 1;
        if (operation === "inc") increases++;
        if (operation === "dec") decreases++;
      }
      if (parsed.stitches.length + produced > MAX_STITCHES)
        throw new PatternSyntaxError(
          `This preview supports up to ${MAX_STITCHES.toLocaleString()} stitches. Try a smaller pattern.`,
        );
      if (declaredCount !== null && declaredCount !== produced)
        throw new PatternSyntaxError(
          `Round ${roundNumber} makes ${produced} stitches, but its total says (${declaredCount}). Update the instructions or the total.`,
        );
      const parentRound = parsed.rounds.at(-1);
      if (parentRound && consumed !== parentRound.outputCount) {
        throw new PatternSyntaxError(
          `Round ${roundNumber} uses ${consumed} stitches, but round ${parentRound.number} has ${parentRound.outputCount}. ${consumed > parentRound.outputCount ? "Remove extra stitches or decreases" : "Add stitches or increases"} so the full previous round is used.`,
        );
      }

      const round: PatternRound = {
        number: roundNumber,
        color,
        stitches: [],
        inputCount: parentRound ? consumed : 0,
        outputCount: produced,
        declaredCount,
        increases,
        decreases,
        line: lineNumber,
      };
      let parentCursor = 0;
      const firstID = parsed.stitches.length;
      for (const operation of operations) {
        const needed =
          !parentRound || operation === "ch" ? 0 : operation === "dec" ? 2 : 1;
        const parents =
          parentRound?.stitches
            .slice(parentCursor, parentCursor + needed)
            .map((stitch) => stitch.id) ?? [];
        parentCursor += needed;
        for (let child = 0; child < (operation === "inc" ? 2 : 1); child++) {
          const id = firstID + round.stitches.length;
          round.stitches.push({
            id,
            round: roundNumber,
            index: round.stitches.length,
            type: operation === "inc" ? "sc" : operation,
            color,
            parents: [...parents],
            previous: id ? id - 1 : null,
            sourceLine: lineNumber,
            isIncrease: operation === "inc",
          });
        }
      }
      parsed.rounds.push(round);
      parsed.stitches.push(...round.stitches);
      if (roundNumber === 1 && !foundation)
        parsed.diagnostics.push({
          line: lineNumber,
          severity: "warning",
          message:
            "Previewing the first round as a ring. Add “in mc” to make the magic-ring foundation explicit.",
        });
    } catch (error) {
      parsed.diagnostics.push({
        line: lineNumber,
        severity: "error",
        message:
          error instanceof Error ? error.message : "Could not read this round.",
      });
      break;
    }
  }

  if (
    !parsed.rounds.length &&
    !parsed.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    parsed.diagnostics.push({
      line: 1,
      severity: "warning",
      message: "Start with a foundation round, for example 1: 6 sc in mc (6).",
    });
  }
  return parsed;
}

export const EXAMPLES: {
  id: string;
  name: string;
  description: string;
  source: string;
}[] = [
  {
    id: "mushroom",
    name: "Mushroom cap",
    description: "A softly shaped cap with a contrasting rim.",
    source: `# Mushroom cap
# Single crochet · worked in the round

[red]
1: 8 sc in mc (8)
2: 8 inc (16)
3: [1 sc, 1 inc] rep 8 times (24)
4: [5 sc, 1 inc] rep 4 times (28)
5: 3 sc, 1 inc, [6 sc, 1 inc] rep 3 times, 3 sc (32)
6: [7 sc, 1 inc] rep 4 times (36)
7: [5 sc, 1 inc] rep 6 times (42)
8: 3 sc, 1 inc, [6 sc, 1 inc] rep 5 times, 3 sc (48)
9: [7 sc, 1 inc] rep 6 times (54)

// Change yarn for the upper band
[beige]
10: [7 hdc, 1 dec] rep 6 times (48)
11: [6 sc, 1 dec] rep 6 times (42)
12: [5 sc, 1 dec] rep 6 times (36)`,
  },
  {
    id: "sphere",
    name: "Little sphere",
    description: "Classic amigurumi shaping, from ring to rounded form.",
    source: `# Little sphere
# A classic amigurumi building block

[sage]
1: 6 sc in mc (6)
2: 6 inc (12)
3: [1 sc, 1 inc] rep 6 times (18)
4: [2 sc, 1 inc] rep 6 times (24)
5: [3 sc, 1 inc] rep 6 times (30)
6: 30 sc (30)
7: 30 sc (30)
8: 30 sc (30)
9: [3 sc, 1 dec] rep 6 times (24)
10: [2 sc, 1 dec] rep 6 times (18)
11: [1 sc, 1 dec] rep 6 times (12)
12: 6 dec (6)`,
  },
  {
    id: "basket",
    name: "Everyday basket",
    description: "A flat base, straight sides and a little color.",
    source: `# Everyday basket
# Circular base with straight, contrasting sides

[oatmeal]
1: 6 sc in mc (6)
2: 6 inc (12)
3: [1 sc, 1 inc] rep 6 times (18)
4: [2 sc, 1 inc] rep 6 times (24)
5: [3 sc, 1 inc] rep 6 times (30)
6: [4 sc, 1 inc] rep 6 times (36)
7: 36 sc (36)
8: 36 sc (36)

[terracotta]
9: 36 sc (36)
10: 36 sc (36)
11: 36 sc (36)
12: 36 sc (36)`,
  },
];
