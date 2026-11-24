import { closesLastRound, type PieceEdge } from './pieceEdge';
import { parseEyeDirective, validateEyePair, type SafetyEyePair } from "./safetyEyes";
import type { PatternOrientation } from "./orientation";
import { MAX_EMBROIDERY, parseEmbroideryDirective, validateEmbroidery, type EmbroiderySegment } from './embroidery';

export type StitchType = "sc" | "hdc" | "dc" | "tr" | "ch" | "slst" | "dec" | "bobble" | "dtr" | "dec3" | "bobble2" | "bobble3" | "bobble4" | "trbo" | "puff" | "popcorn";

export interface Stitch {
  id: number;
  round: number;
  index: number;
  type: StitchType;
  color: string;
  /** Written yarn before a paint directive overrides this stitch. */
  patternColor?: string;
  paintSourceLine?: number;
  parents: number[];
  previous: number | null;
  sourceLine: number;
  isIncrease: boolean;
  loop?: 'front'|'back';
  countedChain?: number;
  chainIndex?: number;
  auxiliary?: { kind: 'foundation' | 'turning'; step: number; count: number };
  branch?: { anchor: number; step: number; length: number; returning: boolean };
}

export interface PatternRound {
  joined?:boolean;
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
  joinedStart?: {chains:number;intoHole:boolean;line:number};
  ovalStart?: { chains: number; line: number };

