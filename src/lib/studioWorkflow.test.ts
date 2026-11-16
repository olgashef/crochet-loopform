import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePattern } from './pattern';
import { colorSelection, paintStitches } from './colorwork';
import { editWorksheetRow } from './worksheet';
import { STARTER } from './studio';
import { buildGeometry } from './geometry';
import { createFabricGeometry } from './fabricGeometry';
const topology = (source: string) => parsePattern(source).stitches.map(({id,parents,type,isIncrease}) => ({id,parents,type,isIncrease}));
test('reference notation supports ranges, around, colors and both repeat orders', () => {
  const pattern = parsePattern(`Pattern name: "Color test"
start: magic ring
Round 1 [#ffffff]: 6 sc in ring → 6
Round 2: inc x6 → 12
Round 3: 6x (sc, inc[,#ff8800]) → 18
Round 4-5 [#112233]: sc around → 18
fasten off`);
  assert.deepEqual(pattern.diagnostics, []);
  assert.equal(pattern.stitches.length, 72);
  assert.equal(pattern.rounds[2].stitches.filter(s=>s.color==='#ff8800').length,6);
  assert.equal(pattern.rounds[2].stitches[1].parents[0],pattern.rounds[2].stitches[2].parents[0]);
  assert.ok(pattern.rounds[4].stitches.every(s=>s.color==='#112233'));
});
test('painting an increase child preserves every stitch and its parents on reload', () => {
  const before = parsePattern(STARTER);
  const child = before.rounds[1].stitches[1];
  const source = paintStitches(STARTER,[child.id],'#ff8800');
  const after = parsePattern(source);
  assert.deepEqual(after.diagnostics,[]);
  assert.deepEqual(topology(source),topology(STARTER));
  assert.equal(after.stitches[child.id].color,'#ff8800');
  assert.notEqual(after.stitches[child.id-1].color,'#ff8800');
  assert.equal(after.rounds[9].stitches[17].color,'#f3e8d6');
});
test('patch selection follows connected yarn and round selection includes exactly one course', () => {
  const pattern = parsePattern(STARTER);
  const seed = pattern.rounds[9].stitches[17].id;
  const patch = colorSelection(pattern,seed,'Patch');
  assert.equal(patch.length,14);
  assert.equal(colorSelection(pattern,seed,'Round').length,36);
  assert.ok(patch.every(id => pattern.stitches[id].color==='#f3e8d6'));
});
test('branch yarn paints and survives a subsequent body color edit', () => {
  const source = '1: 6 sc in mr\n2: sc, branch(3 ch, 2 slst), 5 sc';
  const branch = parsePattern(source).stitches.find(s=>s.branch)!;
  const first = paintStitches(source,[branch.id],'#ff8800');
  const second = paintStitches(first,[0],'#112233');
  assert.equal(parsePattern(second).stitches[branch.id].color,'#ff8800');
  assert.equal(colorSelection(parsePattern(source),0,'Whole piece').length,17);
  assert.deepEqual(topology(second),topology(source));
});
test('worksheet editing keeps arrow counts and grouped starter rounds valid', () => {
  const parsed = parsePattern(STARTER);
  const next = editWorksheetRow(STARTER,parsed.rounds[2].line,'(sc, inc) x6');
  assert.deepEqual(parsePattern(next).diagnostics,[]);
  assert.deepEqual(topology(next),topology(STARTER));
});
test('finished fabric is finite, colored, supports partial playback, and does not change stitches', () => {
  const model = buildGeometry(parsePattern(STARTER));
  const snapshot = JSON.stringify(model);
  const geometry = createFabricGeometry(model);
  assert.ok(geometry.getAttribute('position').count>0);
  for (const key of ['position','normal','color']) assert.ok([...geometry.getAttribute(key).array].every(Number.isFinite));
  assert.equal(geometry.getAttribute('position').count, geometry.getAttribute('color').count);
  const partial = createFabricGeometry(model,5);
  assert.ok(partial.getAttribute('position').count<geometry.getAttribute('position').count);
  assert.equal(JSON.stringify(model),snapshot);
  geometry.dispose(); partial.dispose();
});
