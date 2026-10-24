import assert from "node:assert/strict";
import test from "node:test";
import { offsetRows, sanitizeRowOffsets } from "./rowOffsets";
import { buildGeometry } from "./geometry";
import { EXAMPLES, parsePattern } from "./pattern";
import { buildStitchFrames } from "./stitchFrame";
test("moving a row changes exactly its points and center, preserving the original geometry and topology", () => {
  const model = buildGeometry(parsePattern(EXAMPLES[0].source));
  const before = JSON.stringify(model);
  const moved = offsetRows(model, { 9: 1.5 });
  assert.equal(JSON.stringify(model), before);
  assert.equal(moved.points.length, 414);
  assert.deepEqual(moved.links, model.links);
  for (let i = 0; i < model.points.length; i++) {
    const a = model.points[i],
      b = moved.points[i];
    assert.deepEqual(b.position, [
      a.position[0],
      a.position[1] + (a.round === 9 ? 1.5 : 0),
      a.position[2],
    ]);
    assert.deepEqual(b.parents, a.parents);
  }
  const oldCenter = model.roundCenters.find((r) => r.round === 9)!;
  assert.equal(
    moved.roundCenters.find((r) => r.round === 9)!.center[1],
    oldCenter.center[1] + 1.5,
  );
  const restored = offsetRows(model, {});
  assert.deepEqual(restored, model);
});
test("parent-aligned stitch bodies and bounds remain finite after independent rows cross", () => {
  const model = buildGeometry(parsePattern(EXAMPLES[0].source));
  const moved = offsetRows(model, { 9: 10, 10: -5 });
  const frames = buildStitchFrames(moved.points);
  for (const f of frames.values())
    assert.ok(
      [
        ...f.position.toArray(),
        ...f.extent.toArray(),
        ...f.rotation.toArray(),
      ].every(Number.isFinite),
    );
  assert.ok(moved.bounds.height >= model.bounds.height);
});
test("saved shape edits accept only bounded finite offsets on valid row keys", () => {
  assert.deepEqual(
    sanitizeRowOffsets(
      JSON.parse(
        '{"1":2,"2":-1.25,"3":0,"4":"2","151":1,"-1":1,"__proto__":{"x":1}}',
      ),
    ),
    { 1: 2, 2: -1.25 },
  );
  assert.deepEqual(sanitizeRowOffsets({ 1: Infinity, 2: NaN, 3: 1001 }), {});
  assert.deepEqual(sanitizeRowOffsets(null), {});
  assert.deepEqual(sanitizeRowOffsets([]), {});
});
