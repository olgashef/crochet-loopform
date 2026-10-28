import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeInstruction,
  EXAMPLES,
  MAX_STITCHES,
  parsePattern,
  YARN_COLORS,
} from "./pattern.ts";

const errors = (source: string) =>
  parsePattern(source).diagnostics.filter((item) => item.severity === "error");

test("inline yarn changes color following stitches and persist across rounds until overridden", () => {
  const result = parsePattern(
    "[sage]\nRnd 1: 2 sc, [BEIGE] 2 sc in mr (4)\nRnd 2: sc, [ #AbC ] 3 sc (4) // inline hex\nRnd 3: 4 sc (4)\n[blue]\nRnd 4: 4 sc (4)",
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.rounds[0].stitches.map((s) => s.color), [
    YARN_COLORS.sage, YARN_COLORS.sage, YARN_COLORS.beige, YARN_COLORS.beige,
  ]);
  assert.deepEqual(result.rounds[1].stitches.map((s) => s.color), [
    YARN_COLORS.beige, "#abc", "#abc", "#abc",
  ]);
  assert.ok(result.rounds[2].stitches.every((s) => s.color === "#abc"));
  assert.ok(result.rounds[3].stitches.every((s) => s.color === YARN_COLORS.blue));
  assert.deepEqual(result.rounds[1].stitches.map((s) => s.parents), [[0], [1], [2], [3]]);
});

test("nested color repeats preserve topology, increase children and decrease parents", () => {
  const plain = parsePattern("1: 8 sc in mr\n2: [sc, inc] × 4\n3: [sc, dec] × 4");
  const colored = parsePattern(
    "1: [red] 8 sc in mr\n2: [[[red] sc, [beige] inc] × 2] × 2\n3: [[#aabbcc] sc, [navy] dec] × 4",
  );
  assert.deepEqual(colored.diagnostics, []);
  assert.deepEqual(colored.stitches.map(({ color: _, ...s }) => s), plain.stitches.map(({ color: _, ...s }) => s));
  assert.deepEqual(colored.rounds[1].stitches.map((s) => s.color),
    Array.from({ length: 4 }, () => [YARN_COLORS.red, YARN_COLORS.beige, YARN_COLORS.beige]).flat());
  assert.deepEqual(colored.rounds[2].stitches.map((s) => s.color),
    Array.from({ length: 4 }, () => ["#aabbcc", YARN_COLORS.navy]).flat());
  assert.equal(colored.rounds[1].color, YARN_COLORS.red);
  assert.equal(colored.rounds[2].color, "#aabbcc");
});

test("grouped rounds repeat color changes with the previous round's final color", () => {
  const result = parsePattern("1: [red] 4 sc in mr\n2–3: 2 sc, [beige] 2 sc\n4: 4 sc [blue]\n5: 4 sc");
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.rounds[1].stitches.map((s) => s.color),
    [YARN_COLORS.red, YARN_COLORS.red, YARN_COLORS.beige, YARN_COLORS.beige]);
  assert.ok(result.rounds.slice(2, 4).every((r) => r.stitches.every((s) => s.color === YARN_COLORS.beige)));
  assert.ok(result.rounds[4].stitches.every((s) => s.color === YARN_COLORS.blue));
});

test("colors do not consume parents or contribute to counts, including chains and stitch aliases", () => {
  const summary = analyzeInstruction("[red] [chain] × 2, [beige] increase, decrease, [blue] ss");
  assert.equal(summary.inputCount, 4);
  assert.equal(summary.outputCount, 6);
  assert.equal(analyzeInstruction("[[red] sc] × 8000").outputCount, MAX_STITCHES);
});

test("invalid inline colors and malformed groups report their line and keep previous valid rounds", () => {
  for (const body of ["[notacolor] 4 sc", "[#12] 4 sc", "[#gggggg] 4 sc", "[constructor] 4 sc", "[__proto__] 4 sc"]) {
    const result = parsePattern(`1: 4 sc in mr\n2: ${body}`);
    assert.equal(result.rounds.length, 1, body);
    assert.equal(result.diagnostics[0].line, 2, body);
    assert.match(result.diagnostics[0].message, /Unknown yarn color/, body);
  }
  assert.match(errors("1: [red]")[0].message, /no stitches/);
  assert.match(errors("1: [[red]] × 2")[0].message, /cannot be empty/);
  assert.match(errors("1: [[red] sc")[0].message, /missing/);
  assert.match(errors("1: [[[red] sc] × 8000] × 8000")[0].message, /too large/);
  assert.match(errors("1: [red] 4 sc in mr (5)")[0].message, /makes 4 stitches/);
  assert.match(errors("1: 4 sc in mr\n2: [red] 2 sc, [beige] sc")[0].message, /uses 3 stitches/);
});

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
  assert.match(errors("1: 6 puff in mc (6)")[0].message, /Unknown stitch/);
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


