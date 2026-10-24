import { Box3, MathUtils, Vector3 } from "three";

export interface ViewFrame {
  distance: number;
  target: Vector3;
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
