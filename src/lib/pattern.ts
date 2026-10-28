import { parseEyeDirective, validateEyePair, type SafetyEyePair } from "./safetyEyes";

export type StitchType = "sc" | "hdc" | "dc" | "tr" | "ch" | "slst" | "dec" | "bobble";

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
  branch?: { anchor: number; step: number; length: number; returning: boolean };
}

export interface PatternRound {
  number: number;
  /** First stitch's color; individual stitches may use other yarns. */
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
  eyes: SafetyEyePair[];
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

const STITCH_ALIASES: Readonly<Record<string, StitchType | "inc">> = {
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
  bobble: "bobble",
  bbl: "bobble",
};

export function resolveYarnColor(name: string): string | null {
  const key = name.trim().toLowerCase();
  return Object.hasOwn(YARN_COLORS, key)
    ? YARN_COLORS[key]
    : /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/.test(key)
      ? key
      : null;
}

function yarnColor(name: string) {
  const color = resolveYarnColor(name);
  if (!color)
    throw new PatternSyntaxError(
      `Unknown yarn color “${name}”. Use a named color such as sage or a hex value such as [#a6b49d].`,
    );
  return color;
}

export type Operation =
  | StitchType
  | "inc"
  | { color: string; name: string }
  | { same: Operation[] }
  | { branch: { chain: number; slip: number } };

function operationCounts(op: Operation): { input: number; output: number; total: number } {
  if (typeof op === "string") return {
    input: op === "ch" ? 0 : op === "dec" ? 2 : 1,
    output: op === "inc" ? 2 : 1,
    total: op === "inc" ? 2 : 1,
  };
  if ("same" in op) {
    const total = op.same.reduce((n, child) => n + operationCounts(child).output, 0);
    return { input: 1, output: total, total };
  }
  if ("branch" in op) return { input: 0, output: 0, total: op.branch.chain + op.branch.slip };
  return { input: 0, output: 0, total: 0 };
}
interface Token {
  value: string;
  position: number;
  color?: boolean;
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
    // A single non-stitch name in brackets is a color, not a repeat group.
    const color = /^\[\s*(#[^\s\[\],]*|[a-z_][\w-]*)\s*\]/i.exec(rest);
    if (color && !Object.hasOwn(STITCH_ALIASES, color[1].toLowerCase())) {
      tokens.push({ value: color[1].toLowerCase(), position, color: true });
      position += color[0].length;
      continue;
    }
    const token = /^(?:\d+|[a-z]+|[\[\](),*×])/i.exec(rest);
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

  interface Group {
    operations: Operation[];
    stitchCount: number;
  }
  function append(target: Group, group: Group, count: number) {
    // Bound both stitches and color commands before expanding nested repeats.
    if (
      target.stitchCount + group.stitchCount * count > MAX_STITCHES ||
      target.operations.length + group.operations.length * count > MAX_STITCHES * 2
    ) {
      throw new PatternSyntaxError(
        `This repeat is too large. Keep the pattern below ${MAX_STITCHES.toLocaleString()} stitches.`,
      );
    }
    for (let i = 0; i < count; i++) target.operations.push(...group.operations);
    target.stitchCount += group.stitchCount * count;
  }

  function sequence(depth: number): Group {
    if (depth > 12)
      throw new PatternSyntaxError(
        "Repeats are nested too deeply. Use at most 12 levels.",
      );
    const result: Group = { operations: [], stitchCount: 0 };
    while (cursor < tokens.length && tokens[cursor].value !== "]") {
      if (tokens[cursor].value === ",") {
        cursor++;
        continue;
      }
      if (tokens[cursor].value === "branch") {
        cursor++;
        if (tokens[cursor++]?.value !== "(")
          throw new PatternSyntaxError("Use branch(12 ch, 11 slst) for a chain out and return.");
        const chain = readCount();
        if (!["ch", "chain"].includes(tokens[cursor++]?.value ?? ""))
          throw new PatternSyntaxError("A branch starts with a chain count, for example branch(12 ch, 11 slst).");
        let slip = 0;
        if (tokens[cursor]?.value === ",") {
          cursor++;
          slip = readCount();
          if (!["slst", "ss"].includes(tokens[cursor++]?.value ?? ""))
            throw new PatternSyntaxError("Return along a branch with slip stitches, for example branch(12 ch, 11 slst).");
          if (slip !== chain - 1)
            throw new PatternSyntaxError("A returning branch starts in the second chain from the hook: use one fewer slip stitch than chains.");
        }
        if (tokens[cursor++]?.value !== ")")
          throw new PatternSyntaxError("A branch is missing its closing ).");
        append(result, { operations: [{ branch: { chain, slip } }], stitchCount: chain + slip }, 1);
        continue;
      }
      if (tokens[cursor].color) {
        const name = tokens[cursor++].value;
        append(
          result,
          { operations: [{ color: yarnColor(name), name }], stitchCount: 0 },
          1,
        );
        continue;
      }
      if (tokens[cursor].value === "[") {
        cursor++;
        const group = sequence(depth + 1);
        if (tokens[cursor]?.value !== "]")
          throw new PatternSyntaxError("This repeat is missing its closing ].");
        cursor++;
        if (!group.stitchCount)
          throw new PatternSyntaxError("A repeat group cannot be empty.");
        let operations = group.operations;
        if (tokens[cursor]?.value === "in") {
          cursor++;
          if (tokens[cursor++]?.value !== "same" || !["st", "stitch"].includes(tokens[cursor++]?.value ?? ""))
            throw new PatternSyntaxError("Use [bobble, sc] in same st to work multiple stitches into one parent.");
          if (operations.some((op) => typeof op === "string" ? ["dec", "ch", "inc"].includes(op) : !("color" in op)))
            throw new PatternSyntaxError("A same-stitch group supports ordinary stitches, bobbles and color changes; no chains, decreases, increases or branches.");
          operations = [{ same: operations }];
        }
        let repetitions = 1;
        if (
          ["rep", "repeat", "x", "*", "×"].includes(tokens[cursor]?.value ?? "")
        ) {
          cursor++;
          repetitions = readCount();
          if (["time", "times"].includes(tokens[cursor]?.value ?? "")) cursor++;
        }
        append(result, { operations, stitchCount: group.stitchCount }, repetitions);
        continue;
      }
      let count = 1;
      if (/^\d+$/.test(tokens[cursor].value)) count = readCount();
      const token = tokens[cursor++];
      if (!token)
        throw new PatternSyntaxError(
          "Add a stitch after the number, for example 6 sc.",
        );
      const operation =
        !token.color && Object.hasOwn(STITCH_ALIASES, token.value)
          ? STITCH_ALIASES[token.value]
          : undefined;
      if (!operation)
        throw new PatternSyntaxError(
          `Unknown stitch “${token.value}”. Supported: sc, hdc, dc, tr, bobble, ch, slst, inc and dec.`,
        );
      append(result, { operations: [operation], stitchCount: 1 }, count);
    }
    return result;
  }

  const group = sequence(0);
  if (cursor < tokens.length)
    throw new PatternSyntaxError("There is a closing ] without a matching [.");
  if (!group.operations.some((op) => operationCounts(op).output > 0))
    throw new PatternSyntaxError("This round has no stitches yet. Add body stitches after any branch.");
  return group.operations;
}

export interface RoundLine {
  start: number;
  end: number | null;
  instruction: string;
}
/** Accept code notation and the compact printed Rnd 9–16 notation. */
export function readRoundLine(line: string): RoundLine | null {
  const match =
    /^(?:(?:rnd|round|r)\.?\s*)?(\d+)(?:\s*[-–—]\s*(\d+))?(?:\s*:\s*|\s+)(.*)$/i.exec(
      line.trimStart(),
    );
  return match
    ? {
        start: Number(match[1]),
        end: match[2] ? Number(match[2]) : null,
        instruction: match[3],
      }
    : null;
}

export function analyzeInstruction(text: string) {
  let instruction = text.split("//")[0].trim();
  const declaredMatch = /\s*\((\d+)\)\s*$/.exec(instruction);
  const declaredCount = declaredMatch ? Number(declaredMatch[1]) : null;
  if (declaredMatch)
    instruction = instruction.slice(0, declaredMatch.index).trim();
  const duration = /\s+for\s+(\d+)\s+(?:rounds?|rnds?)\s*$/i.exec(instruction);
  const repeatRounds = duration ? Number(duration[1]) : null;
  if (
    repeatRounds !== null &&
    (!Number.isSafeInteger(repeatRounds) ||
      repeatRounds < 1 ||
      repeatRounds > MAX_ROUNDS)
  )
    throw new PatternSyntaxError(`Use between 1 and ${MAX_ROUNDS} rounds.`);
  if (duration) instruction = instruction.slice(0, duration.index).trim();
  const foundation = /\s+in\s+(?:mc|mr|magic\s+ring)\s*$/i.test(instruction);
  if (foundation)
    instruction = instruction
      .replace(/\s+in\s+(?:mc|mr|magic\s+ring)\s*$/i, "")
      .trim();
  const operations = parseOperations(instruction);
  return {
    operations,
    foundation,
    declaredCount,
    repeatRounds,
    inputCount: operations.reduce((n, op) => n + operationCounts(op).input, 0),
    outputCount: operations.reduce((n, op) => n + operationCounts(op).output, 0),
    totalCount: operations.reduce((n, op) => n + operationCounts(op).total, 0),
  };
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
    eyes: [],
    stitches: [],
    diagnostics: [],
    name: "Untitled pattern",
  };
  let color = YARN_COLORS.red;
  let named = false;
  let coursePrevious: number | null = null;
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
      const eyes = parseEyeDirective(line, lineNumber);
      if (eyes) {
        if (parsed.eyes.length >= 16) throw new PatternSyntaxError("Use at most 16 pairs of safety eyes.");
        parsed.eyes.push(eyes);
        continue;
      }
      const directive = /^\[([^\[\]]+)\]$/.exec(line);
      if (
        directive &&
        !/\b(?:sc|hdc|dc|tr|inc|dec|ch|slst)\b/i.test(directive[1])
      ) {
        color = yarnColor(directive[1].trim().toLowerCase());
        continue;
      }

      const roundLine = readRoundLine(line);
      if (!roundLine)
        throw new PatternSyntaxError(
          "Start each round with its number, for example Rnd 1: 7 sc in mr.",
        );
      const { operations, foundation, declaredCount, repeatRounds } =
        analyzeInstruction(roundLine.instruction);
      const endRound =
        roundLine.end ?? roundLine.start + (repeatRounds ?? 1) - 1;
      if (
        !Number.isSafeInteger(endRound) ||
        roundLine.start < 1 ||
        endRound < roundLine.start ||
        endRound > MAX_ROUNDS
      )
        throw new PatternSyntaxError(
          `Use consecutive round ranges between 1 and ${MAX_ROUNDS}.`,
        );
      if (
        roundLine.end !== null &&
        repeatRounds !== null &&
        endRound - roundLine.start + 1 !== repeatRounds
      )
        throw new PatternSyntaxError(
          `The range Rnd ${roundLine.start}–${endRound} contains ${endRound - roundLine.start + 1} rounds, but the instruction says ${repeatRounds}.`,
        );
      for (
        let roundNumber = roundLine.start;
        roundNumber <= endRound;
        roundNumber++
      ) {
        if (parsed.rounds.length >= MAX_ROUNDS || roundNumber > MAX_ROUNDS)
          throw new PatternSyntaxError(
            `This preview supports up to ${MAX_ROUNDS} rounds.`,
          );
        if (roundNumber !== parsed.rounds.length + 1)
          throw new PatternSyntaxError(
            `Expected round ${parsed.rounds.length + 1}, but found round ${roundNumber}. Keep round numbers consecutive, starting at 1.`,
          );
        if (foundation && roundNumber !== 1)
          throw new PatternSyntaxError(
            "A magic ring can only start round 1. Start another component as a separate pattern.",
          );
        if (
          roundNumber === 1 &&
          operations.some((op) => op === "inc" || op === "dec")
        )
          throw new PatternSyntaxError(
            "Start with foundation stitches, for example 1: 6 sc in mc (6). Increases and decreases need an existing round.",
          );

        const consumed = operations.reduce((n, op) => n + operationCounts(op).input, 0);
        const produced = operations.reduce((n, op) => n + operationCounts(op).output, 0);
        const totalProduced = operations.reduce((n, op) => n + operationCounts(op).total, 0);
        const increases = operations.filter((op) => op === "inc").length;
        const decreases = operations.filter((op) => op === "dec").length;
        if (parsed.stitches.length + totalProduced > MAX_STITCHES)
          throw new PatternSyntaxError(
            `This preview supports up to ${MAX_STITCHES.toLocaleString()} stitches, including branches. Try a smaller pattern.`,
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
        const created: Stitch[] = [];
        let previous: number | null = coursePrevious;
        const create = (type: StitchType, parents: number[], isIncrease = false, branch?: Stitch["branch"]) => {
          const id = parsed.stitches.length + created.length;
          const stitch: Stitch = {
            id, round: roundNumber,
            index: branch ? branch.step - 1 : round.stitches.length,
            type, color, parents: [...parents], previous,
            sourceLine: lineNumber, isIncrease,
            ...(branch ? { branch } : {}),
          };
          created.push(stitch);
          if (!branch) round.stitches.push(stitch);
          previous = id;
          return stitch;
        };
        for (const operation of operations) {
          if (typeof operation !== "string" && "color" in operation) {
            color = operation.color;
            continue;
          }
          if (typeof operation !== "string" && "branch" in operation) {
            const anchor = round.stitches.at(-1) ?? parentRound?.stitches.at(-1);
            if (!anchor) throw new PatternSyntaxError("A branch needs an existing body stitch to attach to. Work a body stitch before the branch.");
            const { chain, slip } = operation.branch;
            previous = anchor.id;
            const chainStitches: Stitch[] = [];
            for (let step = 1; step <= chain; step++) {
              const parent = chainStitches.at(-1)?.id ?? anchor.id;
              chainStitches.push(create("ch", [parent], false, { anchor: anchor.id, step, length: chain, returning: false }));
            }
            for (let step = slip; step >= 1; step--) {
              create("slst", [chainStitches[step - 1].id], false, { anchor: anchor.id, step, length: chain, returning: true });
            }
            if (!slip) previous = anchor.id;
            continue;
          }
          const same = typeof operation !== "string" && "same" in operation ? operation.same : null;
          if (same && !parentRound)
            throw new PatternSyntaxError("A same-stitch group needs an existing round to attach to.");
          const needed = !parentRound || operation === "ch" ? 0 : operation === "dec" ? 2 : 1;
          const parents = parentRound?.stitches.slice(parentCursor, parentCursor + needed).map((stitch) => stitch.id) ?? [];
          parentCursor += needed;
          if (same) {
            for (const child of same) {
              if (typeof child === "string") create(child as StitchType, parents);
              else if ("color" in child) color = child.color;
            }
          } else if (typeof operation === "string") {
            for (let child = 0; child < (operation === "inc" ? 2 : 1); child++)
              create(operation === "inc" ? "sc" : operation, parents, operation === "inc");
          }
        }
        round.color = round.stitches[0].color;
        parsed.rounds.push(round);
        parsed.stitches.push(...created);
        coursePrevious = previous;
        if (roundNumber === 1 && !foundation)
          parsed.diagnostics.push({
            line: lineNumber,
            severity: "warning",
            message:
              "Previewing the first round as a ring. Add “in mc” to make the magic-ring foundation explicit.",
          });
      }
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

  for (const eyes of parsed.eyes) {
    const message = validateEyePair(eyes, parsed.rounds);
    if (message) parsed.diagnostics.push({ line: eyes.line, severity: "error", message });
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
  {
    id: "sampler",
    name: "Stitch sampler",
    description: "One yarn color. Four unmistakable stitch shapes.",
    source: `# Stitch sampler
# Compare round SC bubbles with taller HDC, DC and TR beads

[teal]
1: 12 sc in mc (12)
2: 12 inc (24)
3: [3 sc, 3 hdc, 3 dc, 3 tr] rep 2 times (24)
4: 24 sc (24)`,
  },
  {
    id: "seven",
    name: "Seven-stitch shaping",
    description: "Worksheet notation, grouped rounds and automatic totals.",
    source: `# Seven-stitch shaping
[sage]
Rnd 1: 7 sc in mr
Rnd 2: 7 inc
Rnd 3: [sc, inc] × 7
Rnd 4: [2 sc, inc] × 7
Rnd 5: sc, inc, [3 sc, inc] × 6, 2 sc
Rnd 6: [4 sc, inc] × 7
Rnd 7: 42 sc
// An initial inc in Rnd 8 makes the intended 49 stitches.
Rnd 8: 2 sc, inc, [5 sc, inc] × 6, 3 sc
Rnd 9–16: 49 sc for 8 rounds`,
  },
  {
    id: "colorwork",
    name: "Two-color basket",
    description: "Change colors within a round, in blocks or repeated stitches.",
    source: `# Two-color basket
[red]
Rnd 1: 8 sc in mr (8)
Rnd 2: [[red] inc, [beige] inc] × 4 (16)
Rnd 3: [[red] sc, inc, [beige] sc, inc] × 4 (24)
Rnd 4–6: [red] 12 sc, [beige] 12 sc for 3 rounds (24)
Rnd 7: [[red] sc, [beige] sc] × 12 (24)
Rnd 8: [beige] 24 sc (24)`,
  },
  {
    id: "orange-critter",
    name: "Orange critter",
    description: "Two bobble ears, safety eyes, a white belly and a chain tail.",
    source: `# Orange critter
[orange]
Rnd 1: 6 sc in mr (6)
Rnd 2: 6 inc (12)
Rnd 3: sc, inc, sc, [bobble, sc] in same st, sc, inc, sc, [sc, bobble] in same st, [sc, inc] × 2 (18)
Rnd 4: [sc, inc, sc] × 6 (24)
Rnd 5: 6 sc, inc, 3 sc, [white] sc, [orange] 4 sc, inc, 8 sc (26)
Rnd 6: 6 sc, dec, 2 sc, [white] 3 sc, [orange] 3 sc, dec, 8 sc (24)
Rnd 7–8: 8 sc, [white] 5 sc, [orange] 11 sc for 2 rounds (24)
// The stitch positions are adjustable; there are four stitches between eyes.
eyes between 5 and 6 at 10, 14 size 0.8
Rnd 9: 9 sc, [white] 3 sc, [orange] 12 sc (24)
Rnd 10: 9 sc, [white] 4 sc, [orange] 11 sc (24)
Rnd 11–26: 8 sc, [white] 6 sc, [orange] 10 sc for 16 rounds (24)
// Chain out from the body, skip the last chain, then slip-stitch back.
Rnd 27: branch(12 ch, 11 slst), 24 sc (24)
// Work round 28 in BLO when crocheting; loop choice is not simulated.
Rnd 28: [sc, dec, sc] × 6 (18)
Rnd 29: [sc, dec] × 6 (12)
Rnd 30: 6 dec (6)`,
  },
];
