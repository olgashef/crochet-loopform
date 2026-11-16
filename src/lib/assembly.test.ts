import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { attachAtStitch, detachPlacement, earPattern, findAnchor, identityPlacement, piecePivot, placementPosition, stagedPlacement, surfaceNormal, validPlacement, type PiecePlacement } from './assembly';
import { buildGeometry, type Position } from './geometry';
import { parsePattern } from './pattern';
import { offsetRows } from './rowOffsets';
import { initialProject, STARTER, validProject, type Project } from './studio';

const main=buildGeometry(parsePattern(STARTER)), ear=buildGeometry(parsePattern(earPattern()));
const close=(a:Vector3,b:Vector3)=>assert.ok(a.distanceTo(b)<1e-6,`${a.toArray()} ≠ ${b.toArray()}`);
const quaternion=(p:PiecePlacement)=>new Quaternion().setFromEuler(new Euler(...p.rotation.map(MathUtils.degToRad) as Position));
function fixture():Project {return {version:2,name:'Bear assembly',activeId:'ear',pieces:[
  {id:'head',name:'Head',source:STARTER,rowOffsets:{}},
  {id:'ear',name:'Ear',source:earPattern(),rowOffsets:{},placement:attachAtStitch('head',main,ear,main.points[8],identityPlacement())},
]};}

test('ear starter is valid, open at its joining edge, and has visible depth',()=>{
  assert.deepEqual(parsePattern(earPattern()).diagnostics,[]);
  assert.equal(ear.roundCenters.at(-1)?.count,12);
  assert.ok(ear.bounds.height>3);
});

test('click attachment places the joining edge at the chosen stitch and points the piece outward',()=>{
  for(const edge of ['first','last'] as const)for(const point of [main.points[0],main.points[18],main.points[170],main.points.at(-1)!]){
    const attached=attachAtStitch('head',main,ear,point,{...identityPlacement(),edge});
    assert.equal(attached.parentId,'head');assert.equal(findAnchor(main,attached)?.id,point.id);
    const normal=surfaceNormal(main,point);
    close(placementPosition(attached,main),new Vector3().fromArray(point.position).addScaledVector(normal,-.12));
    const axis=piecePivot(ear,edge==='first'?'last':'first').sub(piecePivot(ear,edge)).normalize().applyQuaternion(quaternion(attached));
    close(axis,normal);
  }
});

test('an attachment follows its stitch after shape and round-height edits',()=>{
  const point=main.points.find(p=>p.round===6&&p.index===5)!;
  const attached=attachAtStitch('head',main,ear,point,identityPlacement());
  const changed=offsetRows(main,{6:2.7});
  close(placementPosition(attached,changed),placementPosition(attached,main).add(new Vector3(0,2.7,0)));
  const reshaped=buildGeometry(parsePattern(STARTER.replace('Round 7-12: 36 sc → 36','Round 7-12: 36 hdc → 36')));
  const moved=findAnchor(reshaped,attached)!;
  close(placementPosition(attached,reshaped),new Vector3().fromArray(moved.position).add(new Vector3().fromArray(attached.position)));
});

test('missing attachment stitches preserve the last location for repair instead of jumping to the origin',()=>{
  const attached=attachAtStitch('head',main,ear,main.points.at(-1)!,identityPlacement());
  const shorter=buildGeometry(parsePattern('Round 1: 6 sc in mr'));
  assert.equal(findAnchor(shorter,attached),undefined);
  close(placementPosition(attached,shorter),new Vector3().fromArray(attached.anchor!.point).add(new Vector3().fromArray(attached.position)));
});

test('detaching preserves the full world pose under main-piece rotation and scale',()=>{
  const mainPlacement:PiecePlacement={...identityPlacement(),position:[3,5,-2],rotation:[25,-40,18],scale:2};
  const attached={...attachAtStitch('head',main,ear,main.points[25],identityPlacement()),scale:.8};
  const detached=detachPlacement(attached,mainPlacement,main);
  assert.equal(detached.parentId,null);assert.equal(detached.anchor,undefined);assert.equal(validPlacement(detached),true);
  const mainMatrix=new Matrix4().compose(new Vector3().fromArray(mainPlacement.position),quaternion(mainPlacement),new Vector3().setScalar(mainPlacement.scale));
  const localMatrix=new Matrix4().compose(placementPosition(attached,main),quaternion(attached),new Vector3().setScalar(attached.scale));
  const worldMatrix=mainMatrix.multiply(localMatrix);
  const detachedMatrix=new Matrix4().compose(placementPosition(detached),quaternion(detached),new Vector3().setScalar(detached.scale));
  for(const p of [[0,0,0],[1,2,3],[-2,1,.5]])close(new Vector3(...p).applyMatrix4(worldMatrix),new Vector3(...p).applyMatrix4(detachedMatrix));
});

test('new detached pieces start beside the main piece, not inside it',()=>{
  const first=stagedPlacement(1,main,ear),second=stagedPlacement(2,main,ear);
  assert.equal(first.parentId,null);assert.ok(first.position[0]>main.bounds.width/2+ear.bounds.width/2);
  assert.notDeepEqual(first.position,second.position);
});

test('project JSON and browser restoration retain independent patterns and complete attachments',t=>{
  const saved=fixture();saved.pieces[0].placement={...identityPlacement(),rotation:[0,25,0]};saved.pieces[1].hidden=true;
  const json=JSON.stringify(saved);assert.equal(validProject(JSON.parse(json)),true);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>json}});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage');});
  assert.deepEqual(initialProject(),saved);
});

test('invalid transforms and dangling/cyclic attachments cannot enter a project',()=>{
  for(const change of [{scale:0},{scale:NaN},{position:[Infinity,0,0]},{rotation:[0,'x',0]},{edge:'middle'},{parentId:''},{anchor:{round:2,index:-1,point:[0,0,0]}}]){
    assert.equal(validPlacement({...identityPlacement(),...change}),false);
  }
  for(const parentId of ['ear','missing']){const p=fixture();p.pieces[1].placement!.parentId=parentId;assert.equal(validProject(p),false);}
  const cycle=fixture();cycle.pieces[0].placement={...identityPlacement(),parentId:'ear'};assert.equal(validProject(cycle),false);
  const detached=fixture();detached.pieces[1].placement!.parentId=null;assert.equal(validProject(detached),false);
  assert.equal(validProject(fixture()),true);
});
