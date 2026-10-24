import assert from "node:assert/strict";
import test from "node:test";
import {
  EXAMPLES,
  MAX_STITCHES,
  parsePattern,
  YARN_COLORS,
} from "./pattern.ts";

const errors = (source: string) =>
  parsePattern(source).diagnostics.filter((item) => item.severity === "error");

test("the screenshot pattern produces all 414 outputs with consistent round counts", () => {
  const result = parsePattern(EXAMPLES[0].source);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.name, "Mushroom cap");
  assert.deepEqual(
    result.rounds.map((round) => round.outputCount),
    [8, 16, 24, 28, 32, 36, 42, 48, 54, 48, 42, 36],
  );
  assert.equal(result.stitches.length, 414);
  assert.equal(
    result.stitches.filter((stitch) => stitch.color === YARN_COLORS.red).length,
    288,
  );
  assert.equal(
    result.stitches.filter((stitch) => stitch.color === YARN_COLORS.beige)
      .length,
    126,
  );
  assert.equal(
    result.rounds[9].stitches.filter((stitch) => stitch.type === "hdc").length,
    42,
  );
});

test("increase children share one parent; decreases preserve two distinct parents", () => {
  const result = parsePattern("1: 3 sc in mc (3)\n2: 3 inc (6)\n3: 3 dec (3)");
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.rounds[1].stitches.map((stitch) => stitch.parents),
    [[0], [0], [1], [1], [2], [2]],
  );
  assert.deepEqual(
    result.rounds[2].stitches.map((stitch) => stitch.parents),
    [
      [3, 4],
      [5, 6],
      [7, 8],
    ],
  );
  assert.ok(result.rounds[1].stitches.every((stitch) => stitch.isIncrease));
  assert.equal(result.stitches[0].previous, null);
  assert.equal(result.stitches[6].previous, 5);
  assert.equal(result.rounds[2].decreases, 3);
});

test("nested repeat groups preserve operation order and output attachment order", () => {
  const result = parsePattern(
    "1: 8 sc in mc (8)\n2: [[sc, inc] rep 2 times] rep 2 times (12)",
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.rounds[1].stitches.map((stitch) => stitch.parents[0]),
    [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7],
  );
});

test("inline comments, compact notation and color hex values remain distinct", () => {
  const result = parsePattern(
    "# Sample\n[#aabbcc]\n1:4sc in mr(4) // four stitches\n[blue]\n2:[sc,inc]rep2times(6)",
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rounds[0].color, "#aabbcc");
  assert.equal(result.rounds[1].color, YARN_COLORS.blue);
  assert.equal(result.rounds[1].line, 5);
});

test("incorrect stated totals do not produce an invalid rendered round", () => {
  const result = parsePattern("1: 6 sc in mc (6)\n2: 6 inc (11)");
  assert.equal(result.rounds.length, 1);
  assert.equal(result.stitches.length, 6);
  assert.match(result.diagnostics[0].message, /makes 12 stitches.*\(11\)/);
  assert.equal(result.diagnostics[0].line, 2);
});

test("both under-consumption and over-consumption identify the affected round", () => {
  assert.match(
    errors("1: 6 sc in mc (6)\n2: 5 sc (5)")[0].message,
    /uses 5 stitches.*has 6/,
  );
  assert.match(
    errors("1: 6 sc in mc (6)\n2: 7 sc (7)")[0].message,
    /uses 7 stitches.*has 6/,
  );
});

test("unsupported stitches and unmatched groups fail clearly", () => {
  assert.match(errors("1: 6 bobble in mc (6)")[0].message, /Unknown stitch/);
  assert.match(
    errors("1: [6 sc in mc (6)")[0].message,
    /Unknown stitch|missing/,
  );
  assert.match(errors("1: 6 sc] in mc (6)")[0].message, /without a matching/);
  assert.match(errors("1: [sc] rep times")[0].message, /repeat needs a number/);
});

test("source text cannot execute code or be silently consumed as valid stitches", () => {
  assert.match(errors("1: 6 sc; alert(1)")[0].message, /Unexpected/);
  assert.match(errors("1: sc garbage")[0].message, /Unknown stitch/);
  assert.match(errors("1: eval(4)")[0].message, /Unknown stitch/);
});

test("large repeats and the cumulative stitch budget stop before expansion grows unbounded", () => {
  assert.match(
    errors(`1: ${MAX_STITCHES + 1} sc in mc`)[0].message,
    /counts must be between/,
  );
  assert.match(
    errors("1: [[sc] rep 8000 times] rep 8000 times")[0].message,
    /too large/,
  );
  assert.match(
    errors("1: 4001 sc in mc\n2: 4001 sc")[0].message,
    /up to 8,000 stitches/,
  );
});

test("foundation operations and consecutive row numbering are explicit", () => {
  assert.match(errors("1: 6 inc (12)")[0].message, /foundation stitches/);
  assert.match(
    errors("1: 6 sc in mc\n2: 6 sc in mc")[0].message,
    /only start round 1/,
  );
  assert.match(errors("1: 6 sc in mc\n3: 6 sc")[0].message, /Expected round 2/);
  const implicit = parsePattern("1: 6 sc (6)");
  assert.equal(implicit.rounds.length, 1);
  assert.equal(implicit.diagnostics[0].severity, "warning");
});

test("all bundled examples are complete and internally consistent", () => {
  for (const example of EXAMPLES) {
    const result = parsePattern(example.source);
    assert.deepEqual(result.diagnostics, [], example.id);
    assert.ok(
      result.stitches.every((stitch) =>
        stitch.parents.every((parent) => parent < stitch.id),
      ),
      example.id,
    );
  }
});

test("empty input stays usable and directs the author toward a foundation", () => {
  const result = parsePattern("");
  assert.deepEqual(result.rounds, []);
  assert.equal(result.diagnostics[0].severity, "warning");
  assert.match(result.diagnostics[0].message, /foundation round/);
});

test("object prototype names cannot masquerade as stitches or yarn colors", () => {
  assert.match(errors("1: constructor in mc (1)")[0].message, /Unknown stitch/);
  assert.match(
    errors("[constructor]\n1: 6 sc in mc (6)")[0].message,
    /Unknown yarn color/,
  );
  assert.match(
    errors("[__proto__]\n1: 6 sc in mc (6)")[0].message,
    /Unknown yarn color/,
  );
});
