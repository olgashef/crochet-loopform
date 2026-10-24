import { Matrix4, Quaternion, Vector3 } from "three";
import type { ModelPoint } from "./geometry";
import { getStitchAppearance } from "./stitchAppearance";

export interface StitchFrame {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  /** Axis-aligned extents of the rotated unit ellipsoid. */
  extent: Vector3;
}

export function buildStitchFrames(
  points: ModelPoint[],
  radius = 0.25,
  placePosts = true,
): Map<number, StitchFrame> {
  const byId = new Map(points.map((point) => [point.id, point]));
  const frames = new Map<number, StitchFrame>();
  const up = new Vector3(0, 1, 0);
  for (const point of points) {
    const parents = point.parents
      .map((id) => byId.get(id))
      .filter((p) => p !== undefined);
    const axis = new Vector3(0, 1, 0);
    let span = 0;
    if (parents.length) {
      const center = parents
        .reduce(
          (sum, parent) => sum.add(new Vector3().fromArray(parent.position)),
          new Vector3(),
        )
        .divideScalar(parents.length);
      axis.fromArray(point.position).sub(center);
      span = axis.length();
      if (axis.lengthSq() < 1e-12) axis.copy(up);
      else axis.normalize();
    }
    const rotation = new Quaternion().setFromUnitVectors(up, axis);
    const scale = new Vector3().fromArray(
      getStitchAppearance(point.type).scale,
    );
    const position = new Vector3().fromArray(point.position);
    if (placePosts && span > 1e-6 && ["hdc", "dc", "tr"].includes(point.type)) {
      // A tall stitch is a body on its parent connection, not a bead balanced
      // on the upper row. Keep its tip at the row anchor and its body below it.
      const length = Math.min(2 * radius * scale.y, span * 0.9);
      scale.y = length / (2 * radius);
      position.addScaledVector(axis, -length / 2);
    }
    const matrix = new Matrix4().makeRotationFromQuaternion(rotation).elements;
    const extent = new Vector3(
      Math.hypot(matrix[0] * scale.x, matrix[4] * scale.y, matrix[8] * scale.z),
      Math.hypot(matrix[1] * scale.x, matrix[5] * scale.y, matrix[9] * scale.z),
      Math.hypot(
        matrix[2] * scale.x,
        matrix[6] * scale.y,
        matrix[10] * scale.z,
      ),
    );
    frames.set(point.id, { position, rotation, scale, extent });
  }
  return frames;
}
