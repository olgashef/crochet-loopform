import assert from 'node:assert/strict';
import test from 'node:test';
import { migratePatternColors, writePatternColors } from './patternColors';
import { parsePattern } from './pattern';
import { STUDIO_EXAMPLES } from './studio';

const semantic = (source: string) => parsePattern(source).stitches.map(({type,color,parents,previous,isIncrease,branch}) => ({type,color,parents,previous,isIncrease,branch}));
test('legacy colors migrate into compact rounds without changing any model stitches', () => {
  for (const example of STUDIO_EXAMPLES) {
    const next = writePatternColors(example.source);
    assert.doesNotMatch(next, /^\s*paint\b/m);
    assert.deepEqual(semantic(next), semantic(example.source), example.name);
    assert.equal(writePatternColors(next), next);
  }
});
test('whole-round paint becomes its base yarn and partial paint uses inline colors', () => {
  const source = 'Round 1 [#EAC79A]: 6sc in mr → 6\nRound 2-3: sc around → 6\npaint 2: 1=#fff1ea, 2=#fff1ea, 3=#fff1ea, 4=#fff1ea, 5=#fff1ea, 6=#fff1ea\npaint 3: 2=#a96a43';
  const next = migratePatternColors(source);
  assert.match(next, /Round 2 \[#FFF1EA\]: sc around → 6/);
  assert.match(next, /Round 3 \[#EAC79A\]: sc, sc\[#A96A43\], 4sc → 6/);
  assert.deepEqual(semantic(next), semantic(source));
  assert.ok(parsePattern(next).stitches.every(s => s.patternColor === undefined && s.paintSourceLine === undefined));
});
test('individual increase children, same-parent bobbles and branch colors preserve topology', () => {
  const source = 'Round 1: 6sc in mr\nRound 2: inc, [bobble, sc] in same st, branch(3 ch, 2 slst), 4sc\neyes between 1 and 2 at 1, 4 size 6mm stitch 5mm\nembroider dk #303431: 1@10 > 2@30';
  const before = parsePattern(source);
  assert.ok(!before.diagnostics.some(d => d.severity === 'error'));
  const ids = before.stitches.filter((_, i) => i % 2 === 0).map(s => s.id);
  const next = writePatternColors(source, ids, '#abcdef');
  const expected = semantic(source).map((s,i) => ({...s,color:ids.includes(i)?'#abcdef':s.color}));
  assert.deepEqual(semantic(next), expected);
  assert.match(next, /branch\([^)]*\[#[A-F0-9]{6}\]/);
  assert.match(next, /\] in same st/);
  assert.match(next, /eyes between 1 and 2/);
  assert.match(next, /embroider dk #303431/);
});
test('invalid legacy patterns remain intact for manual correction', () => {
  const source = 'Round 1: broken\npaint 1: 1=#ffffff';
  assert.equal(migratePatternColors(source), source);
});
