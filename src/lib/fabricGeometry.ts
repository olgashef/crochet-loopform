import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import type { ModelGeometry, ModelPoint } from './geometry';

const TAU = Math.PI * 2;
interface Ring {
  center: Vector3;
  points: { angle: number; radius: number; point: ModelPoint }[];
}
const angleOf = (x: number, z: number) => (Math.atan2(z, x) + TAU) % TAU;

/**
 * A thin backing beneath the yarn loops, using only the body's existing profile.
 * Pass the row-offset-adjusted model; no shaping, positions, or colors are changed.
 */
export function createFabricGeometry(
  model: ModelGeometry,
  visibleRounds = Infinity,
  inset = 0.16,
): BufferGeometry {
  const byRound = new Map<number, ModelPoint[]>();
  for (const point of model.points) {
    if (point.branch || point.round > visibleRounds) continue;
    const points = byRound.get(point.round) ?? [];
    points.push(point);
    byRound.set(point.round, points);
  }
  const rings: Ring[] = model.roundCenters.flatMap(round => {
    const points = byRound.get(round.round);
    if (!points?.length || round.round > visibleRounds) return [];
    const center = new Vector3().fromArray(round.center);
    return [{ center, points: points.map(point => {
      const x = point.position[0] - center.x;
      const z = point.position[2] - center.z;
      return { angle: angleOf(x, z), radius: Math.hypot(x, z), point };
    }).sort((a, b) => a.angle - b.angle) }];
  });
  const positions: number[] = [];
  const colors: number[] = [];
  const stitchIds: number[] = [];
  const colorCache = new Map<string, Color>();
  const depth = Number.isFinite(inset) ? Math.max(0, inset) : 0.16;

  // Interpolation around the actual rings retains local shaping and unequal
  // stitch heights while a common angle prevents seams at increases/decreases.
  function sample(ring: Ring, angle: number) {
    const theta = (angle % TAU + TAU) % TAU;
    let low = 0, high = ring.points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ring.points[middle].angle <= theta) low = middle + 1;
      else high = middle;
    }
    const right = ring.points[low % ring.points.length];
    const left = ring.points[(low + ring.points.length - 1) % ring.points.length];
    const leftAngle = left.angle - (low === 0 ? TAU : 0);
    const rightAngle = right.angle + (low === ring.points.length ? TAU : 0);
    const fraction = (theta - leftAngle) / (rightAngle - leftAngle || TAU);
    const radius = Math.max(0.02, left.radius + (right.radius - left.radius) * fraction - depth);
    const y = left.point.position[1] + (right.point.position[1] - left.point.position[1]) * fraction;
    return {
      position: new Vector3(ring.center.x + Math.cos(theta) * radius, y, ring.center.z + Math.sin(theta) * radius),
      stitch: (fraction < 0.5 ? left : right).point,
    };
  }
  function triangle(a: Vector3, b: Vector3, c: Vector3, stitch: ModelPoint, outward: Vector3) {
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-18) return;
    if (normal.dot(outward) < 0) [b, c] = [c, b];
    const color=stitch.color;
    let rgb = colorCache.get(color);
    if (!rgb) { rgb = new Color(color); colorCache.set(color, rgb); }
    for (const position of [a, b, c]) {
      positions.push(position.x, position.y, position.z);
      colors.push(rgb.r, rgb.g, rgb.b);
      stitchIds.push(stitch.id);
    }
  }
  function quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, stitch: ModelPoint, outward: Vector3) {
    triangle(a, b, c, stitch, outward);
    triangle(a, c, d, stitch, outward);
  }
  for (let index = 1; index < rings.length; index++) {
    const lower = rings[index - 1], upper = rings[index];
    const segments = Math.max(24, 2 * Math.max(lower.points.length, upper.points.length));
    for (let segment = 0; segment < segments; segment++) {
      const start = segment * TAU / segments, end = (segment + 1) * TAU / segments;
      const a = sample(lower, start).position, b = sample(lower, end).position;
      const c = sample(upper, end).position, d = sample(upper, start).position;
      const left = a.clone().lerp(d, 0.5), right = b.clone().lerp(c, 0.5);
      const middle = (start + end) / 2;
      const outward = new Vector3(Math.cos(middle), 0, Math.sin(middle));
      // Keep yarn changes crisp instead of interpolating unrelated RGB colors.
      quad(a, left, right, b, sample(lower, middle).stitch, outward);
      quad(left, d, c, right, sample(upper, middle).stitch, outward);
    }
  }
  function cap(index: number) {
    const ring = rings[index];
    if (!ring || ring.points.length > 8) return;
    const neighbor = rings[index === 0 ? 1 : index - 1];
    const sign = Math.sign(ring.center.y - (neighbor?.center.y ?? ring.center.y)) || (index === 0 ? -1 : 1);
    const outward = new Vector3(0, sign, 0);
    const center = ring.center.clone();
    const segments = Math.max(24, ring.points.length * 2);
    for (let segment = 0; segment < segments; segment++) {
      const start = segment * TAU / segments, end = (segment + 1) * TAU / segments;
      triangle(center, sample(ring, start).position, sample(ring, end).position, sample(ring, (start + end) / 2).stitch, outward);
    }
  }
  cap(0);
  if (rings.length > 1) cap(rings.length - 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('stitchId', new Float32BufferAttribute(stitchIds, 1));
  geometry.computeVertexNormals();
  if (positions.length) { geometry.computeBoundingBox(); geometry.computeBoundingSphere(); }
  return geometry;
}
