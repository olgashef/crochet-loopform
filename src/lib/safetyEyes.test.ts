import assert from "node:assert/strict";
import test from "node:test";
import { buildGeometry, type Position } from "./geometry";
import { parsePattern } from "./pattern";
import { offsetRows } from "./rowOffsets";
import { buildSafetyEyes, parseEyeDirective, validateEyePair } from "./safetyEyes";
import { saveSafetyEyeTemplate } from './safetyEyeTemplate';

const source = "1: 6 sc in mr\n2: 6 inc\n3: [sc, inc] × 6\n4: [sc, inc, sc] × 6\n5: 24 sc\n6: 24 sc";
const pair = parseEyeDirective("eyes between 5 and 6 at 10, 14 size 0.8", 9)!;

// Remove the eye's seating offset to inspect its actual fabric attachment.
const anchor = (eye: ReturnType<typeof buildSafetyEyes>[number]) =>
  eye.position.map((value, i) => value - eye.normal[i] * (0.24 + eye.size * 0.18));

test('eyes follow expanding and closing surfaces in both orientations, including the first-round seam', () => {
  const base = buildGeometry(parsePattern('1: 6 sc in mr\n2: 6 inc'));
  const firstPair = { ...pair, lowerRound: 1, upperRound: 2, stitches: [2, 6] as [number, number] };
  for (const direction of [-1, 1]) for (const radii of [[1, 2], [2, 1], [2, 2]]) {
    const dy = direction * 0.6;
    const model = {
      ...base,
      points: base.points.map(point => {
        const theta = point.index * 2 * Math.PI / (point.round === 1 ? 6 : 12);
        return { ...point, position: [Math.cos(theta) * radii[point.round - 1], (point.round - 1) * dy, Math.sin(theta) * radii[point.round - 1]] as Position };
      }),
      roundCenters: base.roundCenters.map(round => ({ ...round, center: [0, (round.round - 1) * dy, 0] as Position })),
    };
    const eyes = buildSafetyEyes(model, [firstPair]);
    assert.equal(eyes.length, 2);
    for (const eye of eyes) {
      const theta = (eye.stitch - 0.5) * 2 * Math.PI / 6;
      const slope = -(radii[1] - radii[0]) / dy;
      const length = Math.hypot(1, slope);
      const expected = [Math.cos(theta) / length, slope / length, Math.sin(theta) / length];
      expected.forEach((value, i) => assert.ok(Math.abs(eye.normal[i] - value) < 1e-10));
      const surface = anchor(eye);
      assert.ok(Math.abs(surface[1] - dy / 2) < 1e-10);
      assert.ok(Math.abs(Math.hypot(surface[0], surface[2]) - (radii[0] + radii[1]) / 2) < 1e-10);
      assert.ok(Math.abs(Math.hypot(...eye.normal) - 1) < 1e-10);
    }
  }
});

test('millimeter eye sizes retain physical measurements and scale with stitch width',()=>{
  const physical=parseEyeDirective('eyes between 5 and 6 at 10, 14 size 8mm stitch 5mm',9)!;
  assert.equal(physical.sizeMm,8);
  assert.equal(physical.stitchWidthMm,5);
  assert.equal(physical.size,1.44);
  assert.deepEqual(parseEyeDirective('eyes between 5 and 6 at 10, 14 size 8 mm',9),physical);
  const fine=parseEyeDirective('eyes between 5 and 6 at 10, 14 size 8mm stitch 2.5mm',9)!;
  assert.equal(fine.size,physical.size*2);
  const model=buildGeometry(parsePattern(source));
  const eyes=buildSafetyEyes(model,[fine]);
  assert.equal(eyes.length,2);
  assert.equal(eyes[0].size,2.88);
  for(const dimensions of ['0mm','41mm','8mm stitch 0mm','8mm stitch 21mm','0.8 stitch 5mm','8cm'])assert.throws(()=>parseEyeDirective(`eyes between 5 and 6 at 10, 14 size ${dimensions}`,1));
  assert.equal(buildSafetyEyes(model,[{...physical,size:NaN}]).length,0);
});

