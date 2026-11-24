import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import type { ModelGeometry, ModelPoint, Position } from './geometry';

export interface PiecePlacement {
  /** Only the main piece can be a parent. Coordinates are local to that parent. */
  parentId: string | null;
  position: Position;
  rotation: Position;
  scale: number;
  edge: 'first' | 'last';
  anchor?: { round: number; index: number; point: Position };
}
export const identityPlacement = (): PiecePlacement => ({ parentId: null, position: [0,0,0], rotation: [0,0,0], scale: 1, edge: 'last' });
const validVector = (v: unknown, limit: number): v is Position => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit);
export function validPlacement(value: unknown): value is PiecePlacement {
  if (!value || typeof value !== 'object') return false;
  const p = value as PiecePlacement;
  return (p.parentId === null || (typeof p.parentId === 'string' && !!p.parentId)) && validVector(p.position,10000) && validVector(p.rotation,36000)
    && Number.isFinite(p.scale) && p.scale >= .01 && p.scale <= 25 && ['first','last'].includes(p.edge)
    && (p.anchor === undefined || (!!p.anchor && Number.isInteger(p.anchor.round) && p.anchor.round >= 1 && p.anchor.round <= 150
      && Number.isInteger(p.anchor.index) && p.anchor.index >= 0 && p.anchor.index < 8000 && validVector(p.anchor.point,10000)));
}
export function piecePivot(model: ModelGeometry, edge: PiecePlacement['edge']): Vector3 {
  const round = edge === 'first' ? model.roundCenters[0] : model.roundCenters.at(-1);
  return round ? new Vector3().fromArray(round.center) : new Vector3();
}
export function findAnchor(model: ModelGeometry, placement: PiecePlacement): ModelPoint | undefined {
  return model.points.find(p => !p.branch && !p.auxiliary && p.round === placement.anchor?.round && p.index === placement.anchor?.index);
}
export function placementPosition(placement: PiecePlacement, parent?: ModelGeometry): Vector3 {
  const position = new Vector3().fromArray(placement.position);
  if (placement.parentId && placement.anchor) position.add(new Vector3().fromArray((parent && findAnchor(parent,placement)?.position) || placement.anchor.point));
  return position;
}
export function surfaceNormal(model: ModelGeometry, point: ModelPoint): Vector3 {
  if(model.construction==='rows')return new Vector3(0,0,1);
  const centers = model.roundCenters;
  const index = centers.findIndex(r => r.round === point.round);
  const current = centers[index];
  const radial = new Vector3().fromArray(point.position).sub(new Vector3().fromArray(current?.center??[0,0,0]));
  if (radial.lengthSq() < 1e-10) radial.set(0,0,1);
  radial.normalize();
  const before = centers[Math.max(0,index-1)], after = centers[Math.min(centers.length-1,index+1)];
  if (!before || !after) return radial;
  const travel = new Vector3().fromArray(after.center).sub(new Vector3().fromArray(before.center));
  const rise=travel.length(), dr=after.radius-before.radius;
  if (rise < 1e-8) return radial;
  return radial.multiplyScalar(rise).addScaledVector(travel,-dr/rise).normalize();
}
export function attachAtStitch(parentId: string, parent: ModelGeometry, child: ModelGeometry, point: ModelPoint, previous: PiecePlacement): PiecePlacement {
  const pivot = piecePivot(child,previous.edge);
  const other = piecePivot(child,previous.edge === 'first' ? 'last' : 'first');
  const direction = other.sub(pivot).normalize();
  if (direction.lengthSq() < 1e-8) direction.set(0,1,0);
  const normal = surfaceNormal(parent,point);
  const q = new Quaternion().setFromUnitVectors(direction,normal);
  const rotation = new Euler().setFromQuaternion(q,'XYZ');
  return { ...previous, parentId, scale: MathUtils.clamp(previous.scale,.1,5), position: normal.multiplyScalar(-.12).toArray() as Position,
    rotation: [rotation.x,rotation.y,rotation.z].map(MathUtils.radToDeg) as Position,
    anchor: { round:point.round,index:point.index,point:[...point.position] } };
}
export function stagedPlacement(index: number, main: ModelGeometry, model: ModelGeometry): PiecePlacement {
  return { ...identityPlacement(), position:[main.bounds.width/2+model.bounds.width/2+2+(Math.floor((index-1)/3)*4),((index-1)%3-1)*4,0] };
}

/** Detaching preserves the visible pose, including a rotated/scaled main piece. */
export function detachPlacement(child: PiecePlacement, main: PiecePlacement, model: ModelGeometry): PiecePlacement {
  if (!child.parentId) return { ...child };
  const compose = (p: PiecePlacement, position: Vector3) => new Matrix4().compose(position,
    new Quaternion().setFromEuler(new Euler(...p.rotation.map(MathUtils.degToRad) as Position, 'XYZ')),
    new Vector3().setScalar(p.scale));
  const matrix = compose(main,new Vector3().fromArray(main.position)).multiply(compose(child,placementPosition(child,model)));
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  matrix.decompose(position,rotation,scale);
  const euler = new Euler().setFromQuaternion(rotation,'XYZ');
  return { parentId:null, edge:child.edge, position:position.toArray(), rotation:[euler.x,euler.y,euler.z].map(MathUtils.radToDeg) as Position, scale:MathUtils.clamp(scale.x,.01,25) };
}

export function earPattern(color = '#cba477'): string {
  return `Pattern name: "Ear"
start: magic ring
orientation top-down
[${color}]
Round 1: 6 sc in mr → 6
Round 2: 6 inc → 12
Round 3: (sc, inc) x6 → 18
Round 4-6: 18 sc → 18
Round 7: (sc, dec) x6 → 12
fasten off`;
}
