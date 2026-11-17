import type { PatternRound } from './pattern';

export const THREADS = {
  embroidery: { label: 'Embroidery thread', radius: 0.035 },
  dk: { label: 'DK yarn', radius: 0.11 },
  bulky: { label: 'Super bulky yarn', radius: 0.24 },
} as const;
export type ThreadWeight = keyof typeof THREADS;
/** Fractional course and angle in degrees. 0 / last+1 are closed cap centers. */
export interface EmbroideryAnchor { round: number; angle: number }
export interface EmbroiderySegment {
  from: EmbroideryAnchor;
  to: EmbroideryAnchor;
  weight: ThreadWeight;
  color: string;
  line: number;
}
export const MAX_EMBROIDERY = 256;
const rounded = (n: number) => Number(n.toFixed(4));
export function embroideryCode(segment: Omit<EmbroiderySegment, 'line'>) {
  const point = (p: EmbroideryAnchor) => `${rounded(p.round)}@${rounded((p.angle % 360 + 360) % 360)}`;
  return `embroider ${segment.weight} ${segment.color.toLowerCase()}: ${point(segment.from)} > ${point(segment.to)}`;
}
export function parseEmbroideryDirective(text: string, line: number): EmbroiderySegment | null {
  const source = text.split('//')[0].trim();
  if (!/^embroider\b/i.test(source)) return null;
  const match = /^embroider\s+(embroidery|dk|bulky)\s+(#[0-9a-f]{6}):\s*(\d+(?:\.\d+)?)@(-?\d+(?:\.\d+)?)\s*>\s*(\d+(?:\.\d+)?)@(-?\d+(?:\.\d+)?)$/i.exec(source);
  if (!match) throw new Error('Use embroider dk #303431: 5@90 > 6@110. Positions are round@angle in degrees.');
  const segment: EmbroiderySegment = {
    weight: match[1].toLowerCase() as ThreadWeight, color: match[2].toLowerCase(), line,
    from: { round: Number(match[3]), angle: Number(match[4]) },
    to: { round: Number(match[5]), angle: Number(match[6]) },
  };
  for (const point of [segment.from, segment.to]) {
    if (!Number.isFinite(point.round) || point.round > 151 || !Number.isFinite(point.angle) || Math.abs(point.angle) > 360)
      throw new Error('Embroidery positions need a round between 0 and 151 and an angle between -360 and 360.');
    point.angle = (point.angle % 360 + 360) % 360;
  }
  if (segment.from.round === segment.to.round && segment.from.angle === segment.to.angle)
    throw new Error('Choose two different points for an embroidery line.');
  return segment;
}
export function validateEmbroidery(segment: EmbroiderySegment, rounds: PatternRound[], endClosed = true) {
  const last = rounds.at(-1);
  for (const point of [segment.from, segment.to]) {
    if (!last || point.round > last.number + 1 || (point.round < 1 && rounds[0].stitches.length > 8) || (point.round > last.number && (!endClosed || last.stitches.length > 8)))
      return 'Embroidery references a missing round or an open end. Move its points or restore the rounds.';
  }
  return null;
}
