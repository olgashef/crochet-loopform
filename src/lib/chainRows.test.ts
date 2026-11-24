import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { Vector3 } from 'three';
import { parsePattern, analyzeInstruction } from './pattern';
import { buildGeometry } from './geometry';
import { buildStitchFrames } from './stitchFrame';
import { createFabricGeometry } from './fabricGeometry';
import { paintStitches, colorSelection } from './colorwork';
import { completeRoundCount } from './completeRoundCount';
import { writtenPattern, csvPattern, editWorksheetRow, insertWorksheetRow, pasteWorksheetRows, moveWorksheetRow } from './worksheet';
import { roundsForSourceLine } from './roundHighlight';
import { createPieceMesh, disposePieceMesh } from './pieceMesh';
import { buildSafetyEyes } from './safetyEyes';
import { embroiderySurface } from './embroiderySurface';
import { embroideryPath } from './embroideryMesh';
import { attachAtStitch, identityPlacement, validPlacement } from './assembly';
import { newPiece, validProject } from './studio';
import { offsetRows } from './rowOffsets';
import { initialModelView } from './viewFraming';

const example=`Pattern name: "New pattern"
start: ch 11

Row 1: 10 sc across → 10
Row 2: ch 1, turn, 10 sc across → 10`;
const valid=(source:string)=>{const p=parsePattern(source);assert.deepEqual(p.diagnostics,[]);return p;};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);

test('chain foundation builds ten stitches per row and reverses parents on each turn',()=>{
  const p=valid(example);
  assert.equal(p.construction,'rows');
  assert.equal(p.chainStart!.stitches.length,11);
  assert.deepEqual(p.rounds.map(r=>[r.inputCount,r.outputCount]),[[10,10],[10,10]]);
  assert.equal(p.stitches.length,32); // 20 working stitches + 11 foundation + 1 turning chain
  assert.deepEqual(p.rounds[0].stitches.map(s=>s.parents),Array.from({length:10},(_,i)=>[9-i]));
  assert.deepEqual(p.rounds[1].stitches.map(s=>s.parents),p.rounds[0].stitches.slice().reverse().map(s=>[s.id]));
  const turn=p.stitches.find(s=>s.auxiliary?.kind==='turning')!;
  assert.equal(turn.previous,p.rounds[0].stitches.at(-1)!.id);
  assert.equal(p.rounds[1].stitches[0].previous,turn.id);
  assert.equal(analyzeInstruction('ch 1, turn, 10 sc across → 10',10,true).outputCount,10);
  assert.deepEqual(roundsForSourceLine(p,2),[0]);
  assert.deepEqual(roundsForSourceLine(p,4),[1]);
});

test('row ranges, taller stitches, increases and decreases retain correct construction',()=>{
  const p=valid(example+'\nRow 3: ch 1, turn, inc, 8sc, inc → 12\nRow 4: ch 1, turn, dec, 8sc, dec → 10\nRow 5–7: ch 1, turn, sc across → 10');
  assert.deepEqual(p.rounds.map(r=>r.outputCount),[10,10,12,10,10,10,10]);
  assert.deepEqual(roundsForSourceLine(p,8),[5,6,7]);
  for(const [type,skip] of [['hdc',2],['dc',3],['tr',4]] as const) {
    const tall=valid(`start: ch ${10+skip}\nRow 1: 10 ${type} across → 10\nRow 2: ch ${skip}, turn, 10 ${type} across → 10`);
    assert.equal(tall.rounds[0].stitches[0].parents[0],9);
    assert.equal(tall.stitches.filter(s=>s.auxiliary?.kind==='turning').length,skip);
    assert.ok(buildGeometry(tall).bounds.height>buildGeometry(valid(example)).bounds.height);
  }
});

