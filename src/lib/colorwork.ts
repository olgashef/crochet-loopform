import { writePatternColors } from './patternColors';
import { parsePattern, type ParsedPattern } from './pattern';
export type ColorScope = 'Stitch' | 'Multi' | 'Patch' | 'Round' | 'Whole piece';
export function colorSelection(pattern: ParsedPattern, id: number, scope: ColorScope): number[] {
  const seed = pattern.stitches.find(s => s.id === id);
  if (!seed) return [];
  if (scope === 'Whole piece') return pattern.stitches.map(s => s.id);
  if (scope === 'Round') return pattern.stitches.filter(s=>s.round===seed.round&&!s.branch).map(s=>s.id);
  if (scope !== 'Patch') return [id];
  const adjacency = new Map<number, Set<number>>();
  const connect = (a: number, b: number) => { if (!adjacency.has(a)) adjacency.set(a, new Set()); adjacency.get(a)!.add(b); };
  for (const round of pattern.rounds) for (const s of round.stitches) {
    const next=pattern.construction==='rows'?round.stitches[s.index+1]:round.stitches[(s.index+1)%round.stitches.length];
    const neighbors = [...s.parents, ...(next?[next.id]:[])];
    for (const n of neighbors) { connect(s.id, n); connect(n, s.id); }
  }
  for (const s of pattern.stitches.filter(s => s.branch||s.auxiliary)) for (const n of s.parents) {connect(s.id,n);connect(n,s.id);}
  const byId = new Map(pattern.stitches.map(s => [s.id, s]));
  const found = new Set([id]); const queue = [id];
  for (let i = 0; i < queue.length; i++) for (const n of adjacency.get(queue[i]) ?? []) {
    if (!found.has(n) && byId.get(n)?.color.toLowerCase() === seed.color.toLowerCase()) { found.add(n); queue.push(n); }
  }
  return [...found];
}
/** Keep construction instructions intact, including increases and nested repeats. */
export function paintStitches(source: string, ids: number[], color: string): string {
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error('Choose a six-digit hex color.');
  return writePatternColors(source, ids, color);
}

/** Accept copied hex values without converting through rendered/lighted pixels. */
export function normalizeYarnColor(value:string):string|null {
  const hex=value.trim().replace(/^#/,'');
  if(/^[a-f0-9]{6}$/i.test(hex))return `#${hex.toLowerCase()}`;
  if(/^[a-f0-9]{3}$/i.test(hex))return `#${[...hex].map(c=>c+c).join('').toLowerCase()}`;
  return null;
}

/** Remove selected paint overrides; leave written yarn, structure and other paint intact. */
export function restorePatternColors(source:string,ids?:number[]):string {
  const pattern=parsePattern(source);
  if(pattern.diagnostics.some(d=>d.severity==='error'))throw new Error('Fix the pattern before restoring colors.');
  const selected=ids===undefined?null:new Set(ids);
  return source.split(/\r?\n/).flatMap(line=>{
    const commentAt=line.indexOf('//');
    const code=commentAt<0?line:line.slice(0,commentAt);
    const comment=commentAt<0?'':line.slice(commentAt);
    const branch=/^\s*paint stitch (\d+):/i.exec(code);
    if(branch){
      if(selected&&!selected.has(Number(branch[1])-1))return [line];
      return comment?[comment]:[];
    }
    const round=/^(\s*paint\s+(\d+):\s*)(.+?)\s*$/i.exec(code);
    if(!round)return [line];
    const entries=round[3].split(',');
    const remaining=entries.filter(entry=>{
      const index=Number(entry.trim().split('=')[0])-1;
      const stitch=pattern.rounds[Number(round[2])-1]?.stitches[index];
      return selected&&stitch&&!selected.has(stitch.id);
    });
    if(remaining.length===entries.length)return [line];
    if(!remaining.length)return comment?[comment]:[];
    return [round[1]+remaining.map(s=>s.trim()).join(', ')+(comment?' '+comment:'')];
  }).join('\n');
}
