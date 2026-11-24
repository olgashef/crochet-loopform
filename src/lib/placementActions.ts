import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { PiecePlacement } from './assembly';
import type { Position } from './geometry';

export function pastePlacement(source: PiecePlacement, target: PiecePlacement, keepY=false): PiecePlacement {
  const result=structuredClone(source);
  if(keepY) result.position[1]=target.position[1];
  return result;
}
/** A half-turn around the piece's chosen local axis, retaining its location and tilt. */
export function turnPiece(placement: PiecePlacement, axis: 'x' | 'z' = 'z'): PiecePlacement {
  const q=new Quaternion().setFromEuler(new Euler(...placement.rotation.map(MathUtils.degToRad) as Position));
  q.multiply(new Quaternion().setFromAxisAngle(axis==='x'?new Vector3(1,0,0):new Vector3(0,0,1),Math.PI));
  const e=new Euler().setFromQuaternion(q);
  return {...placement,rotation:[e.x,e.y,e.z].map(MathUtils.radToDeg) as Position};
}
