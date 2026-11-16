import { CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';
import type { ModelGeometry } from './geometry';
import { THREADS, type EmbroiderySegment } from './embroidery';
import { embroiderySurface } from './embroiderySurface';

/** Connect Cartesian endpoints; only depth changes to keep the stitch on the fabric. */
export function embroideryPath(model: ModelGeometry, segment: EmbroiderySegment, thickness = 1, sharedSurface?: ReturnType<typeof embroiderySurface>) {
  const surface = sharedSurface ?? embroiderySurface(model);
  try {
    const radius = THREADS[segment.weight].radius;
    const a = surface.sample(segment.from), b = surface.sample(segment.to);
    if (!a || !b) return [];
    const chord = b.position.clone().sub(a.position);
    if (chord.lengthSq() < 1e-12) return [];
    const direction = chord.clone().normalize();
    // A fixed projection direction prevents polar-coordinate arcs, especially
    // across a crown. Keep it perpendicular to the straight endpoint chord.
    const outward = a.normal.clone().add(b.normal);
    outward.addScaledVector(direction, -outward.dot(direction));
    if (outward.lengthSq() < 1e-10) {
      outward.copy(a.normal).addScaledVector(direction, -a.normal.dot(direction));
      if (outward.lengthSq() < 1e-10) outward.crossVectors(direction, new Vector3(0, 1, 0));
      if (outward.lengthSq() < 1e-10) outward.crossVectors(direction, new Vector3(1, 0, 0));
    }
    outward.normalize();
    const points: Vector3[] = [];
    const lift = 0.30 * thickness + radius * 0.65;
    const steps = Math.min(160, Math.max(16, Math.ceil(chord.length() * 12)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const straight = a.position.clone().addScaledVector(chord, t);
      const point = i === 0 || i === steps ? straight : surface.project(straight, outward) ?? straight;
      points.push(point.addScaledVector(outward, lift));
    }
    return points;
  } finally {
    if (!sharedSurface) surface.dispose();
  }
}
export function createEmbroideryMesh(model: ModelGeometry, segments: EmbroiderySegment[], thickness = 1, visibleRounds = Infinity, preview = false) {
  const group = new Group();
  const surface = embroiderySurface(model);
  for (const segment of segments) {
    const last = model.roundCenters.at(-1)?.round ?? 0;
    if (Math.ceil(Math.min(last, Math.max(segment.from.round, segment.to.round))) > visibleRounds) continue;
    const points = embroideryPath(model, segment, thickness, surface);
    if (points.length < 2 || points.every(p => p.distanceToSquared(points[0]) < 1e-10)) continue;
    const geometry = new TubeGeometry(new CatmullRomCurve3(points, false, 'centripetal'), points.length * 2, THREADS[segment.weight].radius, 8, false);
    const material = new MeshStandardMaterial({color: segment.color, roughness: 0.88, transparent: preview, opacity: preview ? 0.65 : 1});
    const thread = new Mesh(geometry, material);
    thread.name = `embroidery-${segment.line}`;
    group.add(thread);
  }
  surface.dispose();
  return group;
}
