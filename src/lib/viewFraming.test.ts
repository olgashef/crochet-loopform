import assert from "node:assert/strict";
import test from "node:test";
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { frameModelBounds, initialModelView } from "./viewFraming";
import { buildGeometry } from "./geometry";
import { parsePattern } from "./pattern";

test("initial view keeps the established direction for models without branches", () => {
  const expected = new Vector3(0.95, 0.36, 1.55).normalize();
  assert.ok(initialModelView(null).distanceTo(expected) < 1e-12);
  const model = buildGeometry(parsePattern("1: 6 sc in mr\n2: 6 sc"));
  assert.ok(initialModelView(model, [[-1, 0, 0]]).distanceTo(expected) < 1e-12);
});

test("initial view projects the longest branch sideways and chooses the eye-facing side", () => {
  const model = buildGeometry(parsePattern("1: 24 sc in mr\n2: 6 sc, branch(3 ch), 12 sc, branch(12 ch, 11 slst), 6 sc"));
  const tip = model.points.find((p) => p.branch?.length === 12 && p.branch.step === 12)!;
  const anchor = model.points.find((p) => p.id === tip.branch!.anchor)!;
  const branch = new Vector3().fromArray(tip.position).sub(new Vector3().fromArray(anchor.position));
  branch.y = 0;
  branch.normalize();
  const perpendicular = new Vector3(-branch.z, 0, branch.x);
  for (const sign of [1, -1]) {
    const eyeNormal = perpendicular.clone().multiplyScalar(sign);
    const view = initialModelView(model, [eyeNormal.toArray()]);
    assert.ok(Math.abs(view.dot(branch)) < 1e-12);
    assert.ok(view.dot(eyeNormal) > 0.9);
    assert.ok(view.y > 0);
    assert.ok(Math.abs(view.length() - 1) < 1e-12);
  }
  assert.ok(initialModelView(model).z >= -1e-12);
});

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
