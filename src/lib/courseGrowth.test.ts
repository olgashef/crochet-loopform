import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { createFabricGeometry } from './fabricGeometry';
import { buildStitchFrames } from './stitchFrame';
import { courseGrowth } from './courseGrowth';
import { embroiderySurface } from './embroiderySurface';
import { surfaceNormal } from './assembly';

const start='Round 1: 8sc in mr\nRound 2: 8inc\nRound 3: (sc, inc)x8\n';
export const clustered=start+'Round 4: 9sc, 6inc, 9sc\nRound 5: 10sc, 3inc, 4sc, 3inc, 10sc\nRound 6: 11sc, 3inc, 8sc, 3inc, 11sc\nRound 7: 18sc, 6inc, 18sc\nRound 8–10: sc around';
const balanced=start+'Round 4: (3sc, inc)x6\nRound 5: (4sc, inc)x6\nRound 6: (5sc, inc)x6\nRound 7: (6sc, inc)x6\nRound 8–10: sc around';
const vector=(p:number[])=>new Vector3().fromArray(p);
const spread=(model:ReturnType<typeof buildGeometry>,round:number)=>{
  const c=vector(model.roundCenters[round-1].center);
  const radii=model.points.filter(p=>p.round===round).map(p=>vector(p.position).distanceTo(c));
  return Math.max(...radii)-Math.min(...radii);
};
test('screenshot growth shifts the center cumulatively; identical evenly distributed counts stay balanced',()=>{
  const a=parsePattern(clustered),b=parsePattern(balanced);
  assert.deepEqual(a.diagnostics,[]);assert.deepEqual(b.diagnostics,[]);
  assert.deepEqual(a.rounds.map(r=>r.outputCount),b.rounds.map(r=>r.outputCount));
  const bent=buildGeometry(a),straight=buildGeometry(b);
  const first=bent.roundCenters[2].center,last=bent.roundCenters[6].center;
  const drift=Math.hypot(last[0]-first[0],last[2]-first[2]);
  assert.ok(drift>.4 && drift<1.2,'local growth bends the outline without separating courses');
  assert.ok(straight.roundCenters.every(r=>Math.hypot(r.center[0],r.center[2])<1e-8));
  assert.ok(spread(bent,7)>.2);
  assert.ok(spread(bent,10)>spread(bent,7)*.95,'plain courses retain their inherited outline');
  assert.equal(bent.roundCenters[6].center[0],bent.roundCenters[9].center[0]);
  assert.deepEqual(bent.points.map(p=>[p.id,p.parents,p.previous,p.color]),a.stitches.map(p=>[p.id,p.parents,p.previous,p.color]));
  assert.deepEqual(buildGeometry(a),bent);
});
test('opposite increase sectors create an oval without one-sided drift',()=>{
  const model=buildGeometry(parsePattern('Round 1: 24sc in mr\nRound 2: (3inc, 9sc)x2\nRound 3–5: sc around'));
  assert.ok(model.roundCenters.every(r=>Math.hypot(r.center[0],r.center[2])<1e-8));
  assert.ok(spread(model,2)>.3);
  assert.ok(spread(model,5)>spread(model,2)*.95);
});
test('rotating growth sites rotates the distortion; decreases reverse signed growth',()=>{
  const pattern=parsePattern('Round 1: 24sc in mr\nRound 2: 6inc, 18sc');
  const parents=new Map(pattern.rounds[0].stitches.map((s,i)=>[s.id,i*Math.PI/12]));
  const a=courseGrowth(pattern.rounds[1].stitches,parents,.9,.92);
  const rotated=new Map([...parents].map(([id,angle])=>[id,angle+Math.PI/2]));
  const b=courseGrowth(pattern.rounds[1].stitches,rotated,.9,.92);
  assert.ok(Math.abs(b.shift[0]+a.shift[1])<1e-8);assert.ok(Math.abs(b.shift[1]-a.shift[0])<1e-8);
  const dec=parsePattern('Round 1: 24sc in mr\nRound 2: 3dec, 18sc');
  const d=courseGrowth(dec.rounds[1].stitches,parents,.9,.92);
  assert.ok(d.shift[0]*a.shift[0]+d.shift[1]*a.shift[1]<0);
});
test('asymmetric fabric keeps its circumference budget and supports embroidery/attachments in either orientation',()=>{
  for(const orientation of ['top-down','bottom-up']) {
    const model=buildGeometry(parsePattern(`orientation ${orientation}\n${clustered}`));
    for(const course of model.roundCenters) {
      const ring=model.points.filter(p=>p.round===course.round);
      const perimeter=ring.reduce((sum,p,i)=>sum+vector(p.position).distanceTo(vector(ring[(i+1)%ring.length].position)),0);
      const target=2*ring.length*course.radius*Math.sin(Math.PI/ring.length);
      assert.ok(Math.abs(perimeter-target)<1e-8);
    }
    const fabric=createFabricGeometry(model);assert.ok([...fabric.getAttribute('position').array].every(Number.isFinite));fabric.dispose();
    const frames=buildStitchFrames(model.points,.25,true,model.roundCenters);
    assert.ok([...frames.values()].every(f=>[...f.position.toArray(),...f.rotation.toArray(),...f.scale.toArray()].every(Number.isFinite)));
    const surface=embroiderySurface(model);
    for(let angle=0;angle<360;angle+=30) {
      const p=surface.sample({round:5.5,angle});assert.ok(p&&p.position.toArray().every(Number.isFinite));
      assert.ok(Math.abs(p!.normal.length()-1)<1e-8);
    }
    surface.dispose();
    assert.ok(surfaceNormal(model,model.points[50]).toArray().every(Number.isFinite));
  }
});

test('repeated concentrated growth and later closure stay bounded, with no new stitches or invalid values',()=>{
  const lines=['Round 1: 12sc in mr'];let count=12;
  for(let round=2;round<=20;round++) {lines.push(`Round ${round}: 3inc, ${count-3}sc`);count+=3;}
  let round=21;
  while(count>6) {const decrease=Math.min(3,count-6);lines.push(`Round ${round++}: ${decrease}dec, ${count-2*decrease}sc`);count-=decrease;}
  // Omit a zero-count run on the very last decrease if present.
  const clean=parsePattern(lines.join('\n').replace(/, 0sc/g,''));
  assert.deepEqual(clean.diagnostics,[]);
  const model=buildGeometry(clean);
  assert.equal(model.points.length,clean.stitches.length);assert.equal(model.endClosed,true);
  assert.ok(model.points.every(p=>p.position.every(Number.isFinite)));
  for(const course of model.roundCenters) {
    for(const p of model.points.filter(p=>p.round===course.round)) {
      const r=vector(p.position).distanceTo(vector(course.center));
      assert.ok(r>course.radius*.45 && r<course.radius*1.5);
    }
  }
});
