import assert from "node:assert/strict";
import test from "node:test";
import { buildGeometry } from "./geometry";
import { parsePattern, EXAMPLES } from "./pattern";
import { offsetRows } from "./rowOffsets";

test("the reference pattern produces finite, centered geometry and valid links", () => {
  const pattern = parsePattern(EXAMPLES[0].source);
  assert.equal(
    pattern.diagnostics.filter((item) => item.severity === "error").length,
    0,
  );
  const model = buildGeometry(pattern);
  assert.equal(model.points.length, 414);
  assert.equal(model.roundCenters.length, 12);
  assert.ok(model.bounds.width > model.bounds.height);
  assert.ok(model.bounds.depth > 0);
  const ids = new Set(model.points.map((point) => point.id));
  for (const point of model.points)
    assert.ok(point.position.every(Number.isFinite));
  for (const link of model.links) {
    assert.ok(ids.has(link.from));
    assert.ok(ids.has(link.to));
    assert.notEqual(link.from, link.to);
  }
  for (let axis = 0; axis < 3; axis++) {
    const coordinates = model.points.map((point) => point.position[axis]);
    assert.ok(
      Math.abs(Math.min(...coordinates) + Math.max(...coordinates)) < 1e-8,
    );
  }
});

test("topology includes two-parent decrease links and shared-parent increases", () => {
  const pattern = parsePattern(
    "1: 6 sc in mc (6)\n2: 6 inc (12)\n3: 6 dec (6)",
  );
  const model = buildGeometry(pattern);
  const finalRound = model.points.filter((point) => point.round === 3);
  assert.equal(finalRound.length, 6);
  for (const point of finalRound) {
    assert.equal(point.parents.length, 2);
    assert.equal(
      model.links.filter(
        (link) => link.kind === "parent" && link.to === point.id,
      ).length,
      2,
    );
  }
  const increased = model.points.filter((point) => point.round === 2);
  assert.equal(increased[0].parents[0], increased[1].parents[0]);
  assert.notDeepEqual(increased[0].position, increased[1].position);
});

test("taller stitch types increase the course height while keeping counts", () => {
  const sc = buildGeometry(parsePattern("1: 8 sc in mc (8)\n2: 8 sc (8)"));
  const hdc = buildGeometry(parsePattern("1: 8 sc in mc (8)\n2: 8 hdc (8)"));
  assert.equal(sc.points.length, hdc.points.length);
  assert.ok(hdc.bounds.height > sc.bounds.height * 1.3);
  assert.ok(hdc.roundCenters[1].height > sc.roundCenters[1].height);
});

test("layout is deterministic and does not mutate the parsed input", () => {
  const pattern = parsePattern(EXAMPLES[0].source);
  const before = JSON.stringify(pattern);
  assert.deepEqual(buildGeometry(pattern), buildGeometry(pattern));
  assert.equal(JSON.stringify(pattern), before);
});

test("different increase placement affects positions even with the same totals", () => {
  const even = buildGeometry(
    parsePattern("1: 8 sc in mc (8)\n2: [1 sc, 1 inc] rep 4 times (12)"),
  );
  const grouped = buildGeometry(
    parsePattern("1: 8 sc in mc (8)\n2: 4 sc, 4 inc (12)"),
  );
  assert.equal(even.points.length, grouped.points.length);
  assert.notDeepEqual(
    even.points.map((point) => point.position),
    grouped.points.map((point) => point.position),
  );
});

test("empty patterns produce an empty model without invalid bounds", () => {
  assert.deepEqual(buildGeometry(parsePattern("")), {
    points: [],
    links: [],
    bounds: { width: 0, height: 0, depth: 0 },
    roundCenters: [],
  });
});

test("mid-round colors reach preview points and links without changing layout", () => {
  const plain = buildGeometry(parsePattern("1: 4 sc in mr\n2: 4 sc"));
  const colored = buildGeometry(parsePattern("1: [red] 2 sc, [blue] 2 sc in mr\n2: 2 sc, [beige] 2 sc"));
  assert.deepEqual(colored.points.map(({ color: _, ...p }) => p), plain.points.map(({ color: _, ...p }) => p));
  assert.deepEqual(colored.links.map(({ color: _, ...l }) => l), plain.links.map(({ color: _, ...l }) => l));
  assert.equal(new Set(colored.points.map((p) => p.color)).size, 3);
  // Construction links use the new stitch's color. The separate foundation
  // closing link uses the first stitch's color as it returns to the ring start.
  for (const link of colored.links.filter((l) => l.kind === "parent" || l.to === l.from + 1)) {
    assert.equal(link.color, colored.points.find((p) => p.id === link.to)!.color);
  }
  const closure = colored.links.find((l) => l.kind === "course" && l.from === 0 && l.to === 3)!;
  assert.equal(closure.color, colored.points[0].color);
});

