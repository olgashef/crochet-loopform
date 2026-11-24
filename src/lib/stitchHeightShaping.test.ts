import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { buildStitchFrames } from './stitchFrame';
import { createFabricGeometry } from './fabricGeometry';

const tail=(stitches:string,orientation='bottom-up')=>parsePattern(`edge: open
orientation ${orientation}
Round 1: 6sc in mr
Round 2: (sc, inc) x3
Round 3–4: sc around
Round 5: ${stitches}
Round 6–9: sc around`);
const v=(a:number[])=>new Vector3().fromArray(a);
const sideways=(model:ReturnType<typeof buildGeometry>)=>{
  const a=model.roundCenters[3].center,b=model.roundCenters[8].center;
  return Math.hypot(a[0]-b[0],a[2]-b[2]);
};
test('the screenshot tail bends with mixed hdc, bends more with dc, and carries the bend into later SC rounds',()=>{
  const straight=buildGeometry(tail('9sc'));
  const hdc=buildGeometry(tail('3sc, 3hdc, 3sc'));
  const dc=buildGeometry(tail('3sc, 3dc, 3sc'));
  assert.ok(sideways(straight)<1e-8);
  assert.ok(sideways(hdc)>.4);
  assert.ok(sideways(dc)>sideways(hdc)*1.5);
  const incoming=v(hdc.roundCenters[3].center).sub(v(hdc.roundCenters[2].center)).normalize();
  const outgoing=v(hdc.roundCenters[6].center).sub(v(hdc.roundCenters[5].center)).normalize();
  assert.ok(incoming.angleTo(outgoing)>.1);
  const final=v(hdc.roundCenters[8].center).sub(v(hdc.roundCenters[7].center)).normalize();
  assert.ok(final.angleTo(outgoing)<1e-7);
  assert.equal(hdc.endClosed,false);
  assert.deepEqual(hdc.points.map(p=>[p.id,p.parents,p.previous]),straight.points.map(p=>[p.id,p.parents,p.previous]));
});
test('uniform tall stitches add height without sideways bending; balanced opposing tall sectors do not bend',()=>{
  const uniform=buildGeometry(tail('9hdc')), sc=buildGeometry(tail('9sc'));
  assert.ok(sideways(uniform)<1e-8);
  assert.ok(uniform.bounds.height>sc.bounds.height);
  const balanced=buildGeometry(parsePattern('Round 1: 12sc in mr\nRound 2: (3sc, 3dc) x2\nRound 3–5: sc around'));
  assert.ok(balanced.roundCenters.every(r=>Math.hypot(r.center[0]-balanced.roundCenters[0].center[0],r.center[2]-balanced.roundCenters[0].center[2])<1e-8));
});
test('bent courses retain usable fabric and stitch frames in both orientations',()=>{
  for(const orientation of ['bottom-up','top-down']) {
    const model=buildGeometry(tail('3sc, 3dc, 3sc',orientation));
    const frames=buildStitchFrames(model.points,.25,true,model.roundCenters);
    const axis=v(model.roundCenters[7].center).sub(v(model.roundCenters[5].center)).normalize();
    for(const point of model.points.filter(p=>p.round===7)) {
      const frame=frames.get(point.id)!;
      assert.ok(new Vector3(0,1,0).applyQuaternion(frame.rotation).dot(axis)>.98);
    }
    const surface=createFabricGeometry(model);
    assert.ok(Array.from(surface.getAttribute('position').array).every(Number.isFinite));
    surface.dispose();
    assert.deepEqual(buildGeometry(tail('3sc, 3dc, 3sc',orientation)),model);
  }
});