test('the safety-eye template adds one portable instruction without altering stitches or paint',()=>{
  const painted=source+'\npaint 5: 1=#abcdef';
  const next=saveSafetyEyeTemplate(painted,{lowerRound:5,stitches:[10,14],sizeMm:8,stitchWidthMm:5});
  assert.ok(next.startsWith(painted));
  assert.ok(next.endsWith('eyes between 5 and 6 at 10, 14 size 8mm stitch 5mm'));
  const parsed=parsePattern(next);
  assert.deepEqual(parsed.diagnostics,[]);
  assert.deepEqual(parsed.stitches,parsePattern(painted).stitches);
  assert.equal(parsed.eyes[0].sizeMm,8);
  assert.equal(buildSafetyEyes(buildGeometry(parsed),parsed.eyes).length,2);
  assert.equal(parsePattern(JSON.parse(JSON.stringify({source:next})).source).eyes[0].sizeMm,8);
});

test('editing an eye pair preserves its comment and rejects stale placement edits',()=>{
  const old=source+'\neyes between 5 and 6 at 10, 14 size 0.8 // face';
  const draft={lowerRound:4,stitches:[9,13] as [number,number],sizeMm:10,stitchWidthMm:5};
  const editing={line:7,text:old.split('\n')[6]};
  const next=saveSafetyEyeTemplate(old,draft,editing);
  const parsed=parsePattern(next);
  assert.equal(parsed.eyes.length,1);
  assert.equal(parsed.eyes[0].lowerRound,4);
  assert.equal(parsed.eyes[0].sizeMm,10);
  assert.ok(next.endsWith('// face'));
  assert.throws(()=>saveSafetyEyeTemplate(old.replace('size 0.8','size 1'),draft,editing),/changed/);
});

test('template validation prevents invalid gaps, absent rounds and excess pairs before source changes',()=>{
  const draft={lowerRound:5,stitches:[10,14] as [number,number],sizeMm:8,stitchWidthMm:5};
  assert.throws(()=>saveSafetyEyeTemplate(source,{...draft,stitches:[10,10]}),/different/);
  assert.throws(()=>saveSafetyEyeTemplate(source,{...draft,stitches:[10,25]}),/between 1 and 24/);
  assert.throws(()=>saveSafetyEyeTemplate(source,{...draft,lowerRound:6}),/completed rounds/);
  assert.throws(()=>saveSafetyEyeTemplate(source,{...draft,sizeMm:NaN}));
  assert.throws(()=>saveSafetyEyeTemplate(source+'\nRound 7: invalid',draft),/pattern errors/);
  const full=source+'\n'+Array(16).fill('eyes between 5 and 6 at 10, 14 size 8mm').join('\n');
  assert.throws(()=>saveSafetyEyeTemplate(full,draft),/at most 16/);
});

test("safety-eye directives accept explicit positions and optional sizes with clear validation", () => {
  assert.deepEqual(pair, { lowerRound: 5, upperRound: 6, stitches: [10, 14], size: 0.8, line: 9 });
  assert.equal(parseEyeDirective("eyes between 5 and 6 at 10, 15", 1)!.size, 0.7);
  assert.equal(parseEyeDirective("Rnd 1: 6 sc in mr", 1), null);
  for (const text of [
    "eyes somewhere", "eyes between 5 and 7 at 1, 5", "eyes between 0 and 1 at 1, 5",
    "eyes between 5 and 6 at 1, 1", "eyes between 5 and 6 at 1, 5 size 0",
    "eyes between 5 and 6 at 1, 5 size 2.1", "eyes between 5 and 6 at 1, 5 size NaN",
  ]) assert.throws(() => parseEyeDirective(text, 1), Error, text);
  const parsed = parsePattern(source);
  assert.equal(validateEyePair(pair, parsed.rounds), null);
  assert.match(validateEyePair({ ...pair, upperRound: 8 }, parsed.rounds)!, /adjacent/);
  assert.match(validateEyePair({ ...pair, lowerRound: 6, upperRound: 7 }, parsed.rounds)!, /completed rounds/);
  assert.match(validateEyePair({ ...pair, stitches: [1, 25] }, parsed.rounds)!, /between 1 and 24/);
});

