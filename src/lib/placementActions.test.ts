import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, MathUtils, Quaternion } from 'three';
import { identityPlacement } from './assembly';
import { pastePlacement, turnPiece } from './placementActions';
import type { Position } from './geometry';
test('placement paste copies transforms and attachment independently, optionally keeping Y',()=>{
  const source={...identityPlacement(),position:[1,2,3] as Position,rotation:[30,45,10] as Position};
  const target={...identityPlacement(),position:[5,9,4] as Position};
  assert.deepEqual(pastePlacement(source,target),source);
  const result=pastePlacement(source,target,true);
  assert.deepEqual(result.position,[1,9,3]);
  result.rotation[0]=0;assert.equal(source.rotation[0],30);
});
for(const axis of ['x','z'] as const) test(`two ${axis} half-turns restore orientation and do not move the piece`,()=>{
  const source={...identityPlacement(),position:[2,3,4] as Position,rotation:[32,51,-28] as Position};
  const once=turnPiece(source,axis),twice=turnPiece(once,axis);
  const q=(rotation:Position)=>new Quaternion().setFromEuler(new Euler(...rotation.map(MathUtils.degToRad) as Position));
  assert.ok(Math.abs(q(source.rotation).dot(q(once.rotation)))<1e-8);
  assert.ok(Math.abs(q(source.rotation).dot(q(twice.rotation)))>1-1e-8);
  assert.deepEqual(once.position,source.position);
});

test('X and Z half-turns use distinct local axes',()=>{
  const source=identityPlacement();
  const x=turnPiece(source,'x'),z=turnPiece(source,'z');
  const q=(rotation:Position)=>new Quaternion().setFromEuler(new Euler(...rotation.map(MathUtils.degToRad) as Position));
  assert.ok(Math.abs(q(x.rotation).dot(new Quaternion(1,0,0,0)))>1-1e-8);
  assert.ok(Math.abs(q(z.rotation).dot(new Quaternion(0,0,1,0)))>1-1e-8);
});
