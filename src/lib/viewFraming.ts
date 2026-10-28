import { Box3, MathUtils, Vector3 } from "three";
import type { ModelGeometry, Position } from "./geometry";

export interface ViewFrame {
  distance: number;
  target: Vector3;
}

/** Start branched models side-on so their longest appendage is visible. */
export function initialModelView(
  model: ModelGeometry | null,
  eyeNormals: Position[] = [],
): Vector3 {
  const fallback = new Vector3(0.95, 0.36, 1.55).normalize();
  if (!model) return fallback;
  const points = new Map(model.points.map((point) => [point.id, point]));
  let longest = new Vector3();
  for (const point of model.points) {
    if (!point.branch || point.branch.returning) continue;
    const anchor = points.get(point.branch.anchor);
    if (!anchor) continue;
    const direction = new Vector3(
      point.position[0] - anchor.position[0],
      0,
      point.position[2] - anchor.position[2],
    );
    if (direction.lengthSq() > longest.lengthSq()) longest = direction;
  }
  if (longest.lengthSq() < 1e-12) return fallback;

  const direction = new Vector3(-longest.z, 0, longest.x).normalize();
  const facing = new Vector3();
  for (const normal of eyeNormals) {
    if (normal.every(Number.isFinite)) facing.add(new Vector3(normal[0], 0, normal[2]));
  }
  if (facing.lengthSq() < 1e-12) facing.set(0, 0, 1);
  let alignment = direction.dot(facing);
  // A front-facing tie has no preferred side; keep a deterministic +z/+x view.
  if (Math.abs(alignment) < 1e-12) alignment = direction.z || direction.x;
  if (alignment < 0) direction.negate();
  direction.y = 0.36;
  return direction.normalize();
}

/** Fits a box to the usable perspective frustum, including near-side corners. */
export function frameModelBounds(
  bounds: Box3,
  width: number,
  height: number,
  viewDirection: Vector3,
  verticalFov: number,
): ViewFrame {
  const viewportWidth = Math.max(width, 1);
  const viewportHeight = Math.max(height, 1);
  const top = Math.min(95, viewportHeight * 0.38);
  const bottom = Math.min(40, viewportHeight * 0.16);
  const side = Math.min(24, viewportWidth * 0.08);
  const tangentY = Math.tan(MathUtils.degToRad(verticalFov) / 2);
  const tangentX = (tangentY * viewportWidth) / viewportHeight;
  const horizontal = tangentX * (1 - (2 * side) / viewportWidth);
  const upper = tangentY * (1 - (2 * top) / viewportHeight);
  const lower = tangentY * (-1 + (2 * bottom) / viewportHeight);
  const vertical = tangentY * (1 - (top + bottom) / viewportHeight);
  const shift = (tangentY * (top - bottom)) / viewportHeight;

  const direction = viewDirection.clone().normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const center = bounds.getCenter(new Vector3());
  let distance = 0.5;

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new Vector3(x, y, z).sub(center);
        const projectedX = corner.dot(right);
        const projectedY = corner.dot(up);
        const depth = corner.dot(direction);
        distance = Math.max(
          distance,
          Math.abs(projectedX) / horizontal + depth,
          (projectedY + upper * depth) / vertical,
          (-projectedY - lower * depth) / vertical,
          depth + 0.25,
        );
      }
    }
  }

  // Leave a little breathing room inside the reserved UI margins.
  distance *= 1.08;
  return { distance, target: center.addScaledVector(up, shift * distance) };
}