test("safety eyes occupy specified surface gaps with four intervening stitches and respect playback", () => {
  const model = buildGeometry(parsePattern(source));
  const eyes = buildSafetyEyes(model, [pair]);
  assert.equal(eyes.length, 2);
  assert.equal(buildSafetyEyes(model, [pair], 5).length, 0);
  assert.equal(buildSafetyEyes(model, [pair], 6).length, 2);
  for (const eye of eyes) {
    assert.ok([...eye.position, ...eye.normal].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...eye.normal) - 1) < 1e-10);
    const lower = model.roundCenters.find((r) => r.round === 5)!;
    const upper = model.roundCenters.find((r) => r.round === 6)!;
    const radial = Math.hypot(eye.position[0] - lower.center[0], eye.position[2] - lower.center[2]);
    assert.ok(radial > lower.radius + 0.2);
    assert.ok(eye.position[1] > lower.center[1] && eye.position[1] < upper.center[1]);
  }
  const separation = Math.acos(Math.max(-1, Math.min(1,
    eyes[0].normal.reduce((sum, n, i) => sum + n * eyes[1].normal[i], 0),
  )));
  assert.ok(Math.abs(separation - 4 * 2 * Math.PI / 24) < 0.04);
});

test("eye placement follows row offsets and translation of asymmetric model bounds", () => {
  const model = buildGeometry(parsePattern(source));
  const original = buildSafetyEyes(model, [pair]);
  const moved = buildSafetyEyes(offsetRows(model, { 5: 2, 6: 4 }), [pair]);
  for (let i = 0; i < original.length; i++) {
    const before = anchor(original[i]), after = anchor(moved[i]);
    assert.ok(Math.abs(after[1] - before[1] - 3) < 1e-10);
    assert.ok(Math.abs(after[0] - before[0]) < 1e-10);
    assert.ok(Math.abs(after[2] - before[2]) < 1e-10);
  }
  const shifted = {
    ...model,
    points: model.points.map((point) => ({ ...point, position: [point.position[0] + 7, point.position[1], point.position[2] - 3] as [number, number, number] })),
    roundCenters: model.roundCenters.map((round) => ({ ...round, center: [round.center[0] + 7, round.center[1], round.center[2] - 3] as [number, number, number] })),
  };
  const translated = buildSafetyEyes(shifted, [pair]);
  for (let i = 0; i < original.length; i++) {
    assert.ok(Math.abs(translated[i].position[0] - original[i].position[0] - 7) < 1e-10);
    assert.ok(Math.abs(translated[i].position[2] - original[i].position[2] + 3) < 1e-10);
  }
  assert.equal(buildSafetyEyes(model, [{ ...pair, stitches: [0, 500] }]).length, 0);
});

test("eyes remain on the outside at the round seam and between decreasing rounds", () => {
  const parsed = parsePattern(source.replace("6: 24 sc", "6: 12 dec"));
  const model = buildGeometry(parsed);
  const seamPair = { ...pair, stitches: [24, 3] as [number, number] };
  assert.equal(validateEyePair(seamPair, parsed.rounds), null);
  const eyes = buildSafetyEyes(model, [seamPair]);
  assert.equal(eyes.length, 2);
  const lower = model.roundCenters.find((r) => r.round === 5)!;
  const upper = model.roundCenters.find((r) => r.round === 6)!;
  const seamLeft = model.points.find((p) => p.round === 5 && p.index === 23)!;
  const seamRight = model.points.find((p) => p.round === 5 && p.index === 0)!;
  const direction = (p: typeof seamLeft) => Math.atan2(p.position[2] - lower.center[2], p.position[0] - lower.center[0]);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const seamAnchor = anchor(eyes[0]);
  const eyeAngle = Math.atan2(seamAnchor[2] - lower.center[2], seamAnchor[0] - lower.center[0]);
  assert.ok(Math.abs(wrap(eyeAngle - direction(seamLeft)) - wrap(direction(seamRight) - direction(seamLeft)) / 2) < 1e-10);
  for (const eye of eyes) {
    const radial = Math.hypot(eye.position[0] - lower.center[0], eye.position[2] - lower.center[2]);
    const surface = anchor(eye);
    assert.ok(radial > Math.hypot(surface[0] - lower.center[0], surface[2] - lower.center[2]));
    assert.ok(surface[1] > lower.center[1] && surface[1] < upper.center[1]);
    assert.ok(eye.normal[1] > 0, 'closing rounds tilt eyes toward the cap');
  }
});
