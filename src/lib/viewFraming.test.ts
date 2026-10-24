import assert from "node:assert/strict";
import test from "node:test";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { frameModelBounds } from "./viewFraming";

test("wide and tall stitch bounds fit below the title in desktop and mobile views", () => {
  const direction = new Vector3(0.95, 0.36, 1.55).normalize();
  const boxes = [
    new Box3(new Vector3(-2, -14, -2), new Vector3(2, 14, 2)),
    new Box3(new Vector3(-9, -2, -9), new Vector3(9, 2, 9)),
    new Box3(new Vector3(-0.25, -0.78, -0.25), new Vector3(0.25, 0.78, 0.25)),
  ];
  for (const bounds of boxes)
    for (const [width, height] of [
      [860, 440],
      [360, 420],
      [500, 250],
    ]) {
      const frame = frameModelBounds(bounds, width, height, direction, 36);
      const camera = new PerspectiveCamera(36, width / height, 0.01, 10000);
      camera.position
        .copy(frame.target)
        .addScaledVector(direction, frame.distance);
      camera.lookAt(frame.target);
      camera.updateMatrixWorld();
      assert.ok(Number.isFinite(frame.distance));
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const projected = new Vector3(x, y, z).project(camera);
            const pixelX = ((projected.x + 1) * width) / 2;
            const pixelY = ((1 - projected.y) * height) / 2;
            assert.ok(
              pixelX >= 24 && pixelX <= width - 24,
              `x=${pixelX}, width=${width}`,
            );
            assert.ok(
              pixelY >= 95 && pixelY <= height - 40,
              `y=${pixelY}, height=${height}`,
            );
          }
    }
});
