import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createFabricGeometry } from './fabricGeometry';
import type { ModelGeometry } from './geometry';
import type { EmbroideryAnchor } from './embroidery';

const TAU = Math.PI * 2;
const wrap = (angle: number) => (angle % TAU + TAU) % TAU;

/** A smooth surface through body stitches, independent of tails and bobbles. */
export function embroiderySurface(model: ModelGeometry) {
  const rings = model.roundCenters.map(course => ({
    round: course.round, center: new Vector3().fromArray(course.center),
    points: model.points.filter(p => p.round === course.round && !p.branch).map(p => ({
      angle: wrap(Math.atan2(p.position[2] - course.center[2], p.position[0] - course.center[0])),
      radius: Math.hypot(p.position[0] - course.center[0], p.position[2] - course.center[2]),
      y: p.position[1],
    })).sort((a, b) => a.angle - b.angle),
  })).filter(r => r.points.length);
  const first = rings[0], last = rings.at(-1);
  const minimum = first?.points.length <= 8 ? 0 : 1;
  const maximum = last ? last.round + (last.points.length <= 8 ? 1 : 0) : 0;
  function ringSample(index: number, angle: number) {
    const ring = rings[index];
    if (!ring) return null;
    const theta = wrap(angle);
    let right = ring.points.findIndex(p => p.angle > theta);
    if (right < 0) right = ring.points.length;
    const a = ring.points[(right + ring.points.length - 1) % ring.points.length];
    const b = ring.points[right % ring.points.length];
    const start = a.angle - (right === 0 ? TAU : 0);
    const end = b.angle + (right === ring.points.length ? TAU : 0);
    const t = (theta - start) / (end - start || TAU);
    const r = a.radius + (b.radius - a.radius) * t;
    return new Vector3(ring.center.x + Math.cos(theta) * r, a.y + (b.y - a.y) * t, ring.center.z + Math.sin(theta) * r);
  }
  function position(round: number, angle: number): Vector3 | null {
    if (!first || !last || round < minimum || round > maximum) return null;
    if (round < 1) return first.center.clone().lerp(ringSample(0, angle)!, round);
    if (round > last.round) return ringSample(rings.length - 1, angle)!.lerp(last.center, round - last.round);
    const index = Math.floor(round) - 1;
    const a = ringSample(index, angle);
    const b = ringSample(Math.min(index + 1, rings.length - 1), angle);
    return a && b ? a.lerp(b, round - Math.floor(round)) : null;
  }
  function sample(anchor: EmbroideryAnchor, lift = 0) {
    const angle = anchor.angle * Math.PI / 180;
    const p = position(anchor.round, angle);
    if (!p) return null;
    const along = position(Math.min(maximum, anchor.round + 0.001), angle)!
      .sub(position(Math.max(minimum, anchor.round - 0.001), angle)!);
    const around = position(anchor.round, angle + 0.001)!.sub(position(anchor.round, angle - 0.001)!);
    const normal = along.cross(around);
    const direction = Math.sign((last?.center.y ?? 1) - (first?.center.y ?? 0)) || 1;
    if (direction < 0) normal.negate();
    if (normal.lengthSq() < 1e-18) normal.set(0, anchor.round <= 1 ? -direction : direction, 0);
    normal.normalize();
    return { position: p.addScaledVector(normal, lift), normal };
  }
  function pick(hit: Vector3): EmbroideryAnchor | null {
    if (!first) return null;
    let closest: EmbroideryAnchor | null = null, distance = Infinity;
    // Fit each course strip at the clicked angle. This also handles shifted rows.
    for (let round = minimum; round < maximum; round++) {
      const center = rings[Math.max(0, Math.min(rings.length - 1, round - 1))].center;
      const angle = Math.atan2(hit.z - center.z, hit.x - center.x);
      const a = position(round, angle)!, b = position(round + 1, angle)!;
      const delta = b.clone().sub(a);
      const t = Math.max(0, Math.min(1, hit.clone().sub(a).dot(delta) / (delta.lengthSq() || 1)));
      const d = a.addScaledVector(delta, t).distanceToSquared(hit);
      if (d < distance) { distance = d; closest = { round: round + t, angle: wrap(angle) * 180 / Math.PI }; }
    }
    return closest;
  }
  let projectionMesh: Mesh | null = null;
  const ray = new Raycaster();
  function project(point: Vector3, outward: Vector3) {
    if (!projectionMesh) {
      projectionMesh = new Mesh(createFabricGeometry(model, Infinity, 0), new MeshBasicMaterial({side: DoubleSide}));
      projectionMesh.updateMatrixWorld();
    }
    const bounds = projectionMesh.geometry.boundingSphere;
    if (!bounds) return null;
    const distance = bounds.radius * 2 + point.distanceTo(bounds.center) + 1;
    ray.set(point.clone().addScaledVector(outward, distance), outward.clone().negate());
    return ray.intersectObject(projectionMesh, false)[0]?.point ?? null;
  }
  function dispose() {
    projectionMesh?.geometry.dispose();
    (projectionMesh?.material as MeshBasicMaterial | undefined)?.dispose();
    projectionMesh = null;
  }
  return { sample, pick, project, dispose, maximum };
}