test("bobble stitches are individual outputs with shared-parent same-stitch groups", () => {
  const result = parsePattern("1: 4 sc in mr\n2: [bobble, sc] in same st, sc, [sc, bbl] in same st, sc (6)");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rounds[1].inputCount, 4);
  assert.equal(result.rounds[1].outputCount, 6);
  assert.deepEqual(result.rounds[1].stitches.map(s => s.type), ["bobble", "sc", "sc", "sc", "bobble", "sc"]);
  assert.deepEqual(result.rounds[1].stitches.map(s => s.parents), [[0], [0], [1], [2], [2], [3]]);
  assert.ok(result.rounds[1].stitches.every(s => !s.isIncrease));
  const repeat = parsePattern("1: 4 sc in mr\n2: [[bobble, sc] in same st] × 4 (8)");
  assert.deepEqual(repeat.diagnostics, []);
  assert.equal(repeat.rounds[1].stitches.filter(s => s.type === "bobble").length, 4);
});

test("chain branches consume no body stitches and return on the chain's actual parents", () => {
  const result = parsePattern("1: 6 sc in mr\n2: branch(12 ch, 11 slst), 6 sc (6)\n3: 6 sc (6)");
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rounds[1].stitches.length, 6);
  assert.equal(result.stitches.length, 41);
  const branch = result.stitches.filter(s => s.branch);
  assert.equal(branch.length, 23);
  assert.equal(branch[0].branch!.anchor, 5);
  assert.deepEqual(branch[0].parents, [5]);
  assert.equal(branch[0].previous, 5);
  assert.equal(branch[12].branch!.step, 11);
  assert.deepEqual(branch[12].parents, [branch[10].id]);
  assert.deepEqual(branch.at(-1)!.parents, [branch[0].id]);
  assert.equal(result.rounds[1].stitches[0].previous, branch.at(-1)!.id);
  assert.deepEqual(result.rounds[2].stitches.map(s => s.parents[0]), result.rounds[1].stitches.map(s => s.id));
  assert.ok(result.stitches.every((s, i) => s.id === i && s.parents.every(p => p < s.id)));
});

test("open and multiple branches anchor to the preceding body stitch and resume body construction", () => {
  const result = parsePattern("1: 4 sc in mr\n2: sc, branch(3 ch), sc, branch(4 ch, 3 slst), 2 sc\n3: 4 sc, branch(2 ch)\n4: 4 sc");
  assert.deepEqual(result.diagnostics, []);
  const round2 = result.rounds[1].stitches;
  assert.equal(result.stitches.find(s => s.branch)?.branch!.anchor, round2[0].id);
  assert.equal(round2[1].previous, round2[0].id);
  assert.equal(result.rounds[3].stitches[0].previous, result.rounds[2].stitches.at(-1)!.id);
  assert.equal(result.stitches.filter(s => s.branch && !s.branch.returning && s.branch.step === 1).length, 3);
});

test("invalid branches and same-stitch groups keep the invalid round out of the model", () => {
  for (const body of ["branch(12 ch, 10 slst), 4 sc", "branch(0 ch), 4 sc", "branch(4 sc), 4 sc", "branch(3 ch, 2 slst, 4 sc", "[dec, sc] in same st, 3 sc", "[ch, sc] in same st, 3 sc", "[inc, sc] in same st, 3 sc"]) {
    const result = parsePattern(`1: 4 sc in mr\n2: ${body}`);
    assert.equal(result.rounds.length, 1, body);
    assert.equal(result.stitches.length, 4, body);
    assert.equal(result.diagnostics[0].line, 2, body);
  }
  assert.match(errors("1: branch(3 ch), 4 sc in mr")[0].message, /existing body stitch/);
  assert.match(errors("1: 4 sc in mr\n2: branch(8000 ch, 7999 slst), 4 sc")[0].message, /too large/);
});

test("the orange critter example preserves its 30 body rounds, two bobbles, eyes and 23 tail stitches", () => {
  const result = parsePattern(EXAMPLES.find(e => e.id === "orange-critter")!.source);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rounds.length, 30);
  assert.equal(result.stitches.filter(s => s.type === "bobble").length, 2);
  assert.equal(result.stitches.filter(s => s.branch).length, 23);
  assert.equal(result.rounds[26].outputCount, 24);
  assert.equal(result.rounds[27].inputCount, 24);
  assert.equal(result.eyes.length, 1);
  assert.deepEqual(result.eyes[0].stitches, [10, 14]);
});
