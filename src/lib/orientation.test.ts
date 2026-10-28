import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLES, parsePattern } from "./pattern";
import { buildGeometry } from "./geometry";
import { buildSafetyEyes } from "./safetyEyes";
import { buildStitchFrames } from "./stitchFrame";
import { offsetRows } from "./rowOffsets";
import { setPatternOrientation } from "./orientation";
import { writtenPattern, csvPattern } from "./worksheet";

const critter = EXAMPLES.find((example) => example.id === "orange-critter")!.source;

test("top-down places the critter's head and eyes above its tail without changing topology", () => {
  const top = parsePattern(setPatternOrientation(critter, "top-down"));
  const bottom = parsePattern(setPatternOrientation(critter, "bottom-up"));
  assert.deepEqual(top.diagnostics, []);
  assert.deepEqual(top.stitches, bottom.stitches);
  const model = buildGeometry(top);
  const original = buildGeometry(bottom);
  assert.ok(model.roundCenters[0].center[1] > model.roundCenters.at(-1)!.center[1]);
  assert.deepEqual(model.bounds, original.bounds);
  for (const [index, point] of model.points.entries()) {
    assert.equal(point.position[0], original.points[index].position[0]);
    assert.equal(point.position[1], -original.points[index].position[1]);
    assert.equal(point.position[2], original.points[index].position[2]);
  }
  const eyes = buildSafetyEyes(model, top.eyes);
  const tail = model.points.filter((point) => point.branch);
  assert.equal(eyes.length, 2);
  assert.ok(eyes.every((eye) => eye.position[1] > Math.max(...tail.map((point) => point.position[1]))));
  assert.deepEqual(model.links, original.links);
  const moved = offsetRows(model, { 5: 1, 6: 1 });
  const movedEyes = buildSafetyEyes(moved, top.eyes);
  assert.ok(Math.abs(movedEyes[0].position[1] - eyes[0].position[1] - 1) < 1e-10);
  for (const frame of buildStitchFrames(model.points).values()) {
    assert.ok([...frame.position, ...frame.rotation, ...frame.scale].every(Number.isFinite));
  }
});

test("orientation is explicit, validated, and preserved through pattern exports", () => {
  assert.equal(parsePattern("1: 6 sc in mr").orientation, "bottom-up");
  const source = setPatternOrientation(critter, "top-down");
  assert.equal(setPatternOrientation(source, "top-down"), source);
  assert.equal(setPatternOrientation(source, "bottom-up").match(/orientation/g)!.length, 1);
  assert.equal(parsePattern(writtenPattern(source)).orientation, "top-down");
  assert.ok(csvPattern(source).includes("orientation top-down"));
  assert.equal(parsePattern("orientation sideways\n1: 6 sc in mr").diagnostics[0].severity, "error");
});
