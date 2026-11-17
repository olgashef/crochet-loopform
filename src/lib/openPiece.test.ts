import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3, Raycaster, Mesh, MeshBasicMaterial, DoubleSide } from 'three';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { buildStitchFrames } from './stitchFrame';
import { createFabricGeometry } from './fabricGeometry';
import { embroiderySurface } from './embroiderySurface';
import { closesLastRound, setPieceEdge } from './pieceEdge';
import { paintStitches } from './colorwork';

const ear = 'orientation top-down\nRound 1 [#FFF1EA]: 4sc in mr → 4\nRound 2: (sc, inc)x2 → 6\nRound 3: (sc, inc)x3 → 9\nRound 4: (2sc, inc)x3 → 12\nRound 5: (3sc, inc)x3 → 15\nfasten off';
test('small tapered ears follow the meridian, including their first course',()=>{
  for (const source of [ear,ear.replace('top-down','bottom-up')]) {
    const model=buildGeometry(parsePattern(source));
    assert.equal(model.endClosed,false);assert.equal(model.points.length,46);
    for (const radius of [.175,.25,.35]) {
      const frames=buildStitchFrames(model.points,radius);
      for (const point of model.points) {
        const course=model.roundCenters[point.round-1];
        const low=model.roundCenters[Math.max(0,point.round-2)], high=model.roundCenters[Math.min(4,point.round)];
        const radial=new Vector3(point.position[0]-course.center[0],0,point.position[2]-course.center[2]).normalize();
        const along=new Vector3(0,1,0).applyQuaternion(frames.get(point.id)!.rotation);
        assert.ok(Math.abs(along.dot(new Vector3().crossVectors(radial,new Vector3(0,1,0))))<.08,'stitches must stay within five degrees of the cone meridian');
        assert.equal(Math.sign(along.y),Math.sign(high.center[1]-low.center[1]));
        const normal=new Vector3(0,0,1).applyQuaternion(frames.get(point.id)!.rotation);
        assert.ok(normal.dot(radial)>0,'loops face out of the fabric');
        const spacing=Math.hypot(high.center[1]-low.center[1],high.radius-low.radius)/(point.round>1&&point.round<5?2:1);
        assert.ok(4.22*radius*frames.get(point.id)!.scale.y >= spacing,'loop envelope joins neighboring courses');
      }
    }
  }
});
test('narrow unfinished tubes remain open even with fasten off and partial playback',()=>{
  const source='Round 1: 6sc in mr\nRound 2-9: sc around\nfasten off';
  const model=buildGeometry(parsePattern(source));
  assert.equal(model.endClosed,false);
  for (const visible of [5,9]) {
    const geo=createFabricGeometry(model,visible), mat=new MeshBasicMaterial({side:DoubleSide}), mesh=new Mesh(geo,mat);
    mesh.updateMatrixWorld();
    const ray=new Raycaster(new Vector3(0,model.bounds.height+2,0),new Vector3(0,-1,0));
    const hits=ray.intersectObject(mesh);
    assert.ok(hits.length>0,'magic-ring foundation remains closed');
    assert.ok(hits.every(hit=>Math.abs(hit.point.y-model.roundCenters[0].center[1])<1e-5),'no cap covers the opening or playback frontier');
    geo.dispose();mat.dispose();
  }
  assert.equal(embroiderySurface(model).sample({round:9.5,angle:0}),null);
});
test('open-edge instruction survives painting and prevents closure of a decreased tip',()=>{
  const source='Round 1: 6sc in mr\nRound 2: 6inc\nRound 3: 6dec';
  assert.equal(closesLastRound([6,12,6]),true);
  const open=setPieceEdge(source,'open');
  const painted=paintStitches(open,[0],'#abcdef');
  const model=buildGeometry(parsePattern(painted));
  assert.equal(model.endClosed,false);assert.equal(parsePattern(painted).edge,'open');
  assert.equal(parsePattern(setPieceEdge(open,'auto')).edge,undefined);
  assert.ok(parsePattern(open+'\nembroider dk #303431: 3@10 > 3.5@30').diagnostics.some(d=>d.severity==='error'));
});