test('chain shorthand and flat row editing do not change existing round notation',()=>{
  assert.deepEqual(analyzeInstruction('2ch 3sc').operations,['ch','ch','sc','sc','sc']);
  assert.deepEqual(analyzeInstruction('ch, 3sc').operations,['ch','sc','sc','sc']);
  const colored=valid('start: ch 3[#123456]\nRow 1: 2sc\nRow 2 [#ffffff]: turn, 2sc');
  assert.ok(colored.chainStart!.stitches.every(s=>s.color==='#123456'));
  assert.ok(colored.rounds[1].stitches.every(s=>s.color==='#ffffff'));
  assert.doesNotThrow(()=>paintStitches('start: ch 3\nRow 1: 2sc\nRow 2 [#ffffff]: turn, 2sc',[4],'#123456'));
  assert.match(insertWorksheetRow('start: magic ring\nRound 1: 6sc in mr',2),/Rnd 2: $/);
});

test('invalid or mixed foundations fail without silently becoming circular models',()=>{
  for(const source of [
    'Row 1: 10 sc across', 'start: ch 1', 'start: ch 9000',
    'start: ch 11, join\nRound 1: 10sc',
    'start: ch 11\nRound 1: 10sc', 'start: ch 11\nstart: magic ring',
    'start: ch 11\nRow 1: 9sc', 'start: ch 11\nRow 1: 10sc in mr',
    'start: ch 11\nRow 1: ch 1, turn, 10sc',
    example+'\nRow 3: sc, turn, 10sc', example+'\nRow 3: ch 1, turn, 9sc',
  ]) assert.ok(parsePattern(source).diagnostics.some(d=>d.severity==='error'),source);
});

test('flat geometry has open edges, aligned parent columns and finite fabric and stitch frames',()=>{
  for(const orientation of ['bottom-up','top-down']) {
    const p=valid(`orientation ${orientation}\n${example}`),model=buildGeometry(p);
    assert.equal(model.endClosed,false);assert.equal(model.bounds.depth,0);
    assert.ok(initialModelView(model).z>.95);
    assert.equal(model.points.length,p.stitches.length);
    for(const r of p.rounds) {
      const points=r.stitches.map(s=>model.points[s.id]);
      assert.equal(new Set(points.map(s=>s.position[0])).size,10);
      assert.ok(r.number%2?points[0].position[0]>points[9].position[0]:points[0].position[0]<points[9].position[0]);
      assert.ok(!model.links.some(l=>l.from===points[9].id&&l.to===points[0].id));
      for(const point of points)near(point.position[0],model.points[point.parents[0]].position[0]);
    }
    const frames=buildStitchFrames(model.points,.25,true,model.roundCenters);
    for(const frame of frames.values())assert.ok([...frame.position,...frame.scale,...frame.rotation].every(Number.isFinite));
    for(const point of model.points.filter(p=>!p.auxiliary))near(new Vector3(0,0,1).applyQuaternion(frames.get(point.id)!.rotation).z,1);
    const fabric=createFabricGeometry(model,Infinity,.15),a=fabric.getAttribute('position');
    assert.ok(a.count>0);assert.ok([...a.array].every(Number.isFinite));
    for(let i=0;i<a.count;i++)near(a.getZ(i),-.15);
    fabric.dispose();
    const mesh=createPieceMesh(model,p,1);assert.ok(mesh.getObjectByName('yarn-stitches'));disposePieceMesh(mesh);
  }
});

test('painting foundation, turn and working stitches saves exact inline colors and topology',()=>{
  let source=example;
  for(const ids of [[0,10],[21],[11,22,31]]) {
    const before=valid(source);
    source=paintStitches(source,ids,'#123456');
    const after=valid(source);
    assert.ok(!/^paint\b/m.test(source));
    assert.match(source,/Row 2.*turn,/);
    for(const stitch of before.stitches) {
      const next=after.stitches[stitch.id];
      assert.equal(next.color,ids.includes(stitch.id)?'#123456':stitch.color);
      assert.deepEqual(next.parents,stitch.parents);assert.equal(next.previous,stitch.previous);
      assert.deepEqual(next.auxiliary,stitch.auxiliary);
    }
  }
  const piece=newPiece('Flat panel',source),project={version:2,name:'Chain project',activeId:piece.id,pieces:[piece]};
  const restored=JSON.parse(JSON.stringify(project));assert.ok(validProject(restored));
  assert.deepEqual(valid(restored.pieces[0].source).stitches,valid(source).stitches);
});