  construction?: 'rows';
  chainStart?: { line: number; stitches: Stitch[] };
  make?: number;
  edge?: PieceEdge;
  orientation: PatternOrientation;
  eyes: SafetyEyePair[];
  embroidery: EmbroiderySegment[];
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

const STITCH_ALIASES: Readonly<Record<string, StitchType | "inc" | "sk">> = {
  sl: "slst",
  sk: "sk",
  dtr: "dtr",
  dec3: "dec3",
  bobble2: "bobble2",
  bobble3: "bobble3",
  bobble4: "bobble4",
  trbo: "trbo",
  puff: "puff",
  popcorn: "popcorn",
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
  | "sk"
  | { color: string; name: string }
  | { stitch: StitchType | "inc" | "sk"; countedChain?: number; loop?: 'front'|'back'; colors: (string | null)[]; name: string }
  | { same: Operation[]; loop?: 'front'|'back' }
  | { branch: { chain: number; slip: number; back?:Operation[]; colors?: (string | null)[] } };

function operationCounts(op: Operation): { input: number; output: number; total: number } {
  if (typeof op !== "string" && "stitch" in op) return operationCounts(op.stitch);
  if (typeof op === "string") return {
    input: op === "ch" ? 0 : op === "dec3" ? 3 : op === "dec" ? 2 : 1,
    output: op === "sk" ? 0 : op === "inc" ? 2 : 1,
    total: op === "sk" ? 0 : op === "inc" ? 2 : 1,
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
  colors?: (string | null)[];
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
    // Two entries address the individual children of an increase. An empty
    // entry keeps that child's current yarn, e.g. inc[,#ff8800].
    const colorPair = /^\[\s*([^\[\],\s]*)\s*,\s*([^\[\],\s]*)\s*\]/i.exec(rest);
    if (colorPair && [colorPair[1], colorPair[2]].every((name) => !Object.hasOwn(STITCH_ALIASES, name.toLowerCase()))) {
      tokens.push({ value: colorPair[0], position, colors: colorPair.slice(1).map((name) => name ? yarnColor(name) : null) });
      position += colorPair[0].length;
      continue;
    }
    const token = /^(?:\d+|(?:bobble[234]|dec3|[a-z]+)|[\[\](),*×])/i.exec(rest);
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

function loopOperations(ops:Operation[],loop:'front'|'back'):Operation[] {
  return ops.map(op=>typeof op==='string'?{stitch:op,colors:[null],name:'',loop}:'stitch' in op?{...op,loop}:'same' in op?{...op,loop,same:loopOperations(op.same,loop)}:op);
}

function parseOperations(source: string): Operation[] {
  source=source.replace(/\b(\d+)\s*(hdc|dc|tr|dtr)\s+inc\b/gi,(_,n,type)=>`([${type}, ${type}] in same st) x${n}`)
    .replace(/\b(\d+)\s*(inc3|shell)\b/gi,(_,n,type)=>`(${type}) x${n}`)
    .replace(/\b(hdc|dc|tr|dtr)\s+inc\b/gi,(_,type)=>`[${type}, ${type}] in same st`)
    .replace(/\binc3\b/gi,'[sc, sc, sc] in same st')
    .replace(/\bshell\b/gi,'[dc, dc, dc, dc, dc] in same st')
    .replace(/\b(\d+)\s*(sc|hdc|dc|tr|dtr|sl)\s+in\s+(?:one|same)\s+st(?:itch)?\b/gi,(_,n,type)=>'['+Array(Math.min(8000,Number(n))).fill(type).join(', ')+'] in same st')
    .replace(/\bin one st(?:itch)?\b/gi,'in same st');

  source=source.replace(/\bch\s+(\d+)\s+back\s*\(/gi,'backbranch($1,');
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
    let pendingLoop:'front'|'back'|undefined;

    while (cursor < tokens.length && !["]", ")"].includes(tokens[cursor].value)) {
      if(['flo','blo'].includes(tokens[cursor].value)){pendingLoop=tokens[cursor++].value==='flo'?'front':'back';continue;}
      if (tokens[cursor].value === ",") {
        cursor++;
        continue;
      }
      if(tokens[cursor].value==='countedchain') {
        cursor++;if(tokens[cursor++]?.value!=='(')throw new PatternSyntaxError('Use ch 3 (counts as dc).');
        const count=readCount();if(count>5)throw new PatternSyntaxError('Use 1–5 chains for a counted turning chain.');
        if(tokens[cursor]?.value===',')cursor++;
        const type=STITCH_ALIASES[tokens[cursor++]?.value];
        if(!type||!['sc','hdc','dc','tr','dtr'].includes(type)||tokens[cursor++]?.value!==')')throw new PatternSyntaxError('A turning chain must count as sc, hdc, dc, tr or dtr.');
        const suffix=tokens[cursor];const colors=suffix?.color||suffix?.colors?(cursor++,suffix.colors??[yarnColor(suffix.value)]):[null];
        append(result,{operations:[{stitch:type,colors,name:'',countedChain:count}],stitchCount:1},1);continue;
      }
      if(tokens[cursor].value==='backbranch') {
        cursor++;if(tokens[cursor++]?.value!=='(')throw new PatternSyntaxError('Use ch 3 back (2 sc).');
        const chain=readCount();if(tokens[cursor]?.value===',')cursor++;
        const back=sequence(depth+1).operations;
        if(tokens[cursor++]?.value!==')')throw new PatternSyntaxError('Close the chain-back instructions with ).');
        const input=back.reduce((n,op)=>n+operationCounts(op).input,0),slip=back.reduce((n,op)=>n+operationCounts(op).output,0);
        if(input!==chain-1||back.some(op=>typeof op==='string'?op==='ch': 'branch' in op))throw new PatternSyntaxError('Work back across every chain except the turning chain.');
        append(result,{operations:[{branch:{chain,slip,back}}],stitchCount:chain+slip},1);continue;
      }
      if (tokens[cursor].value === "branch") {
        cursor++;
        if (tokens[cursor++]?.value !== "(")
          throw new PatternSyntaxError("Use branch(12 ch, 11 slst) for a chain out and return.");
        const inner = sequence(depth + 1).operations;
        if (tokens[cursor++]?.value !== ")") throw new PatternSyntaxError("A branch is missing its closing ).");
        const colors:(string|null)[]=[];
        let branchColor:string|null=null,split=0;
        for(;split<inner.length;split++){
          const op=inner[split];
          if(typeof op!=='string'&&'color' in op){branchColor=op.color;continue;}
          const type=typeof op==='string'?op:'stitch' in op?op.stitch:'';
          if(type!=='ch')break;
          colors.push(typeof op!=='string'&&'stitch' in op?op.colors[0]??branchColor:branchColor);
        }
        const chain=colors.length,back=inner.slice(split);
        const input=back.reduce((n,op)=>n+operationCounts(op).input,0),slip=back.reduce((n,op)=>n+operationCounts(op).output,0);
        if(!chain || back.length&&input!==chain-1 || back.some(op=>typeof op==='string'?op==='ch': 'branch' in op))
          throw new PatternSyntaxError('A branch starts with chains, then works back across all but its turning chain.');
        const simple=back.every(op=>typeof op==='string'?op==='slst':'stitch' in op&&op.stitch==='slst');
        if(simple)for(const op of back)colors.push(typeof op!=='string'&&'stitch' in op?op.colors[0]??branchColor:branchColor);
        append(result,{operations:[{branch:{chain,slip,colors,...(!simple?{back}:{} )}}],stitchCount:chain+slip},1);
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
      let prefixRepeat = 1;
      if (/^\d+$/.test(tokens[cursor].value) && ["x", "×", "*"].includes(tokens[cursor+1]?.value ?? "") && ["[", "("].includes(tokens[cursor+2]?.value ?? "")) {
        prefixRepeat = readCount(); cursor++;
      }
      if (["[", "("].includes(tokens[cursor].value)) {
        const closing = tokens[cursor].value === "[" ? "]" : ")";
        cursor++;
        const group = sequence(depth + 1);
        if (tokens[cursor]?.value !== closing)
          throw new PatternSyntaxError(`This repeat is missing its closing ${closing}.`);
        cursor++;
        if (!group.stitchCount)
          throw new PatternSyntaxError("A repeat group cannot be empty.");
        let operations = group.operations;
        if (tokens[cursor]?.value === "in") {
          cursor++;
          if (tokens[cursor++]?.value !== "same" || !["st", "stitch"].includes(tokens[cursor++]?.value ?? ""))
            throw new PatternSyntaxError("Use [bobble, sc] in same st to work multiple stitches into one parent.");
          if (operations.some((op) => typeof op === "string" ? ["dec", "dec3", "sk", "ch", "inc"].includes(op) : "stitch" in op ? ["dec", "dec3", "sk", "ch", "inc"].includes(op.stitch) : !("color" in op)))
            throw new PatternSyntaxError("A same-stitch group supports ordinary stitches, bobbles and color changes; no chains, decreases, increases or branches.");
          operations = [{ same: operations }];
        }
        let repetitions = prefixRepeat;
        if (
          ["rep", "repeat", "x", "*", "×"].includes(tokens[cursor]?.value ?? "")
        ) {
          cursor++;
          repetitions *= readCount();
          if (["time", "times"].includes(tokens[cursor]?.value ?? "")) cursor++;
        }
        if(pendingLoop){operations=loopOperations(operations,pendingLoop);pendingLoop=undefined;}
        append(result, { operations, stitchCount: group.stitchCount }, repetitions);
        continue;
      }
      let count = 1;
      const hasPrefixCount=/^\d+$/.test(tokens[cursor].value);
      if (hasPrefixCount) {
        count = readCount();
        if (["x", "×", "*"].includes(tokens[cursor]?.value ?? "")) cursor++;
      }
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
      let operationEnd=token.position+token.value.length;
      if(operation === 'ch' && !hasPrefixCount && /^\d+$/.test(tokens[cursor]?.value ?? '')) {
        operationEnd=tokens[cursor].position+tokens[cursor].value.length;
        count=readCount();
      }
      const suffix = tokens[cursor];
      const adjacentColor = suffix && (suffix.color || suffix.colors) && suffix.position === operationEnd;
      let parsedOperation: Operation = operation;
      if (adjacentColor) {
        cursor++;
        const colors = suffix.colors ?? [yarnColor(suffix.value)];
        if (colors.length > 1 && operation !== "inc")
          throw new PatternSyntaxError("Two stitch colors are only supported on an increase, for example inc[#ffffff,#ff8800].");
        parsedOperation = { stitch: operation, colors, name: colors.filter(Boolean).join("; ") };
      }
      if (["x", "*", "×", "rep", "repeat"].includes(tokens[cursor]?.value ?? "")) {
        cursor++;
        count *= readCount();
        if (["time", "times"].includes(tokens[cursor]?.value ?? "")) cursor++;
      }
      if(pendingLoop){parsedOperation=loopOperations([parsedOperation],pendingLoop)[0];pendingLoop=undefined;}
      append(result, { operations: [parsedOperation], stitchCount: operationCounts(operation).total }, count);
    }
    if(pendingLoop)throw new PatternSyntaxError('Add a stitch or group after FLO/BLO.');
    return result;
  }

  const group = sequence(0);
  if (cursor < tokens.length)
    throw new PatternSyntaxError(`There is a closing ${tokens[cursor].value} without a matching ${tokens[cursor].value === "]" ? "[" : "("}.`);
  if (!group.operations.some((op) => operationCounts(op).output > 0))
    throw new PatternSyntaxError("This round has no stitches yet. Add body stitches after any branch.");
  return group.operations;
}

export interface RoundLine {
  kind?: 'row';
  start: number;
  end: number | null;
  instruction: string;
}
/** Accept code notation and the compact printed Rnd 9–16 notation. */
export function readRoundLine(line: string): RoundLine | null {
  const match =
    /^(?:(?:row|rnd|round|r)\.?\s*)?(\d+)(?:\s*[-–—]\s*(\d+))?(?:\s*(\[[^\[\]]+\]))?(?:\s*:\s*|\s+)(.*)$/i.exec(
      line.trimStart(),
    );
  return match
    ? {
        start: Number(match[1]),
        end: match[2] ? Number(match[2]) : null,
        instruction: `${match[3] ? match[3] + " " : ""}${match[4]}`,
        ...(/^\s*row\b/i.test(line) ? {kind: 'row' as const} : {}),
      }
    : null;
}

export function analyzeInstruction(text: string, previousCount?: number, flatRows = false) {
  let instruction = text.split("//")[0].trim();
  instruction=instruction.replace(/\b(\d+)\s*(sc|hdc|dc|tr|dtr)\s+in\s+\d+(?:nd|rd|th)\s+ch\s+from\s+hook(?!\s+and)/gi,(_,n,type)=>`[${n} ${type}] in same st`);
  instruction=instruction.replace(/(sc|hdc|dc|tr|dtr)\s+in\s+\d+(?:nd|rd|th)\s+ch\s+from\s+hook(\s+and\s+in\s+each\s+ch\s+across)?/gi,(_,type,across)=>`${type}${across?' across':''}`);

  const declaredMatch = /\s*(?:\((\d+)\)|→\s*(\d+))\s*$/.exec(instruction);
  const declaredCount = declaredMatch ? Number(declaredMatch[1] ?? declaredMatch[2]) : null;
  if (declaredMatch)
    instruction = instruction.slice(0, declaredMatch.index).trim();
  const duration = /\s+for\s+(\d+)\s+(?:rows?|rounds?|rnds?)\s*$/i.exec(instruction);
  const repeatRounds = duration ? Number(duration[1]) : null;
  if (
    repeatRounds !== null &&
    (!Number.isSafeInteger(repeatRounds) ||
      repeatRounds < 1 ||
      repeatRounds > MAX_ROUNDS)
  )
    throw new PatternSyntaxError(`Use between 1 and ${MAX_ROUNDS} rounds.`);
  if (duration) instruction = instruction.slice(0, duration.index).trim();
  instruction=instruction.replace(/ch\s+(\d+)\s*\(counts as (sc|hdc|dc|tr|dtr)\)/gi,'countedchain($1, $2)');
  const endingTurn=/,\s*((?:ch\s+\d+|\d*\s*ch)(?:\[[^\]]+\])?),\s*turn\s*$/i.exec(instruction);
  if(endingTurn)instruction=instruction.slice(0,endingTurn.index);
  let turning: Operation[] = endingTurn?parseOperations(endingTurn[1]):[];
  if (/\bturn\b/i.test(instruction)) {
    if (!flatRows) throw new PatternSyntaxError('Turning is for flat rows. Start with start: ch 11 and use Row labels.');
    const parts=instruction.split(/\bturn\b/i);
    if(parts.length!==2)throw new PatternSyntaxError('Use one turn at the beginning of a row.');
    const prefix=parts[0].replace(/,\s*$/, '').trim();
    // A row-header color can precede a bare turn without a chain.
    const colorOnly=/^(?:\[[^\]]+\]\s*)+$/.test(prefix);
    turning=prefix?(colorOnly?parseOperations(`${prefix} ch`).slice(0,-1):parseOperations(prefix)):[];
    if(turning.some(op=>typeof op==='string'?op!=='ch':'stitch' in op?op.stitch!=='ch':!('color' in op)))
      throw new PatternSyntaxError('Only turning chains can appear before turn.');
    instruction=parts[1].replace(/^\s*,/, '').trim();
  }
  const joinedRound=/(?:,\s*|\s+)join\s*$/i.test(instruction);
  instruction=instruction.replace(/,?\s*join\s*$/i,'');
  const foundation = /\s+in\s+(?:mc|mr|ring|magic\s+ring)\s*$/i.test(instruction);
  if (foundation)
    instruction = instruction
      .replace(/\s+in\s+(?:mc|mr|ring|magic\s+ring)\s*$/i, "")
      .trim();
  if(!flatRows && /\bacross\b/i.test(instruction))throw new PatternSyntaxError('Use start: ch 11 and Row labels to work across flat rows.');
  instruction = instruction.replace(/\b(?:(\d+)\s*)?(sc|hdc|dc|tr|dtr|slst|ss|bobble|bbl)\s+(?:around|across)\b/gi, (_, written: string|undefined, stitch: string) => {
    if(written)return `${written} ${stitch}`;
    const count = previousCount ?? declaredCount;
    if (count === null || count === undefined || count < 1)
      throw new PatternSyntaxError("An around instruction needs a previous round. Start with a counted foundation such as 6 sc in mr.");
    return `${count} ${stitch}`;
  });
  const yarnPrefix=/^(\[[^\]]+\])\s+/.exec(instruction);
  if(yarnPrefix)instruction=instruction.slice(yarnPrefix[0].length);
  const earlyLoop=/^(BLO|FLO)(?:\s+of\s+Round\s+(\d+))?:\s*/i.exec(instruction);
  if(earlyLoop)instruction=instruction.slice(earlyLoop[0].length);
  instruction=instruction.replace(/,?\s*join\s*$/i,'');
  const motif=/^(.+)\s+(?:around|across)$/i.exec(instruction);
  if(motif) {
    const ops=parseOperations(motif[1]),consumed=ops.reduce((n,op)=>n+operationCounts(op).input,0);
    if(!previousCount||!consumed||previousCount%consumed)throw new PatternSyntaxError('The repeated group must consume the full previous course exactly.');
    instruction=`(${motif[1]}) x${previousCount/consumed}`;
  }
  const loopHeader=earlyLoop;
  let operations = parseOperations(`${yarnPrefix?.[1]??''} ${instruction}`);
  if(loopHeader)operations=loopOperations(operations,loopHeader[1].toUpperCase()==='BLO'?'back':'front');
  return {
    operations,
    endingTurn:!!endingTurn,
    joinedRound,
    parentRoundNumber:loopHeader?.[2]?Number(loopHeader[2]):undefined,
    turning,
    foundation,
    declaredCount,
    repeatRounds,
    inputCount: operations.reduce((n, op) => n + operationCounts(op).input, 0),
    outputCount: operations.reduce((n, op) => n + operationCounts(op).output, 0),
    totalCount: [...turning,...operations].reduce((n, op) => n + operationCounts(op).total, 0),
  };
}

/**
 * Parse circular rounds or chain-based turning rows into a construction graph.
 * IDs/indexes are zero-based; round labels and source lines are one-based.
 * On an error, previously valid rounds remain available, but the invalid round
 * is never silently added to the model.
 */
export function parsePattern(source: string): ParsedPattern {
  const joined=/^[ \t]*start:\s*ch\s*(\d+),?\s*join(?:[ \t]+\[([^\]\n]+)\])?[ \t]*$/im.exec(source);
  if(joined){
    const chains=Number(joined[1]),line=source.slice(0,joined.index).split('\n').length;
    const firstLine=source.split('\n').find(l=>/^(?:Round|Rnd)\s+1\b/i.test(l.trim()))??'';
    const intoHole=/in (?:ring|mr|mc|its hole)/i.test(firstLine);
    const normalized=source.replace(joined[0],'start: magic ring').replace(/^((?:Round|Rnd)\s+1[^:]*:)(.*)$/im,(_,header,body)=>header+(intoHole?body.replace(/in its hole/i,'in ring'):body.replace(/(?:sc|hdc|dc|tr|dtr) around/i,(t:string)=>`${chains} ${t.split(' ')[0]}`).replace(/(\s*→.*)?$/, ' in mr$1')));
    const result=parsePattern(normalized);
    if(!Number.isSafeInteger(chains)||chains<2||chains>1000)result.diagnostics.push({line,severity:'error',message:'Use 2–1000 joined chains.'});
    if(!intoHole&&result.rounds[0]?.outputCount!==chains)result.diagnostics.push({line,severity:'error',message:'A chain tube first round must work each foundation chain.'});
    result.joinedStart={chains,intoHole,line};
    if(result.diagnostics.some(d=>d.severity==='error'))return result;
    const yarns=joined[2]?.split(',').map(c=>resolveYarnColor(c.trim().toLowerCase()));
    if(yarns?.some(c=>!c)){result.diagnostics.push({line,severity:'error',message:'Use valid yarn colors for the joined chain.'});return result;}
    if(yarns&&yarns.length!==chains){result.diagnostics.push({line,severity:'error',message:'Provide one color per foundation chain.'});return result;}
    const firstId=result.stitches.length;
    const foundation:Stitch[]=Array.from({length:chains},(_,i)=>({
      id:firstId+i,round:0,index:i,type:'ch',color:yarns?.[i]??result.rounds[0]?.color??'#f3e8d6',parents:i?[firstId+i-1]:[],previous:i?firstId+i-1:null,
      sourceLine:line,isIncrease:false,auxiliary:{kind:'foundation',step:i+1,count:chains},
    }));
    for(const stitch of result.rounds[0]?.stitches??[])stitch.parents=intoHole?[foundation[Math.floor(stitch.index*chains/result.rounds[0].outputCount)].id]:[foundation[stitch.index].id];
    if(result.rounds[0])result.rounds[0].inputCount=chains;
    result.chainStart={line,stitches:foundation};result.stitches.push(...foundation);
    return result;
  }
  const oval=/^\s*start:\s*ch\s*(\d+)\s+(?:oval|around)(?:[ \t]+\[([^\]\n]+)\])?[ \t]*$/im.exec(source);
  if(oval) {
    const chains=Number(oval[1]);
    const foundationLine=source.slice(0,oval.index).split('\n').length;
    let anchors:number[]|undefined;
    let foundationError:string|undefined;
    const normalized=source.replace(oval[0],'start: magic ring').replace(/^([ \t]*(?:(?:Round|Rnd|R)\.?\s*)?1(?:\s*\[[^\]]+\])?\s*:)\s*(.*)$/im,(_:string,header:string,body:string)=>{
      const clean=body.replace(/,?\s*turn and on the other side of chains\s*:/i,', other side,').replace(/(\d+)\s*sc,?\s+into the last chain/gi,(_:string,n:string)=>'['+Array(Math.min(8000,Number(n))).fill('sc').join(', ')+'] in same st').replace(/\.?\s*\[total\s+(\d+)\]/i,' → $1');
      const sides=clean.split(/,?\s*other side\s*,?/i);
      try {
        const summary=analyzeInstruction(sides.join(', '));
        if(sides.length===2){
          const first=analyzeInstruction(sides[0]),second=analyzeInstruction(sides[1]);
          if(first.inputCount!==chains-1||second.inputCount!==chains-2)throw new Error(`Work ${chains-1} chain positions on the first side and ${chains-2} on the other side; same-stitch groups use one position.`);
          anchors=[];
          for(const [side,ops] of [first.operations,second.operations].entries()) {
            let chain=side===0?chains-2:1;
            for(const op of ops){const count=operationCounts(op);for(let i=0;i<count.output;i++)anchors.push(chain);chain+=(side===0?-1:1)*count.input;}
          }
        }
        const flatten=(ops:Operation[]):Operation[]=>ops.flatMap(op=>typeof op!=='string'&&'same' in op?flatten(op.same):[op]);
        const tokens=flatten(summary.operations).map(op=>typeof op==='string'?op:'color' in op?`[${op.color}]`:'stitch' in op?`${op.stitch}[${op.colors.join(',')}]`:'');
        return header+' '+tokens.join(', ')+' in mr'+(summary.declaredCount!==null?' → '+summary.declaredCount:'');
      }catch(error){foundationError=(error as Error).message;return header+' '+clean;}
    });
    const result=parsePattern(normalized);
    if(!Number.isSafeInteger(chains)||chains<3||chains>1000)result.diagnostics.push({line:foundationLine,severity:'error',message:'An oval foundation needs 3–1000 chains.'});
    if(foundationError)result.diagnostics.push({line:foundationLine+1,severity:'error',message:foundationError});
    if(anchors)result.rounds[0]?.stitches.forEach((stitch,i)=>{stitch.chainIndex=anchors![i];});
    if(Number.isSafeInteger(chains)&&chains>=3&&chains<=1000) {
      const colors=oval[2]?.split(',').map(c=>resolveYarnColor(c.trim()));
      if(colors&&(colors.length!==chains||colors.some(c=>!c)))result.diagnostics.push({line:foundationLine,severity:'error',message:'Foundation colors must contain one valid yarn color per chain.'});
      const base=result.stitches.length;
      const foundation:Stitch[]=Array.from({length:chains},(_,index)=>({id:base+index,round:0,index,type:'ch',color:colors?.[index]??result.stitches[0]?.color??YARN_COLORS.red,parents:index?[base+index-1]:[],previous:index?base+index-1:null,sourceLine:foundationLine,isIncrease:false,auxiliary:{kind:'foundation',step:index+1,count:chains}}));
      result.chainStart={line:foundationLine,stitches:foundation};
      result.stitches.push(...foundation);
      result.rounds[0]?.stitches.forEach(stitch=>{if(stitch.chainIndex!==undefined)stitch.parents=[base+stitch.chainIndex];});
    }
    result.ovalStart={chains,line:foundationLine};
    return result;
  }

  const parsed: ParsedPattern = {
    orientation: "bottom-up",
    rounds: [],
    eyes: [],
    embroidery: [],
    stitches: [],
    diagnostics: [],
    name: "Untitled pattern",
  };
  let color = YARN_COLORS.red;
  let named = false;
  let explicitOrientation = false;
  let coursePrevious: number | null = null;
  const lines = source.split(/\r?\n/);
  const branchPaints: { id: number; color: string; line: number }[] = [];
  const paints: { round: number; index: number; color: string; line: number }[] = [];

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
      if (/^make\b/i.test(line)) {
        const match=/^make:\s*(\d+)$/i.exec(line);
        if(!match || Number(match[1])<1 || Number(match[1])>30)throw new PatternSyntaxError('Use make: followed by a number from 1 to 30.');
        parsed.make=Number(match[1]);continue;
      }
      if (/^edge\b/i.test(line)) {
        const match = /^edge:\s*(auto|open)$/i.exec(line);
        if (!match) throw new PatternSyntaxError('Use edge: open to leave the final round open.');
        parsed.edge = match[1].toLowerCase() as PieceEdge;
        continue;
      }
      const title = /^Pattern name:\s*"(.*)"$/i.exec(line);
      if (title) { parsed.name = title[1]; named = true; continue; }
      if (/^start:/i.test(line) && !/^start:\s*magic ring$/i.test(line)) {
        if(parsed.rounds.length || parsed.chainStart)throw new PatternSyntaxError('Put one chain foundation before the first row.');
        const operations=parseOperations(line.replace(/^start:\s*/i,''));
        if(operations.some(op=>typeof op==='string'?op!=='ch':'stitch' in op?op.stitch!=='ch':!('color' in op)))
          throw new PatternSyntaxError('Use start: ch 11 for a flat chain foundation, or start: magic ring for rounds.');
        const count=operations.reduce((n,op)=>n+operationCounts(op).output,0);
        if(count<2)throw new PatternSyntaxError('A flat foundation needs at least 2 chains: one working chain and one turning chain.');
        const stitches:Stitch[]=[];
        for(const op of operations) {
          if(typeof op!=='string' && 'color' in op){color=op.color;continue;}
          const id=parsed.stitches.length+stitches.length;
          stitches.push({id,round:0,index:stitches.length,type:'ch',color:typeof op!=='string'&&'stitch' in op?op.colors[0]??color:color,
            parents:stitches.length?[id-1]:[],previous:stitches.length?id-1:null,sourceLine:lineNumber,isIncrease:false,
            auxiliary:{kind:'foundation',step:stitches.length+1,count}});
        }
        parsed.chainStart={line:lineNumber,stitches};parsed.construction='rows';parsed.stitches.push(...stitches);
        coursePrevious=stitches.at(-1)!.id;
        continue;
      }
      if (/^start:\s*magic ring$/i.test(line)) {
        if(parsed.chainStart)throw new PatternSyntaxError('Choose one foundation: chain rows or magic-ring rounds.');
        continue;
      }
      if (/^join$/i.test(line)){const last=parsed.rounds.at(-1);if(!last)throw new PatternSyntaxError('Work a round before joining.');last.joined=true;continue;}
      if (/^fasten off$/i.test(line)) continue;
      const branchPaint = /^paint stitch (\d+):\s*(#[a-f0-9]{6})$/i.exec(line);
      if (branchPaint) {
        branchPaints.push({ id: Number(branchPaint[1]) - 1, color: branchPaint[2], line: lineNumber });
        continue;
      }
      if (/^paint\b/i.test(line)) {
        const paint = /^paint\s+(\d+):\s*(.+)$/i.exec(line);
        if (!paint) throw new PatternSyntaxError("Use paint 3: 1=#ffffff, 2=#ff8800.");
        for (const entry of paint[2].split(",")) {
          const match = /^\s*(\d+)=(#[a-f0-9]{6})\s*$/i.exec(entry);
          if (!match) throw new PatternSyntaxError("Paint entries use stitch-number=#rrggbb.");
          paints.push({ round: Number(paint[1]), index: Number(match[1]), color: match[2], line: lineNumber });
        }
        continue;
      }
      if (/^orientation\b/i.test(line)) {
        const match = /^orientation\s+(bottom-up|top-down)$/i.exec(line);
        if (!match) throw new PatternSyntaxError("Use orientation top-down or orientation bottom-up on its own line.");
        parsed.orientation = match[1].toLowerCase() as PatternOrientation;
        explicitOrientation = true;
        continue;
      }
      const embroidery = parseEmbroideryDirective(line, lineNumber);
      if (embroidery) {
        if (parsed.embroidery.length >= MAX_EMBROIDERY) throw new PatternSyntaxError(`Use at most ${MAX_EMBROIDERY} embroidery lines per piece.`);
        parsed.embroidery.push(embroidery);
        continue;
      }
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
      if(roundLine.kind==='row' && !parsed.chainStart)throw new PatternSyntaxError('Start flat rows with a chain foundation, for example start: ch 11.');
      const flatRows=parsed.construction==='rows';
      if(flatRows && roundLine.kind!=='row')throw new PatternSyntaxError('Use Row labels after a chain foundation. Joined-chain rounds are not flat rows.');
      const { operations, turning, foundation, declaredCount, repeatRounds, parentRoundNumber, endingTurn, joinedRound } =
        analyzeInstruction(roundLine.instruction, parsed.rounds.find(r=>r.number===Number(/(?:BLO|FLO)\s+of\s+Round\s+(\d+)/i.exec(roundLine.instruction)?.[1]))?.outputCount ?? parsed.rounds.at(-1)?.outputCount ?? (parsed.chainStart?parsed.chainStart.stitches.length-(Number(/in\s+(\d+)(?:nd|rd|th)\s+ch\s+from\s+hook/i.exec(roundLine.instruction)?.[1]??2)-1):undefined),flatRows);
      if(flatRows && foundation)throw new PatternSyntaxError('Work the first row into the starting chain, without in mr.');
      if(flatRows && roundLine.start===1 && turning.length && !endingTurn)throw new PatternSyntaxError('The starting chain already includes the first turning chain. Use turn from Row 2 onward.');
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
          roundNumber === 1 && !flatRows &&
          operations.some((op) => op === "inc" || op === "dec" || op === "dec3" || op === "sk" || (typeof op !== "string" && "stitch" in op && ["inc", "dec", "dec3", "sk"].includes(op.stitch)))
        )
          throw new PatternSyntaxError(
            "Start with foundation stitches, for example 1: 6 sc in mc (6). Increases and decreases need an existing round.",
          );

        const consumed = operations.reduce((n, op) => n + operationCounts(op).input, 0);
        const produced = operations.reduce((n, op) => n + operationCounts(op).output, 0);
        const totalProduced = [...turning,...operations].reduce((n, op) => n + operationCounts(op).total, 0);
        const increases = operations.filter((op) => op === "inc" || (typeof op !== "string" && "stitch" in op && op.stitch === "inc")).length;
        const decreases = operations.filter((op) => op === "dec" || (typeof op !== "string" && "stitch" in op && op.stitch === "dec")).length;
        if (parsed.stitches.length + totalProduced > MAX_STITCHES)
          throw new PatternSyntaxError(
            `This preview supports up to ${MAX_STITCHES.toLocaleString()} stitches, including branches. Try a smaller pattern.`,
          );
        if (declaredCount !== null && declaredCount !== produced)
          throw new PatternSyntaxError(
            `Round ${roundNumber} makes ${produced} stitches, but its total says (${declaredCount}). Update the instructions or the total.`,
          );
        const parentRound = parentRoundNumber===undefined?parsed.rounds.at(-1):parsed.rounds.find(r=>r.number===parentRoundNumber);
        if(parentRoundNumber!==undefined&&!parentRound)throw new PatternSyntaxError('The referenced round must already exist.');
        const firstType=operations.find(op=>typeof op==='string'||'stitch' in op);
        const firstStitch=typeof firstType==='string'?firstType:firstType&&'stitch' in firstType?firstType.stitch:'sc';
        const skip=Number(/in\s+(\d+)(?:nd|rd|th)\s+ch\s+from\s+hook/i.exec(roundLine.instruction)?.[1]??1)-1 || (({hdc:2,dc:3,tr:4,dtr:5} as Record<string,number>)[firstStitch]??1);
        const foundationParents=parsed.chainStart?.stitches.slice(0,-skip).reverse();
        const parentStitches=parentRound?(flatRows?parentRound.stitches.slice().reverse():parentRound.stitches):foundationParents;
        if(flatRows && !parentRound && consumed!==foundationParents?.length)
          throw new PatternSyntaxError(`Row 1 uses ${consumed} chains, but start: ch ${parsed.chainStart!.stitches.length} leaves ${foundationParents?.length??0} after skipping ${skip} turning chain${skip===1?'':'s'}.`);
        if (parentRound && consumed !== parentRound.outputCount) {
          throw new PatternSyntaxError(
            `Round ${roundNumber} uses ${consumed} stitches, but round ${parentRound.number} has ${parentRound.outputCount}. ${consumed > parentRound.outputCount ? "Remove extra stitches or decreases" : "Add stitches or increases"} so the full previous round is used.`,
          );
        }

        if(parentRoundNumber!==undefined){
          for(const parent of parentStitches??[]) {
            const requested=operations.find(op=>typeof op!=='string'&&'loop' in op);
            const loop=requested&&typeof requested!=='string'&&'loop' in requested?requested.loop:undefined;
            if(!loop || parsed.stitches.some(s=>s.parents.includes(parent.id)&&(!s.loop||s.loop===loop)))throw new PatternSyntaxError('Those loops have already been worked. Choose the free FLO/BLO loops of an earlier round.');
          }
        }
        const round: PatternRound = {
          number: roundNumber,
          ...(joinedRound?{joined:true}:{}),
          color,
          stitches: [],
          inputCount: parentStitches ? consumed : 0,
          outputCount: produced,
          declaredCount,
          increases,
          decreases,
          line: lineNumber,
        };
        let parentCursor = 0;
        const created: Stitch[] = [];
        let previous: number | null = coursePrevious;
        let activeLoop:'front'|'back'|undefined;
        const create = (type: StitchType, parents: number[], isIncrease = false, branch?: Stitch["branch"], auxiliary?: Stitch['auxiliary']) => {
          const id = parsed.stitches.length + created.length;
          const stitch: Stitch = {
            id, round: roundNumber,
            index: branch ? branch.step - 1 : round.stitches.length,
            type, color, parents: [...parents], previous,
            ...(activeLoop?{loop:activeLoop}:{}),
            sourceLine: lineNumber, isIncrease,
            ...(branch ? { branch } : {}),
            ...(auxiliary ? {auxiliary,index:auxiliary.step-1} : {}),
          };
          created.push(stitch);
          if (!branch && !auxiliary) round.stitches.push(stitch);
          previous = id;
          return stitch;
        };
        const turnCount=turning.reduce((n,op)=>n+operationCounts(op).output,0);
        let turnStep=0;
        const createTurning=()=>{for(const op of turning) {
          if(typeof op!=='string'&&'color' in op){color=op.color;continue;}
          const child=create('ch',previous===null?[]:[previous],false,undefined,{kind:'turning',step:++turnStep,count:turnCount});
          if(typeof op!=='string'&&'stitch' in op)child.color=op.colors[0]??color;
        }};
        if(!endingTurn)createTurning();
        for (const operation of operations) {
          activeLoop=typeof operation!=='string'&&'loop' in operation?operation.loop:undefined;
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
              const child = create("ch", [parent], false, { anchor: anchor.id, step, length: chain, returning: false });
              child.color = operation.branch.colors?.[step - 1] ?? color;
              chainStitches.push(child);
            }
            if(operation.branch.back) {
              let cursor=chain-2;
              for(const op of operation.branch.back){
                if(typeof op!=='string'&&'color' in op){color=op.color;continue;}
                const count=operationCounts(op),parents=chainStitches.slice(Math.max(0,cursor-count.input+1),cursor+1).map(s=>s.id);
                const step=cursor+1;cursor-=count.input;
                const children=typeof op!=='string'&&'same' in op?op.same:[op];
                for(const child of children){
                  const type=typeof child==='string'?child:'stitch' in child?child.stitch:null;
                  if(!type||type==='sk')continue;
                  for(let n=0;n<(type==='inc'?2:1);n++){
                    const stitch=create(type==='inc'?'sc':type,parents,type==='inc',{anchor:anchor.id,step,length:chain,returning:true});
                    if(typeof child!=='string'&&'stitch' in child)stitch.color=child.colors[n]??child.colors[0]??color;
                  }
                }
              }
              continue;
            }
            for (let step = slip; step >= 1; step--) {
              const child = create("slst", [chainStitches[step - 1].id], false, { anchor: anchor.id, step, length: chain, returning: true });
              child.color = operation.branch.colors?.[chain + slip - step] ?? color;
            }
            if (!slip) previous = anchor.id;
            continue;
          }
          const same = typeof operation !== "string" && "same" in operation ? operation.same : null;
          if (same && !parentStitches)
            throw new PatternSyntaxError("A same-stitch group needs an existing round to attach to.");
          const typed = typeof operation !== "string" && "stitch" in operation ? operation.stitch : operation;
          const needed = !parentStitches || typed === "ch" ? 0 : typed === "dec3" ? 3 : typed === "dec" ? 2 : 1;
          const parents = parentStitches?.slice(parentCursor, parentCursor + needed).map((stitch) => stitch.id) ?? [];
          parentCursor += needed;
          if(typed==="sk")continue;
          if (same) {
            for (const child of same) {
              activeLoop=typeof child!=='string'&&'loop' in child?child.loop:activeLoop;
              if (typeof child === "string") create(child as StitchType, parents);
              else if ("color" in child) color = child.color;
              else if ("stitch" in child) {
                const result = create(child.stitch as StitchType, parents);
                result.color = child.colors[0] ?? color;
                if(child.countedChain)result.countedChain=child.countedChain;
              }
            }
          } else if (typeof typed === "string") {
            for (let child = 0; child < (typed === "inc" ? 2 : 1); child++) {
              const result = create(typed === "inc" ? "sc" : typed, parents, typed === "inc");
              if (typeof operation !== "string" && "stitch" in operation)
                result.color = operation.colors[operation.colors.length === 1 ? 0 : child] ?? color;
              if(typeof operation!=="string"&&"stitch" in operation&&operation.countedChain)result.countedChain=operation.countedChain;
            }
          }
        }
        if(endingTurn)createTurning();
        round.color = round.stitches[0].color;
        parsed.rounds.push(round);
        parsed.stitches.push(...created);
        coursePrevious = previous;
        if (roundNumber === 1 && !foundation && !flatRows)
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

  for (const paint of branchPaints) {
    const stitch = parsed.stitches[paint.id];
    if (stitch) {
      stitch.patternColor ??= stitch.color;
      stitch.paintSourceLine = paint.line;
      stitch.color = paint.color.toLowerCase();
    }
    else parsed.diagnostics.push({ line: paint.line, severity: "error", message: `Paint references missing stitch ${paint.id + 1}.` });
  }
  for (const paint of paints) {
    const stitch = parsed.rounds[paint.round - 1]?.stitches[paint.index - 1];
    if (stitch) {
      stitch.patternColor ??= stitch.color;
      stitch.paintSourceLine = paint.line;
      stitch.color = paint.color.toLowerCase();
    }
    else parsed.diagnostics.push({ line: paint.line, severity: "error", message: `Paint references missing stitch ${paint.index} in round ${paint.round}.` });
  }
  for (const round of parsed.rounds) round.color = round.stitches[0].color;
  for (const segment of parsed.embroidery) {
    const message = parsed.construction==='rows' && (segment.from.round<1||segment.to.round<1) ? 'Embroidery needs a point on a completed row.' : validateEmbroidery(segment, parsed.rounds, parsed.construction!=='rows' && closesLastRound(parsed.rounds.map(r=>r.outputCount),parsed.edge));
    if (message) parsed.diagnostics.push({ line: segment.line, severity: 'error', message });
  }
  for (const eyes of parsed.eyes) {
    const message = validateEyePair(eyes, parsed.rounds);
    if (message) parsed.diagnostics.push({ line: eyes.line, severity: "error", message });
  }

  // Older saved patterns predate the orientation directive. Eyes in the early
  // rounds identify a head-first construction, so display that end at the top.
  // An explicit user choice always takes precedence over this default.
  if (
    !explicitOrientation && parsed.construction!=='rows' &&
    parsed.eyes.length > 0 &&
    parsed.eyes.every((eyes) =>
      validateEyePair(eyes, parsed.rounds) === null &&
      (eyes.lowerRound + eyes.upperRound) / 2 < (parsed.rounds.length + 1) / 2,
    )
  ) parsed.orientation = "top-down";

  if (
    !parsed.rounds.length &&
    !parsed.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    parsed.diagnostics.push({
      line: 1,
      severity: "warning",
      message: parsed.chainStart?`Add Row 1: ${parsed.chainStart.stitches.length-1} sc across to work into the chain.`:"Start with a foundation round, for example 1: 6 sc in mc (6).",
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
orientation top-down
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
