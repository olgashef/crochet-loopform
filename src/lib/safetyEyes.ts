import type { ModelGeometry, ModelPoint, Position } from "./geometry";
import { Vector3 } from 'three';
import type { PatternRound } from "./pattern";
import { DEFAULT_STITCH_WIDTH_MM, PREVIEW_STITCH_WIDTH } from './stitchScale';
import { flatSurface } from './flatGeometry';

export interface SafetyEyePair {
  lowerRound: number;
  upperRound: number;
  /** One-based gaps after these stitches in the lower round. */
  stitches: [number, number];
  /** Preview diameter, in the same relative units as stitch geometry. */
  size: number;
  /** Physical diameter and stitch width; absent for legacy relative sizes. */
  sizeMm?: number;
  stitchWidthMm?: number;
  line: number;
}

export interface SafetyEyePlacement {
  id: string;
  position: Position;
  /** Orient the eye's outward-facing local +Z axis along this unit vector. */
  normal: Position;
  size: number;
  lowerRound: number;
  upperRound: number;
  stitch: number;
}

export function parseEyeDirective(text: string, line: number): SafetyEyePair | null {
  const source = text.split("//")[0].trim();
  if (!/^eyes\b/i.test(source)) return null;
  const match = /^eyes\s+between\s+(\d+)\s+and\s+(\d+)\s+at\s+(\d+)\s*,\s*(\d+)(?:\s+size\s+(\d*\.?\d+)\s*(mm)?(?:\s+stitch\s+(\d*\.?\d+)\s*mm)?)?\s*$/i.exec(source);
  if (!match)
    throw new Error("Use eyes between 5 and 6 at 10, 14 size 8mm stitch 5mm. Positions are gaps after stitches in the lower round.");
  const lowerRound = Number(match[1]);
  const upperRound = Number(match[2]);
  const stitches: [number, number] = [Number(match[3]), Number(match[4])];
  const physical = !!match[6];
  if(match[7] && !physical)throw new Error('Use an eye size in mm when specifying stitch width.');
  const sizeMm = physical ? Number(match[5]) : undefined;
  const stitchWidthMm = physical ? Number(match[7] ?? DEFAULT_STITCH_WIDTH_MM) : undefined;
  const size = physical ? sizeMm! * PREVIEW_STITCH_WIDTH / stitchWidthMm! : match[5] === undefined ? 0.7 : Number(match[5]);
  if (![lowerRound, upperRound, ...stitches].every((n) => Number.isSafeInteger(n) && n >= 1))
    throw new Error("Eye rounds and stitch positions must be positive whole numbers.");
  if (upperRound !== lowerRound + 1)
    throw new Error("Place safety eyes between two adjacent rounds, for example between 5 and 6.");
  if (stitches[0] === stitches[1])
    throw new Error("Choose two different stitch gaps for the safety eyes.");
  const pair:SafetyEyePair = { lowerRound, upperRound, stitches, size, line, ...(physical ? {sizeMm,stitchWidthMm} : {}) };
  const sizeError=validateEyeSize(pair);
  if(sizeError)throw new Error(sizeError);
  return pair;
}

function validateEyeSize(pair:SafetyEyePair):string|null {
  if(pair.sizeMm!==undefined){
    if(!Number.isFinite(pair.sizeMm)||pair.sizeMm<1||pair.sizeMm>40)return 'Eye diameter must be between 1 and 40 mm.';
    if(!Number.isFinite(pair.stitchWidthMm)||pair.stitchWidthMm!<1||pair.stitchWidthMm!>20)return 'Stitch width must be between 1 and 20 mm.';
    const expected=pair.sizeMm*PREVIEW_STITCH_WIDTH/pair.stitchWidthMm!;
    if(!Number.isFinite(pair.size)||Math.abs(pair.size-expected)>1e-9)return 'Eye preview size does not match its millimeter dimensions.';
  } else if(!Number.isFinite(pair.size)||pair.size<0.15||pair.size>2)return 'Safety eye size must be between 0.15 and 2 preview units.';
  return null;
}

export function validateEyePair(pair: SafetyEyePair, rounds: PatternRound[]): string | null {
  if (pair.upperRound !== pair.lowerRound + 1)
    return "Safety eyes must sit between adjacent rounds.";
  const lower = rounds.find((round) => round.number === pair.lowerRound);
  const upper = rounds.find((round) => round.number === pair.upperRound);
  if (!lower || !upper)
    return `Safety eyes need completed rounds ${pair.lowerRound} and ${pair.upperRound}.`;
  if (pair.stitches.some((stitch) => !Number.isSafeInteger(stitch) || stitch < 1 || stitch > lower.stitches.length))
    return `Eye positions must be between 1 and ${lower.stitches.length}, the stitch count of round ${pair.lowerRound}.`;
  if (pair.stitches[0] === pair.stitches[1])
    return "Choose two different stitch gaps for the safety eyes.";
  return validateEyeSize(pair);
}

const TAU = Math.PI * 2;
const radius = (point: ModelPoint, center: Position) =>
  Math.hypot(point.position[0] - center[0], point.position[2] - center[2]);
