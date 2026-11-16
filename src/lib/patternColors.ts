import { analyzeInstruction, parsePattern, readRoundLine, type Operation } from './pattern';

function compact(tokens: string[]): string {
  // Reuse a repeated shaping motif when the colors repeat too.
  for (let size = 2; size <= tokens.length / 2; size++) {
    if (new Set(tokens).size > 1 && tokens.length % size === 0 && tokens.every((t, i) => t === tokens[i % size]))
      return `(${compact(tokens.slice(0, size))}) x${tokens.length / size}`;
  }
  const runs: string[] = [];
  for (let i = 0; i < tokens.length;) {
    let end = i + 1;
    while (end < tokens.length && tokens[end] === tokens[i]) end++;
    const count = end - i;
    runs.push(count === 1 ? tokens[i] : /^[a-z]+(?:\[[^\]]+\])?$/.test(tokens[i]) ? `${count}${tokens[i]}` : `(${tokens[i]}) x${count}`);
    i = end;
  }
  return runs.join(', ');
}

/** Bake effective model colors into ordinary round instructions, without a paint layer. */
export function writePatternColors(source: string, ids: number[] = [], color?: string): string {
  const pattern = parsePattern(source);
  if (pattern.diagnostics.some(d => d.severity === 'error')) throw new Error('Fix the pattern before painting.');
  const selected = new Set(ids);
  const lines = source.split(/\r?\n/);
  const replacements = new Map<number, string[]>();
  for (const round of pattern.rounds) {
    const parsedLine = readRoundLine(lines[round.line - 1])!;
    const { operations, foundation } = analyzeInstruction(parsedLine.instruction, round.inputCount || undefined);
    const stitches = pattern.stitches.filter(s => s.round === round.number);
    const colors = stitches.map(s => selected.has(s.id) && color ? color.toLowerCase() : s.color.toLowerCase());
    const counts = new Map<string, number>();
    for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
    const base = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    let cursor = 0;
    const colored = (type: string, count = 1) => {
      const yarns = colors.slice(cursor, cursor + count); cursor += count;
      if (yarns.every(c => c === base)) return type;
      const suffix = yarns.every(c => c === yarns[0]) ? yarns[0] : yarns.join(',');
      return `${type}[${suffix.toUpperCase()}]`;
    };
    const render = (ops: Operation[]): string[] => ops.flatMap(op => {
      if (typeof op !== 'string') {
        if ('color' in op) return [];
        if ('same' in op) return [`[${compact(render(op.same))}] in same st`];
        if ('branch' in op) return [`branch(${compact([
          ...Array.from({length: op.branch.chain}, () => colored('ch')),
          ...Array.from({length: op.branch.slip}, () => colored('slst')),
        ])})`];
      }
      const type = typeof op === 'string' ? op : op.stitch;
      return [colored(type, type === 'inc' ? 2 : 1)];
    });
    const tokens = render(operations);
    let body = compact(tokens);
    if (!foundation && tokens.length === round.inputCount && tokens.every(t => t === 'sc')) body = 'sc around';
    const code = `Round ${round.number} [${base.toUpperCase()}]: ${body}${foundation ? ' in mr' : ''} → ${round.outputCount}`;
    replacements.set(round.line, [...(replacements.get(round.line) ?? []), code]);
  }
  const result = lines.flatMap((line, i) => {
    const comment = line.includes('//') ? line.slice(line.indexOf('//')) : '';
    if (/^\s*paint\b/i.test(line)) return comment ? [comment] : [];
    const rounds = replacements.get(i + 1);
    return rounds ? [...rounds.slice(0, -1), rounds.at(-1)! + (comment ? ` ${comment}` : '')] : [line];
  }).join('\n');
  if (result.length > 120000) throw new Error('The colored pattern exceeds the 120,000 character limit.');
  const verified = parsePattern(result);
  if (verified.diagnostics.some(d => d.severity === 'error') || verified.stitches.length !== pattern.stitches.length)
    throw new Error('Could not safely write these stitch colors to the pattern.');
  for (let i = 0; i < pattern.stitches.length; i++) {
    const before = pattern.stitches[i], after = verified.stitches[i];
    const expected = selected.has(before.id) && color ? color.toLowerCase() : before.color.toLowerCase();
    if (after.color !== expected || after.type !== before.type || after.isIncrease !== before.isIncrease
      || after.previous !== before.previous || JSON.stringify(after.parents) !== JSON.stringify(before.parents)
      || JSON.stringify(after.branch) !== JSON.stringify(before.branch))
      throw new Error('Could not safely preserve stitch construction while writing colors.');
  }
  return result;
}

export function migratePatternColors(source: string): string {
  if (!/^\s*paint\b/im.test(source)) return source;
  try { return writePatternColors(source); } catch { return source; }
}