test('color patches do not connect the opposite edges of a flat row',()=>{
  const p=valid('start: ch 6\nRow 1: sc[#123456],3sc,sc[#123456] → 5');
  const [first,,,,last]=p.rounds[0].stitches;
  assert.deepEqual(colorSelection(p,first.id,'Patch'),[first.id]);
  assert.ok(!colorSelection(p,first.id,'Patch').includes(last.id));
});

test('row editor, Tab totals and text/CSV exports preserve flat row semantics',()=>{
  const view={state:EditorState.create({doc:example.replace('10 sc across → 10','10 sc across').replace(/→ 10$/,'→ 99'),selection:{anchor:example.length-5}}),dispatch:(s:TransactionSpec)=>{view.state=view.state.update(s).state;}};
  view.state=view.state.update({selection:{anchor:view.state.doc.length}}).state;
  completeRoundCount(view);assert.match(view.state.doc.toString(),/Row 2: ch 1, turn, 10 sc across → 10$/);
  const first={state:EditorState.create({doc:'start: ch 11\nRow 1: sc across',selection:{anchor:27}}),dispatch:(s:TransactionSpec)=>{first.state=first.state.update(s).state;}};
  first.state=first.state.update({selection:{anchor:first.state.doc.length}}).state;
  completeRoundCount(first);assert.match(first.state.doc.toString(),/Row 1: sc across → 10$/);
  assert.equal(valid(editWorksheetRow(example,5,'ch 1, turn, 5dec')).rounds[1].outputCount,5);
  assert.match(insertWorksheetRow(example,5),/Row 3: $/);
  const pasted=pasteWorksheetRows(example,5,'ch 1, turn, 5dec');assert.equal(valid(pasted).rounds[1].outputCount,5);
  const moved=moveWorksheetRow(example+'\nRow 3: ch 1, turn, 5dec',6,5);assert.match(moved,/Row 2: ch 1, turn, 5dec/);
  const exported=valid(writtenPattern(example));assert.deepEqual(exported.stitches.map(s=>[s.type,s.parents]),valid(example).stitches.map(s=>[s.type,s.parents]));
  assert.match(csvPattern(example),/"Row 2","ch 1, turn, 10 sc across","10"/);
});

test('flat accessories, embroidery and attachment normals follow the fabric plane',()=>{
  const p=valid(example+'\neyes between 1 and 2 at 3, 7 size 5mm\nembroider dk #303431: 1.2@40 > 1.8@300');
  const model=offsetRows(buildGeometry(p),{2:.3});
  const eyes=buildSafetyEyes(model,p.eyes);assert.equal(eyes.length,2);
  for(const eye of eyes){assert.deepEqual(eye.normal,[0,0,1]);assert.ok(eye.position[2]>0);}
  const surface=embroiderySurface(model),anchor={round:1.5,angle:145},point=surface.sample(anchor)!;
  const picked=surface.pick(point.position)!;near(picked.round,anchor.round);near(picked.angle,anchor.angle);surface.dispose();
  const path=embroideryPath(model,p.embroidery[0]);assert.ok(path.length>2);
  const a=path[0],b=path.at(-1)!;
  path.forEach((v,i)=>assert.ok(v.distanceTo(a.clone().lerp(b,i/(path.length-1)))<1e-7));
  const placement=attachAtStitch('main',model,model,model.points[p.rounds[0].stitches[3].id],identityPlacement());assert.ok(validPlacement(placement));
  assert.ok(parsePattern(example+'\nembroider dk #123456: 0.5@20 > 1@80').diagnostics.some(d=>d.severity==='error'));
});
