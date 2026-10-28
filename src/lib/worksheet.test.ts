import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeInstruction,
  EXAMPLES,
  parsePattern,
  readRoundLine,
} from "./pattern";
import {
  csvPattern,
  deleteWorksheetRow,
  editWorksheetRow,
  insertWorksheetRow,
  pasteWorksheetRows,
  worksheetInstruction,
  writtenPattern,
} from "./worksheet";
const sample = EXAMPLES.find((e) => e.id === "seven")!.source;
test("CSV export preserves yarn, comments and ranges with freshly calculated totals", () => {
  const csv = csvPattern('# My "hat", small\n[red]\nRnd 1: 7 sc in mr (999)\nRnd 2–4: 7 sc // soft, warm\n[beige]\nRnd 5: [sc, inc] × 3, sc');
  assert.equal(csv, '\uFEFF"Round","Instructions","Total","Yarn","Notes"\r\n' +
    '"","","","","My ""hat"", small"\r\n' +
    '"","","","red",""\r\n' +
    '"Rnd 1","7 sc in mr","7","red",""\r\n' +
    '"Rnd 2–4","7 sc for 3 rounds","7","red","soft, warm"\r\n' +
    '"","","","beige",""\r\n' +
    '"Rnd 5","[sc, inc] × 3, sc","10","beige",""\r\n');
});
test("CSV export keeps unfinished edits without totals and escapes spreadsheet formulas", () => {
  const csv = csvPattern('# =HYPERLINK("example")\nRnd 1: unfinished\nRnd 2: 7 sc');
  assert.ok(csv.includes('"\'=HYPERLINK(""example"")"'));
  assert.ok(csv.includes('"Rnd 1","unfinished","","red",""'));
  assert.ok(csv.includes('"Rnd 2","7 sc","7","red",""'));
  assert.equal(csvPattern(''), '\uFEFF"Round","Instructions","Total","Yarn","Notes"\r\n');
});
test("worksheet edits and text exports preserve inline colors and grouped-round stitch colors", () => {
  const source = "[red]\nRnd 1: 4 sc in mr\nRnd 2–3: [red] 2 sc, [beige] 2 sc\nRnd 4: 4 sc";
  const edited = editWorksheetRow(source, 2, "[blue] 2 sc, [red] 2 sc in mr (999)");
  assert.equal(worksheetInstruction(edited.split("\n")[1]), "[blue] 2 sc, [red] 2 sc in mr");
  const exported = writtenPattern(edited);
  assert.match(exported, /Rnd 1: \[blue\] 2 sc, \[red\] 2 sc in mr \(4\)/);
  assert.match(exported, /Rnd 2–3: \[red\] 2 sc, \[beige\] 2 sc for 2 rounds \(4\)/);
  const before = parsePattern(edited);
  const after = parsePattern(exported);
  assert.deepEqual(before.diagnostics, []);
  assert.deepEqual(after.diagnostics, []);
  assert.deepEqual(after.stitches, before.stitches);
});