test("a chain-out and slip-stitch return extend outside the body without widening its rounds", () => {
  const source = "1: 24 sc in mr\n2: branch(12 ch, 11 slst), 24 sc (24)\n3: 24 sc (24)";
  const parsed = parsePattern(source);
  assert.deepEqual(parsed.diagnostics, []);
  assert.deepEqual(parsed.rounds.map((r) => r.outputCount), [24, 24, 24]);
  const model = buildGeometry(parsed);
  const plain = buildGeometry(parsePattern("1: 24 sc in mr\n2: 24 sc\n3: 24 sc"));
  const branch = model.points.filter((p) => p.branch);
  assert.equal(branch.length, 23);
  assert.equal(branch.filter((p) => p.type === "ch").length, 12);
  assert.equal(branch.filter((p) => p.type === "slst").length, 11);
  assert.deepEqual(model.roundCenters.map((r) => r.radius), plain.roundCenters.map((r) => r.radius));
  for (const body of model.points.filter((p) => !p.branch)) {
    const expected = plain.points.find((p) => p.round === body.round && p.index === body.index)!;
    const center = model.roundCenters.find((r) => r.round === body.round)!.center;
    const expectedCenter = plain.roundCenters.find((r) => r.round === body.round)!.center;
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs((body.position[axis] - center[axis]) - (expected.position[axis] - expectedCenter[axis])) < 1e-10);
    }
  }
  const attachment = model.points.find((p) => p.id === branch[0].branch!.anchor)!;
  const center = model.roundCenters.find((r) => r.round === attachment.round)!.center;
  const bodyRadius = Math.hypot(attachment.position[0] - center[0], attachment.position[2] - center[2]);
  const tip = branch.find((p) => !p.branch!.returning && p.branch!.step === 12)!;
  assert.ok(Math.hypot(tip.position[0] - center[0], tip.position[2] - center[2]) > bodyRadius + 7);
  for (const returned of branch.filter((p) => p.branch!.returning)) {
    const chain = model.points.find((p) => p.id === returned.parents[0])!;
    assert.equal(chain.type, "ch");
    assert.equal(chain.branch!.step, returned.branch!.step);
    const distance = Math.hypot(...returned.position.map((v, axis) => v - chain.position[axis]));
    assert.ok(distance > 0.1 && distance < 0.3);
  }
  const ids = new Set(model.points.map((p) => p.id));
  assert.ok(model.points.every((p) => p.position.every(Number.isFinite)));
  assert.ok(model.links.every((l) => ids.has(l.from) && ids.has(l.to)));
  assert.ok(model.points.every((p, index) => index === 0 || p.id > model.points[index - 1].id));
  const extent = model.points.reduce((max, p) => Math.max(max, Math.abs(p.position[0]), Math.abs(p.position[2])), 0);
  assert.ok(Math.max(model.bounds.width, model.bounds.depth) / 2 >= extent - 1e-8);
});

test("multiple chain branches keep their own attachments and survive row adjustments", () => {
  const parsed = parsePattern("1: 24 sc in mr\n2: 6 sc, branch(4 ch, 3 slst), 12 sc, branch(6 ch), 6 sc\n3: 24 sc");
  assert.deepEqual(parsed.diagnostics, []);
  const model = buildGeometry(parsed);
  const branches = model.points.filter((p) => p.branch);
  assert.equal(branches.length, 13);
  const anchors = new Set(branches.map((p) => p.branch!.anchor));
  assert.equal(anchors.size, 2);
  for (const anchorId of anchors) {
    const anchor = model.points.find((p) => p.id === anchorId)!;
    assert.equal(anchor.round, 2);
    const first = branches.find((p) => p.branch!.anchor === anchorId && p.branch!.step === 1 && !p.branch!.returning)!;
    assert.deepEqual(first.parents, [anchorId]);
    assert.ok(model.links.some((l) => l.from === anchorId && l.to === first.id));
  }
  const moved = offsetRows(model, { 2: 2 });
  for (const point of branches) {
    const changed = moved.points.find((p) => p.id === point.id)!;
    assert.deepEqual(changed.branch, point.branch);
    assert.deepEqual(changed.parents, point.parents);
    assert.deepEqual(changed.position, [point.position[0], point.position[1] + 2, point.position[2]]);
  }
});
