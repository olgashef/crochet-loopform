import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { paintStitches, restorePatternColors } from './colorwork';

const written = `Pattern name: "Color precedence"
start: magic ring
orientation top-down
Round 1 [#FFF1EA]: 6 sc in mr
Round 2-8: sc around
Round 9 [#84A950]: 2sc, sc[#B83D3E], 3sc
Round 10 [#7FA44E]: sc around
Round 11 [#FFF1EA]: sc around
fasten off`;
const source = written + '\n\npaint 9: 1=#FFF1EA, 3=#F3E8D6\npaint 11: 2=#F3E8D6';

test('painted stitches expose both written and effective colors to the model', () => {
  const pattern = parsePattern(source);
  assert.deepEqual(pattern.diagnostics, []);
  const stitch = pattern.rounds[10].stitches[1];
  assert.equal(stitch.color, '#f3e8d6');
  assert.equal(stitch.patternColor, '#fff1ea');
  assert.equal(stitch.paintSourceLine, source.split('\n').length);
  const model = buildGeometry(pattern);
  assert.equal(model.points[stitch.id].color, stitch.color);
  assert.equal(model.points[stitch.id].patternColor, stitch.patternColor);
  assert.equal(model.points[stitch.id].paintSourceLine, stitch.paintSourceLine);
  assert.equal(pattern.rounds[8].stitches[2].patternColor, '#b83d3e');
  assert.equal(pattern.rounds[10].stitches[0].patternColor, undefined);
});

test('restoring written colors recovers green, inline red and cream without changing construction', () => {
  const restored = parsePattern(restorePatternColors(source));
  assert.deepEqual(restored, parsePattern(written));
  assert.equal(restored.rounds[8].stitches[0].color, '#84a950');
  assert.equal(restored.rounds[8].stitches[2].color, '#b83d3e');
  assert.equal(restored.rounds[10].stitches[1].color, '#fff1ea');
});

test('restoring one round preserves the other paint and restoring no stitches is a no-op', () => {
  const pattern = parsePattern(source);
  const restored = restorePatternColors(source, pattern.rounds[10].stitches.map(s => s.id));
  assert.equal(parsePattern(restored).rounds[10].stitches[1].color, '#fff1ea');
  assert.deepEqual(parsePattern(restored).rounds[8].stitches, pattern.rounds[8].stitches);
  assert.equal(restorePatternColors(source, []), source);
  assert.equal(restorePatternColors(written), written);
});

test('restoring a stitch removes every duplicate override but preserves neighbors and comments', () => {
  const duplicate = source + '\npaint 11: 2=#123456, 3=#abcdef // keep this note';
  const pattern = parsePattern(duplicate);
  const stitch = pattern.rounds[10].stitches[1];
  assert.equal(stitch.patternColor, '#fff1ea');
  assert.equal(stitch.color, '#123456');
  const restored = restorePatternColors(duplicate, [stitch.id]);
  assert.equal(parsePattern(restored).stitches[stitch.id].color, '#fff1ea');
  assert.equal(parsePattern(restored).rounds[10].stitches[2].color, '#abcdef');
  assert.ok(restored.includes('// keep this note'));
  assert.ok(restorePatternColors(duplicate).includes('// keep this note'));
});

test('branch paint has written-color provenance and can be restored independently', () => {
  const base = '1 [#fff1ea]: 6 sc in mr\n2: sc, branch(3 ch, 2 slst), 5 sc';
  const branch = parsePattern(base).stitches.find(s => s.branch)!;
  const painted = paintStitches(paintStitches(base, [branch.id], '#123456'), [0], '#abcdef');
  const before = parsePattern(painted);
  assert.equal(buildGeometry(before).points.find(p => p.id === branch.id)?.patternColor, '#fff1ea');
  const restored = parsePattern(restorePatternColors(painted, [branch.id]));
  assert.equal(restored.stitches[branch.id].color, '#fff1ea');
  assert.equal(restored.stitches[0].color, '#abcdef');
  assert.deepEqual(restored.stitches.map(({id, parents, type}) => ({id, parents, type})), before.stitches.map(({id, parents, type}) => ({id, parents, type})));
});

test('editing written yarn retains deliberate paint while updating its recorded base color', () => {
  const changed = source.replace('Round 11 [#FFF1EA]', 'Round 11 [#112233]');
  const stitch = parsePattern(changed).rounds[10].stitches[1];
  assert.equal(stitch.color, '#f3e8d6');
  assert.equal(stitch.patternColor, '#112233');
  assert.equal(parsePattern(restorePatternColors(changed)).rounds[10].stitches[1].color, '#112233');
  assert.throws(() => restorePatternColors('Round 1: invalid\npaint 1: 1=#112233'), /Fix the pattern/);
});
