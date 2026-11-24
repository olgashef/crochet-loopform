import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePattern } from './pattern';
import { OVAL_START } from './studio';
import { buildGeometry } from './geometry';
import { createFabricGeometry } from './fabricGeometry';
import { buildStitchFrames } from './stitchFrame';
import { Vector3 } from 'three';
import { paintStitches } from './colorwork';
import { roundsForSourceLine } from './roundHighlight';
test('all seven foundation chains are rendered, connected, highlighted and independently paintable',()=>{
  const p=parsePattern(OVAL_START),m=buildGeometry(p);
  const chain=p.chainStart!.stitches;
  assert.equal(chain.length,7);
  assert.equal(m.points.filter(s=>s.auxiliary?.kind==='foundation').length,7);
  assert.deepEqual(roundsForSourceLine(p,p.chainStart!.line),[0]);
  for(const s of p.rounds[0].stitches)assert.equal(s.parents[0],chain[s.chainIndex!].id);
  const source=paintStitches(OVAL_START,[chain[2].id],'#123456');
  const restored=parsePattern(source);
  assert.deepEqual(restored.diagnostics,[]);
  assert.equal(restored.chainStart!.stitches[2].color,'#123456');
  assert.equal(restored.chainStart!.stitches[1].color,chain[1].color);
  assert.deepEqual(restored.rounds.map(r=>r.outputCount),[16,24]);
});
test('other-side groups revisit the chain and retain their instructions when painted',()=>{
  const p=parsePattern(OVAL_START);
  assert.deepEqual(p.diagnostics,[]);
  assert.deepEqual(p.rounds[0].stitches.map(s=>s.chainIndex),[5,4,3,2,1,0,0,0,0,1,2,3,4,5,5,5]);
  const painted=paintStitches(OVAL_START,[6],'#123456');
  assert.match(painted,/other side/);
  assert.match(painted,/in same st/);
  assert.deepEqual(parsePattern(painted).rounds[0].stitches.map(s=>s.chainIndex),p.rounds[0].stitches.map(s=>s.chainIndex));
});
test('chain foundation with the photographed increases expands in a flat plane',()=>{
  const p=parsePattern(OVAL_START);
  assert.deepEqual(p.diagnostics,[]);
  assert.deepEqual(p.rounds.map(r=>r.outputCount),[16,24]);
  const model=buildGeometry(p);
  assert.ok(model.planarFoundation);
  assert.equal(model.bounds.depth,0);
  assert.ok(model.points.every(p=>p.position[2]===0));
  assert.ok(model.roundCenters[1].radius>model.roundCenters[0].radius);
  const fabric=createFabricGeometry(model),positions=fabric.getAttribute('position');
  assert.ok(positions.count>0);
  for(let i=0;i<positions.count;i++)assert.ok(Math.abs(positions.getZ(i)+.16)<1e-6);
  fabric.dispose();
});

test('successive increasing courses stay flat and preserve individually painted stitches',()=>{
  const source=OVAL_START+'\nRound 3: (2sc, inc)x8 → 32\nRound 4: (3sc, inc)x8 → 40\nRound 5: (4sc, inc)x8 → 48';
  const p=parsePattern(paintStitches(source,[0,18,60],'#123456'));
  assert.deepEqual(p.diagnostics,[]);
  const m=buildGeometry(p),frames=buildStitchFrames(m.points,.25,true,m.roundCenters);
  assert.equal(m.bounds.depth,0);
  for(let i=1;i<m.roundCenters.length;i++)assert.ok(m.roundCenters[i].radius>m.roundCenters[i-1].radius);
  for(const point of m.points){
    const frame=frames.get(point.id)!;
    assert.ok([...frame.position,...frame.scale,...frame.rotation].every(Number.isFinite));
    assert.ok(new Vector3(0,0,1).applyQuaternion(frame.rotation).z>.99);
  }
  assert.ok([0,18,60].every(id=>m.points[id].color==='#123456'));
});

test('worksheet Rnd labels and optional totals preserve the chain-around foundation', async()=>{
  const {editWorksheetRow,insertWorksheetRow}=await import('./worksheet');
  const source=`Pattern name: "Chain foundation"
start: ch 7 around

Round 1: 5sc, [4sc] in same st, other side, 4sc, [3sc] in same st → 16
Round 2: inc, 4sc, 4inc, 4sc, 3inc → 24
Round 3: sc, inc, 4sc, (sc,inc)x4, 4sc, (sc,inc)x3 → 32
Round 4: 2sc, inc, 4sc, (2sc,inc)x4, 4sc, (2sc,inc)x3
Round 5: 3sc, inc, 4sc, (3sc,inc)x4, 4sc, (3sc,inc)x3
Round 6: 4sc, inc, 4sc, (4sc,inc)x4, 4sc, (4sc,inc)x3 → 56`;
  const original=parsePattern(source);
  assert.deepEqual(original.diagnostics,[]);
  const edited=editWorksheetRow(source,5,'inc, 4sc, 4inc, 4sc, 3inc');
  for(const variant of [edited,source.replaceAll('Round','Rnd').replace(/ → \d+/g,''),source.replaceAll('Round','Rnd.')]) {
    const p=parsePattern(variant);
    assert.deepEqual(p.diagnostics,[]);
    assert.deepEqual(p.rounds.map(r=>r.outputCount),[16,24,32,40,48,56]);
    assert.deepEqual(p.stitches.map(s=>s.parents),original.stitches.map(s=>s.parents));
    assert.deepEqual(buildGeometry(p).points.map(p=>p.position),buildGeometry(original).points.map(p=>p.position));
  }
  const unfinished=parsePattern(insertWorksheetRow(edited,9));
  assert.equal(unfinished.rounds.length,6);
  assert.equal(unfinished.diagnostics.length,1);
  assert.equal(unfinished.diagnostics[0].line,10);
});

test('chain-base holding rounds advance into walls and loop-only work chooses the fold direction',()=>{
 for(const modifier of ['BLO','FLO','']) {
  const pattern=parsePattern(`${OVAL_START}\nRound 3: ${modifier} 24sc\nRound 4: 24sc\nRound 5: 24sc`);
  assert.deepEqual(pattern.diagnostics,[]);
  const model=buildGeometry(pattern),centers=model.roundCenters;
  const sign=modifier==='FLO'?-1:1;
  for(let i=2;i<5;i++)assert.ok(sign*(centers[i].center[2]-centers[i-1].center[2])>.8);
  assert.ok(model.bounds.depth>2.4);
  const frames=buildStitchFrames(model.points);
  assert.ok([...frames.values()].every(f=>f.rotation.toArray().every(Number.isFinite)));
  const fabric=createFabricGeometry(model);
  assert.ok(fabric.getAttribute('position').array.some((n,i)=>i%3===2&&Math.abs(n)>1));
  fabric.dispose();
 }
});
