export type PieceEdge = 'auto' | 'open';

/** Finishing the yarn does not sew the last round shut. Only a decreasing tip closes automatically. */
export function closesLastRound(counts: number[], edge: PieceEdge = 'auto'): boolean {
  const last = counts.at(-1) ?? 0, previous = counts.at(-2) ?? 0;
  return edge !== 'open' && counts.length > 1 && last <= 8 && last < previous;
}
export function setPieceEdge(source: string, edge: PieceEdge): string {
  const lines=source.split(/\r?\n/).filter(line=>!/^\s*edge\s*:/i.test(line));
  return edge==='auto'?lines.join('\n'):[`edge: open`,...lines].join('\n');
}
