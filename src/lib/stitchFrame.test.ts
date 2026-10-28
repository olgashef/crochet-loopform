import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { buildGeometry, type ModelPoint } from "./geometry";
import { EXAMPLES, parsePattern } from "./pattern";
import { buildStitchFrames } from "./stitchFrame";
import { createBobbleGeometry } from "./bobbleGeometry";
import { getStitchAppearance } from "./stitchAppearance";

test("tall beads follow actual parent connections on the curved reference model", () => {
  const model = buildGeometry(
    parsePattern(EXAMPLES[0].source.replaceAll("hdc", "dc")),
  );
  const frames = buildStitchFrames(model.points);
  const byId = new Map(model.points.map((p) => [p.id, p]));
  const tall = model.points.filter((p) => p.type === "dc");
  assert.equal(tall.length, 42);
  let tilted = 0;
  for (const point of tall) {
    const parent = byId.get(point.parents[0])!;
    const expected = new Vector3()
      .fromArray(point.position)
      .sub(new Vector3().fromArray(parent.position))
      .normalize();
    const actual = new Vector3(0, 1, 0).applyQuaternion(
      frames.get(point.id)!.rotation,
    );
    assert.ok(actual.distanceTo(expected) < 1e-10);
    if (Math.abs(actual.y) < 0.99) tilted++;
  }
  assert.ok(tilted > 30, "the curved band must not retain world-upright beads");
  assert.equal(model.points.length, 414);
});

test("two-parent stitches use their midpoint and rotated bounds contain the bead", () => {
  const make = (
    id: number,
    position: [number, number, number],
    parents: number[],
  ): ModelPoint => ({
    id,
    position,
    parents,
    type: "dc",
    round: 1,
    index: id,
    color: "#2255bb",
    previous: null,
    isIncrease: false,
  });
  const points = [
    make(0, [-2, 0, 0], []),
    make(1, [2, 0, 0], []),
    make(2, [1, 2, 1], [0, 1]),
  ];
  const frame = buildStitchFrames(points).get(2)!;
  assert.ok(
    new Vector3(0, 1, 0)
      .applyQuaternion(frame.rotation)
      .distanceTo(new Vector3(1, 2, 1).normalize()) < 1e-10,
  );
  for (let i = 0; i < 80; i++) {
    const sample = new Vector3(
      Math.sin(i) * Math.cos(i * 0.7),
      Math.cos(i),
      Math.sin(i) * Math.sin(i * 0.7),
    )
      .multiply(frame.scale)
      .applyQuaternion(frame.rotation);
    assert.ok(Math.abs(sample.x) <= frame.extent.x + 1e-10);
    assert.ok(Math.abs(sample.y) <= frame.extent.y + 1e-10);
    assert.ok(Math.abs(sample.z) <= frame.extent.z + 1e-10);
  }
});

test("foundation, coincident and missing parents have finite upright frames", () => {
  const model = buildGeometry(parsePattern("1: 6 sc in mc (6)\n2: 6 dc (6)"));
  model.points[6].position = [...model.points[0].position];
  model.points[7].parents = [9999];
  const frames = buildStitchFrames(model.points);
  for (const id of [0, 6, 7]) {
    const frame = frames.get(id)!;
    assert.ok(
      new Vector3(0, 1, 0)
        .applyQuaternion(frame.rotation)
        .distanceTo(new Vector3(0, 1, 0)) < 1e-10,
    );
    assert.ok(
      [...frame.rotation.toArray(), ...frame.extent.toArray()].every(
        Number.isFinite,
      ),
    );
  }
});

