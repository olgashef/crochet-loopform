import assert from "node:assert/strict";
import test from "node:test";
import { buildGeometry } from "./geometry";
import { parsePattern, EXAMPLES } from "./pattern";

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
