import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Raycaster, SphereGeometry, Vector3 } from 'three';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { createRoundHighlight, roundsForSourceLine } from './roundHighlight';
import { disposePieceMesh } from './pieceMesh';
import { projectSettings, libraryEntry, DEFAULT_SETTINGS } from './projectLibrary';

test('source-line tracking handles grouped rounds, comments, metadata, and branch stitches', () => {
  const source='Pattern name: "Tail"\n// start\nRound 1: 6sc in mr\nRound 2–4: sc around\nRound 5: branch(3ch, 2slst), 6sc\nfasten off';
  const pattern=parsePattern(source);
  assert.deepEqual(pattern.diagnostics,[]);
  assert.deepEqual(roundsForSourceLine(pattern,3),[1]);
  assert.deepEqual(roundsForSourceLine(pattern,4),[2,3,4]);
  assert.deepEqual(roundsForSourceLine(pattern,5),[5]);
  for(const line of [null,1,2,6,99])assert.deepEqual(roundsForSourceLine(pattern,line),[]);
  assert.deepEqual(roundsForSourceLine(parsePattern('// new note\n'+source),5),[2,3,4]);
});

test('round overlays copy only visible matching instances without mutating colors or intercepting picking', () => {
  const model=buildGeometry(parsePattern('Round 1: 6sc in mr\nRound 2–3: sc around'));
  const points=model.points.filter(p=>p.round<=2);
  const base=new InstancedMesh(new SphereGeometry(.25,8,6),new MeshBasicMaterial(),points.length);
  const transform=new Matrix4(),color=new Color('#9a674a');
  points.forEach((p,i)=>{base.setMatrixAt(i,transform.makeTranslation(...p.position));base.setColorAt(i,color);});
  const matrices=base.instanceMatrix.array.slice(),colors=base.instanceColor!.array.slice();
  const overlay=createRoundHighlight([2,3],[{mesh:base,points}]);
  assert.equal(overlay.children.length,1);
  const nodes=overlay.children[0] as InstancedMesh;
  assert.equal(nodes.count,6); // playback hides round 3
  nodes.getMatrixAt(0,transform);
  assert.deepEqual(new Vector3().setFromMatrixPosition(transform).toArray(),points[6].position.map(Math.fround));
  assert.notEqual(nodes.geometry,base.geometry);
  assert.deepEqual(base.instanceMatrix.array,matrices);
  assert.deepEqual(base.instanceColor!.array,colors);
  const intersections: never[]=[];
  nodes.raycast(new Raycaster(),intersections);
  assert.equal(intersections.length,0);
  assert.equal(createRoundHighlight([],[{mesh:base,points}]).children.length,0);
  assert.equal(createRoundHighlight([99],[{mesh:base,points}]).children.length,0);
  disposePieceMesh(overlay);
  base.dispose();base.geometry.dispose();(base.material as MeshBasicMaterial).dispose();
});

test('the eye toggle survives project saving and old projects default to enabled', () => {
  assert.equal(projectSettings(undefined).highlightRounds,true);
  assert.equal(projectSettings({highlightRounds:'false'}).highlightRounds,true);
  const settings=projectSettings({...DEFAULT_SETTINGS,highlightRounds:false});
  const saved=libraryEntry({version:2,id:'highlight-test',name:'Test',activeId:'body',settings,
    pieces:[{id:'body',name:'Body',source:'Round 1: 6sc in mr',rowOffsets:{}}]});
  assert.equal(projectSettings(JSON.parse(JSON.stringify(saved.project)).settings).highlightRounds,false);
});

test('highlights retain per-instance yarn and cluster shapes after the stitch-library update', async () => {
  const {createPieceMesh}=await import('./pieceMesh');
  const {Mesh}=await import('three');
  for(const source of [
    'Round 1: 6sc in mr\nRound 2: bobble2, bobble3, bobble4, bobble, puff, popcorn',
    'start: ch 13\nRow 1: 10dc\nRow 2: ch 3 (counts as dc), 9dc',
  ]) {
    const pattern=parsePattern(source),model=buildGeometry(pattern);
    const piece=createPieceMesh(model,pattern,1);
    for(const mesh of piece.children.filter((m):m is InstancedMesh=>m instanceof InstancedMesh)) {
      const points=mesh.name==='yarn-bobbles'?model.points.filter(p=>['bobble','bobble2','bobble3','bobble4','trbo','puff','popcorn'].includes(p.type)):model.points;
      const highlight=createRoundHighlight([2],[{mesh,points}]);
      const overlay=highlight.children[0] as InstancedMesh;
      assert.ok(overlay.morphTexture,'highlight needs its own morph texture for the instanced shader');
      const original=new Mesh(mesh.geometry,mesh.material),copy=new Mesh(overlay.geometry,overlay.material);
      points.flatMap((p,i)=>p.round===2?[i]:[]).forEach((sourceIndex,index)=>{
        mesh.getMorphAt(sourceIndex,original);overlay.getMorphAt(index,copy);
        assert.deepEqual(copy.morphTargetInfluences,original.morphTargetInfluences);
      });
      assert.notEqual(overlay.morphTexture,mesh.morphTexture);
      disposePieceMesh(highlight);
    }
    disposePieceMesh(piece);
  }
});
