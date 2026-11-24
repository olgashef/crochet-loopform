import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from './geometry';
import { parsePattern } from './pattern';
import { buildSafetyEyes, parseEyeDirective } from './safetyEyes';
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
for(const orientation of ['top-down','bottom-up']) test(`right-handed ordering survives increases and decreases (${orientation})`,()=>{
  const pattern=parsePattern(`orientation ${orientation}\nRound 1: 6sc in mr\nRound 2: 6inc\nRound 3: (sc, inc)x6\nRound 4: (sc, dec)x6`);
  const model=buildGeometry(pattern);
  for(const course of model.roundCenters) {
    const points=model.points.filter(p=>p.round===course.round);
    const angle=(p:typeof points[number])=>Math.atan2(p.position[2]-course.center[2],p.position[0]-course.center[0]);
    for(let i=0;i<points.length;i++)assert.ok(wrap(angle(points[(i+1)%points.length])-angle(points[i]))<0);
  }
  assert.ok(model.points[1].position[0]<model.points[0].position[0]);
  assert.deepEqual(model.points.map(p=>[p.id,p.parents,p.color]),pattern.stitches.map(p=>[p.id,p.parents,p.color]));
});
test('eyes stay in the chosen stitch gap after winding reversal, including the seam',()=>{
  const model=buildGeometry(parsePattern('Round 1: 12sc in mr\nRound 2: 12sc'));
  const eyes=buildSafetyEyes(model,[parseEyeDirective('eyes between 1 and 2 at 2, 12 size 0.8',3)!]);
  const center=model.roundCenters[0].center;
  const angle=(p:number[])=>Math.atan2(p[2]-center[2],p[0]-center[0]);
  for(const eye of eyes) {
    const a=model.points[eye.stitch-1],b=model.points[eye.stitch%12];
    const expected=angle(a.position)+wrap(angle(b.position)-angle(a.position))/2;
    assert.ok(Math.abs(wrap(angle(eye.position)-expected))<1e-8);
  }
});