test("CSV preserves inline markers, lists used yarns and carries final colors to following rows", () => {
  const csv = csvPattern("[red] // base\n1: 4 sc in mr\n2–3: sc, [beige] 3 sc\n4: 4 sc [blue]\n5: 4 sc");
  assert.ok(csv.includes('"","","","red","base"'));
  assert.ok(csv.includes('"Rnd 2–3","sc, [beige] 3 sc for 2 rounds","4","red; beige",""'));
  assert.ok(csv.includes('"Rnd 4","4 sc [blue]","4","beige",""'));
  assert.ok(csv.includes('"Rnd 5","4 sc","4","blue",""'));
  const repeated = csvPattern("1: 4 sc in mr\n2–3: sc, [beige] 3 sc [blue]");
  assert.ok(repeated.includes('"red; beige; blue"'));
});
test("printed Rnd notation expands the 16-round sample into correctly counted stitches and original source locations", () => {
  const parsed = parsePattern(sample);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.rounds.length, 16);
  assert.equal(parsed.stitches.length, 630);
  assert.deepEqual(
    parsed.rounds.map((r) => r.outputCount),
    [7, 14, 21, 28, 35, 42, 42, 49, ...Array(8).fill(49)],
  );
  const rangeLine =
    sample.split("\n").findIndex((l) => l.includes("Rnd 9")) + 1;
  assert.ok(
    parsed.rounds
      .slice(8)
      .every(
        (r) =>
          r.line === rangeLine &&
          r.stitches.every((s) => s.sourceLine === rangeLine),
      ),
  );
  assert.deepEqual(parsePattern(sample.replaceAll(": ", " ")).diagnostics, []);
});
test("Unicode multipliers, compact multipliers and nested repeats share stitch semantics", () => {
  assert.equal(analyzeInstruction("[sc, inc] × 7").outputCount, 21);
  assert.equal(analyzeInstruction("[sc, inc]x7").outputCount, 21);
  assert.equal(analyzeInstruction("[[sc, inc] × 2] × 3").outputCount, 18);
});
test("a hold suffix alone infers a range and contradictory or excessive ranges fail clearly", () => {
  assert.equal(
    parsePattern("Rnd 1: 7 sc in mr\nRnd 2: 7 sc for 8 rounds").rounds.length,
    9,
  );
  for (const source of [
    "Rnd 1: 7 sc in mr\nRnd 2–9: 7 sc for 7 rounds",
    "Rnd 1: 7 sc in mr\nRnd 2–200: 7 sc",
    "Rnd 1: 7 sc in mr\nRnd 2: 7 sc for 0 rounds",
  ])
    assert.ok(
      parsePattern(source).diagnostics.some((d) => d.severity === "error"),
    );
});
test("the actual Rnd8 from the image makes 47, consumes 41 and never silently becomes 49", () => {
  const body = "2 sc, [5 sc, inc] × 6, 3 sc";
  const counts = analyzeInstruction(body);
  assert.equal(counts.outputCount, 47);
  assert.equal(counts.inputCount, 41);
  const broken = sample.replace("2 sc, inc, [5 sc, inc] × 6, 3 sc", body);
  const result = parsePattern(broken);
  assert.equal(result.rounds.length, 7);
  assert.match(result.diagnostics.at(-1)!.message, /uses 41.*has 42/);
});
test("worksheet edits preserve typed spaces and all yarn/comments while automatically dropping stale counts", () => {
  const source =
    "# Test\n[red]\n1: 7 sc in mr (7)\n// band\n[beige]\n2: 7 sc (7)";
  const next = editWorksheetRow(source, 6, "7 sc ");
  assert.ok(next.endsWith("Rnd 2: 7 sc "));
  assert.equal(worksheetInstruction(next.split("\n")[5]), "7 sc ");
  assert.ok(next.includes("// band\n[beige]"));
  assert.ok(!next.includes("(7)"));
  assert.deepEqual(parsePattern(next).diagnostics, []);
});
test("changing hold lengths renumbers later rounds and preserves explicit old ranges", () => {
  const source = "Rnd 1: 7 sc in mr\nRnd 2–9: 7 sc\nRnd 10: 7 sc";
  const next = editWorksheetRow(source, 2, "7 sc for 3 rounds");
  assert.ok(next.includes("Rnd 2–4:"));
  assert.ok(next.includes("Rnd 5:"));
  assert.equal(parsePattern(next).rounds.length, 5);
  assert.equal(worksheetInstruction("Rnd 2–9: 7 sc (7)"), "7 sc for 8 rounds");
});
test("spreadsheet paste replaces a full pattern and computes totals rather than trusting pasted counts", () => {
  const pasted = pasteWorksheetRows(
    EXAMPLES[0].source,
    5,
    "Rnd 1\t7 sc in mr\t(7)\nRnd 2\t7 inc\t(999)\nRnd 3-5\t14 sc for 3 rounds\t(14)",
  );
  const result = parsePattern(pasted);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.rounds.length, 5);
  assert.deepEqual(
    result.rounds.map((r) => r.outputCount),
    [7, 14, 14, 14, 14],
  );
  const instructionsOnly = pasteWorksheetRows(
    "Rnd 1: 7 sc in mr\nRnd 2: ",
    2,
    "7 sc\t(7)",
  );
  assert.ok(instructionsOnly.endsWith("Rnd 2: 7 sc"));
  assert.equal(parsePattern(instructionsOnly).rounds.length, 2);
});
test("written export adds truthful totals, preserves ranges and can be reimported with identical topology", () => {
  const output = writtenPattern(sample);
  assert.match(output, /Rnd 3: \[sc, inc\] × 7 \(21\)/);
  assert.match(output, /Rnd 9–16: 49 sc for 8 rounds \(49\)/);
  const before = parsePattern(sample),
    after = parsePattern(output);
  assert.deepEqual(after.diagnostics, []);
  assert.deepEqual(
    after.rounds.map((r) => r.outputCount),
    before.rounds.map((r) => r.outputCount),
  );
  assert.deepEqual(
    after.stitches.map((s) => s.parents),
    before.stitches.map((s) => s.parents),
  );
});
test("inserting and deleting worksheet rows renumber consecutive labels without losing sections", () => {
  const source = "# A\n[sage]\nRnd 1: 7 sc in mr\nRnd 2: 7 sc";
  const added = insertWorksheetRow(source, 3);
  assert.ok(added.includes("Rnd 2: \nRnd 3: 7 sc"));
  const removed = deleteWorksheetRow(added, 4);
  assert.equal(removed, source);
  assert.equal(readRoundLine("Rnd 9–16\t49 sc for 8 rounds")!.end, 16);
});

test("worksheet paste is bounded before large row lists are rendered", () => {
  assert.throws(
    () => pasteWorksheetRows("", 1, Array(151).fill("1 sc").join("\n")),
    /150 worksheet rows/,
  );
  assert.throws(() => pasteWorksheetRows("", 1, "x".repeat(120001)), /120,000/);
  assert.equal(
    pasteWorksheetRows("Rnd 1: 7 sc in mr", 1, "\t\n"),
    "Rnd 1: 7 sc in mr",
  );
});