const angle = (point: ModelPoint, center: Position) =>
  Math.atan2(point.position[2] - center[2], point.position[0] - center[0]);

function surfaceRing(points: ModelPoint[], center: Position) {
  const ring = points.map(point => ({
    theta: (angle(point, center) + TAU) % TAU,
    radius: radius(point, center),
    y: point.position[1],
  })).sort((a, b) => a.theta - b.theta);
  return (theta: number) => {
    const wrapped = (theta % TAU + TAU) % TAU;
    const next = ring.findIndex(point => point.theta > wrapped);
    const index = next < 0 ? ring.length : next;
    const left = ring[(index + ring.length - 1) % ring.length];
    const right = ring[index % ring.length];
    const start = left.theta - (index === 0 ? TAU : 0);
    const end = right.theta + (index === ring.length ? TAU : 0);
    const span = end - start || TAU;
    const fraction = (wrapped - start) / span;
    const r = left.radius + (right.radius - left.radius) * fraction;
    const y = left.y + (right.y - left.y) * fraction;
    const dr = (right.radius - left.radius) / span;
    return {
      position: new Vector3(center[0] + Math.cos(theta) * r, y, center[2] + Math.sin(theta) * r),
      tangent: new Vector3(
        Math.cos(theta) * dr - Math.sin(theta) * r,
        (right.y - left.y) / span,
        Math.sin(theta) * dr + Math.cos(theta) * r,
      ),
    };
  };
}

/** Eye coordinates follow row moves and asymmetric model recentering. */
export function buildSafetyEyes(
  model: ModelGeometry,
  pairs: SafetyEyePair[],
  visibleRounds = Infinity,
): SafetyEyePlacement[] {
  const placements: SafetyEyePlacement[] = [];
  for (const [pairIndex, pair] of pairs.entries()) {
    if (pair.upperRound > visibleRounds) continue;
    const lowerCenter = model.roundCenters.find((round) => round.round === pair.lowerRound)?.center;
    const upperCenter = model.roundCenters.find((round) => round.round === pair.upperRound)?.center;
    if (!lowerCenter || !upperCenter) continue;
    const bodyPoints = (round: number) => model.points
      .filter((point) => point.round === round && !point.branch && !point.auxiliary)
      .sort((a, b) => a.index - b.index);
    const lower = bodyPoints(pair.lowerRound);
    const upper = bodyPoints(pair.upperRound);
    if (!lower.length || !upper.length || validateEyeSize(pair)) continue;
    if(model.construction==='rows') {
      const surface=flatSurface(model);
      const first=Math.min(...lower.map(p=>p.position[0]))-.9*.48,last=Math.max(...lower.map(p=>p.position[0]))+.9*.48;
      for(const [eyeIndex,stitch] of pair.stitches.entries()) {
        const left=lower[stitch-1];if(!left)continue;
        const right=lower[Math.min(stitch,lower.length-1)];
        const x=(left.position[0]+right.position[0])/2;
        const sample=surface.sample((pair.lowerRound+pair.upperRound)/2,(x-first)/(last-first));if(!sample)continue;
        sample.position.z=.24+pair.size*.18;
        placements.push({id:`eyes-${pair.line}-${pairIndex}-${eyeIndex}`,position:sample.position.toArray(),normal:[0,0,1],size:pair.size,lowerRound:pair.lowerRound,upperRound:pair.upperRound,stitch});
      }
      continue;
    }
    const sampleLower = surfaceRing(lower, lowerCenter);
    const sampleUpper = surfaceRing(upper, upperCenter);
    for (const [eyeIndex, stitch] of pair.stitches.entries()) {
      if (!Number.isSafeInteger(stitch) || stitch < 1 || stitch > lower.length) continue;
      const left = lower[stitch - 1];
      const right = lower[stitch % lower.length];
      const startAngle = angle(left, lowerCenter);
      const delta = angle(right, lowerCenter) - startAngle;
      const gap = Math.atan2(Math.sin(delta), Math.cos(delta));
      const eyeAngle = startAngle + gap / 2;
      // Sample both courses at the same angle, including across the seam.
      // Their two surface tangents give the eye's outward axis even on domes,
      // decreases, uneven stitch heights and top-down or moved courses.
      const a = sampleLower(eyeAngle), b = sampleUpper(eyeAngle);
      const outward = new Vector3(Math.cos(eyeAngle), 0, Math.sin(eyeAngle));
      const normal = b.position.clone().sub(a.position).cross(a.tangent.clone().add(b.tangent));
      if (normal.lengthSq() < 1e-18) normal.copy(outward);
      else {
        if (normal.dot(outward) < 0) normal.negate();
        normal.normalize();
      }
      const position = a.position.clone().lerp(b.position, 0.5)
        .addScaledVector(normal, 0.24 + pair.size * 0.18);
      placements.push({
        id: `eyes-${pair.line}-${pairIndex}-${eyeIndex}`,
        position: position.toArray(),
        normal: normal.toArray(),
        size: pair.size,
        lowerRound: pair.lowerRound,
        upperRound: pair.upperRound,
        stitch,
      });
    }
  }
  return placements;
}