test("tall stitch bodies sit on the connection below their row anchor at every display thickness", () => {
  const model = buildGeometry(
    parsePattern(EXAMPLES[0].source.replaceAll("hdc", "dc")),
  );
  const byId = new Map(model.points.map((p) => [p.id, p]));
  for (const radius of [0.15, 0.25, 0.4125]) {
    const frames = buildStitchFrames(model.points, radius);
    for (const point of model.points.filter((p) => p.type === "dc")) {
      const frame = frames.get(point.id)!;
      const axis = new Vector3(0, 1, 0).applyQuaternion(frame.rotation);
      const upper = frame.position
        .clone()
        .addScaledVector(axis, radius * frame.scale.y);
      const lower = frame.position
        .clone()
        .addScaledVector(axis, -radius * frame.scale.y);
      const anchor = new Vector3().fromArray(point.position);
      const parent = new Vector3().fromArray(
        byId.get(point.parents[0])!.position,
      );
      assert.ok(
        upper.distanceTo(anchor) < 1e-10,
        "the upper tip must meet the row line",
      );
      assert.ok(lower.distanceTo(parent) < anchor.distanceTo(parent));
      assert.ok(
        lower.clone().sub(parent).dot(anchor.clone().sub(parent)) > 0,
        "body must not extend past the parent row",
      );
      assert.ok(
        lower.clone().sub(parent).cross(axis).length() < 1e-10,
        "body and connector must share the same axis",
      );
    }
  }
  const structure = buildStitchFrames(model.points, 0.062, false);
  for (const point of model.points)
    assert.ok(
      structure
        .get(point.id)!
        .position.distanceTo(new Vector3().fromArray(point.position)) < 1e-10,
    );
});

test("bobble clusters protrude outward from the body, independently of external chain bounds", () => {
  const point = (id: number, x: number, z: number): ModelPoint => ({
    id, round: 3, index: id, position: [x, 0, z], type: id === 0 ? "bobble" : "sc",
    color: "#d89455", parents: [], previous: null, isIncrease: false,
  });
  const body = [point(0, 2, 0), point(1, 0, 2), point(2, -2, 0), point(3, 0, -2)];
  const frames = buildStitchFrames(body);
  const bobble = frames.get(0)!;
  assert.ok(bobble.position.x > body[0].position[0]);
  assert.ok(new Vector3(0, 0, 1).applyQuaternion(bobble.rotation).distanceTo(new Vector3(1, 0, 0)) < 1e-10);
  assert.deepEqual(frames.get(1)!.position.toArray(), body[1].position);
  assert.ok(bobble.scale.z > frames.get(1)!.scale.z);
  assert.equal(getStitchAppearance("bobble").abbreviation, "BBL");

  const translation = new Vector3(10, 3, -7);
  const moved = body.map((p) => ({ ...p, position: new Vector3().fromArray(p.position).add(translation).toArray() as [number, number, number] }));
  const branch = point(4, 100, 0) as ModelPoint & { branch: { anchor: number; step: number; length: number; returning: boolean } };
  branch.branch = { anchor: 0, step: 1, length: 1, returning: false };
  const shifted = buildStitchFrames([...moved, branch]).get(0)!;
  assert.ok(shifted.position.distanceTo(bobble.position.clone().add(translation)) < 1e-10);
  assert.ok(shifted.rotation.angleTo(bobble.rotation) < 1e-10);
  const structure = buildStitchFrames(body, 0.062, false).get(0)!;
  assert.deepEqual(structure.position.toArray(), body[0].position);
});

test("closed bobble surface has three grooves and fits its conservative selection bounds", () => {
  const geometry = createBobbleGeometry();
  const positions = geometry.getAttribute("position");
  let narrow = 0;
  let full = 0;
  for (let index = 0; index < positions.count; index++) {
    const sample = new Vector3().fromBufferAttribute(positions, index);
    assert.ok(sample.length() <= 1 + 1e-6);
    if (Math.abs(sample.y) < 1e-6) {
      if (sample.length() < 0.8) narrow++;
      if (sample.length() > 0.99) full++;
    }
  }
  assert.ok(narrow >= 3 && full >= 3, "bobble must have repeated lobes, not a smooth SC sphere");
  assert.ok(geometry.getAttribute("normal").array.every(Number.isFinite));
  assert.ok(geometry.boundingSphere!.radius <= 1 + 1e-6);
  geometry.dispose();
});
