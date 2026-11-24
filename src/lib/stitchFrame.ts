import { Matrix4, Quaternion, Vector3 } from "three";
import type { ModelPoint, ModelGeometry } from "./geometry";
import { getStitchAppearance } from "./stitchAppearance";
import { buildFlatStitchFrames } from './flatGeometry';

export interface StitchFrame {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  /** Axis-aligned extents of the rotated unit ellipsoid. */
  extent: Vector3;
}

export function buildStitchFrames(
  points: ModelPoint[],
  radius = 0.25,
  placePosts = true,
  surfaceCourses?: ModelGeometry["roundCenters"],
): Map<number, StitchFrame> {
  if(points.some(p=>p.flat))return buildFlatStitchFrames(points,radius,placePosts);
  const byId = new Map(points.map((point) => [point.id, point]));
  const frames = new Map<number, StitchFrame>();
  const up = new Vector3(0, 1, 0);
  // Body-round centers remain reliable when an external chain shifts the
  // overall model bounds. Branch stitches must not pull bobbles toward a tail.
  const roundCenters = new Map<number, { sum: Vector3; count: number }>();
  for (const point of points) {
    if ("branch" in point && point.branch) continue;
    const center = roundCenters.get(point.round) ?? { sum: new Vector3(), count: 0 };
    center.sum.add(new Vector3().fromArray(point.position));
    center.count++;
    roundCenters.set(point.round, center);
  }
  for (const center of roundCenters.values()) center.sum.divideScalar(center.count);
  for(const course of surfaceCourses??[])roundCenters.get(course.round)?.sum.fromArray(course.center);
  const courses = new Map<number, { radius: number; height: number; points: ModelPoint[] }>();
  for (const point of points) {
    if (point.branch) continue;
    const course = courses.get(point.round) ?? {radius:0,height:roundCenters.get(point.round)!.sum.y,points:[]};
    course.points.push(point);
    courses.set(point.round,course);
  }
  for (const [round,course] of courses) {
    const center=roundCenters.get(round)!.sum;
    course.radius=course.points.reduce((sum,p)=>sum+new Vector3().fromArray(p.position).distanceTo(center),0)/course.points.length;
    course.points.sort((a,b)=>a.index-b.index);
  }
  const rings=new Map([...courses].map(([round,course])=>{
    const center=roundCenters.get(round)!.sum;
    return [round,course.points.map(p=>({
      angle:(Math.atan2(p.position[2]-center.z,p.position[0]-center.x)+Math.PI*2)%(Math.PI*2),
      radius:Math.hypot(p.position[0]-center.x,p.position[2]-center.z), y:p.position[1],
    })).sort((a,b)=>a.angle-b.angle)];
  }));
  const sample=(round:number,angle:number)=>{
    const ring=rings.get(round)!,center=roundCenters.get(round)!.sum, tau=Math.PI*2;
    const theta=(angle%tau+tau)%tau;
    let low=0,high=ring.length;
    while(low<high){const mid=(low+high)>>>1;if(ring[mid].angle<=theta)low=mid+1;else high=mid;}
    const a=ring[(low+ring.length-1)%ring.length],b=ring[low%ring.length];
    const start=a.angle-(low===0?tau:0),end=b.angle+(low===ring.length?tau:0);
    const t=(theta-start)/(end-start||tau),r=a.radius+(b.radius-a.radius)*t;
    return new Vector3(center.x+Math.cos(theta)*r,a.y+(b.y-a.y)*t,center.z+Math.sin(theta)*r);
  };
  for (const point of points) {
    const parents = point.parents
      .map((id) => byId.get(id))
      .filter((p) => p !== undefined);
    const axis = new Vector3(0, 1, 0);
    let span = 0;
    if (parents.length) {
      const center = parents
        .reduce(
          (sum, parent) => sum.add(new Vector3().fromArray(parent.position)),
          new Vector3(),
        )
        .divideScalar(parents.length);
      axis.fromArray(point.position).sub(center);
      span = axis.length();
      if (axis.lengthSq() < 1e-12) axis.copy(up);
      else axis.normalize();
    }
    const course = courses.get(point.round);
    const parentRound=surfaceCourses?.find(r=>r.round===point.round)?.parentRound??point.round-1;
    const childRound=surfaceCourses?.find(r=>r.parentRound===point.round)?.round??(surfaceCourses?.some(r=>r.parentRound!==undefined)?undefined:point.round+1);
    const lower = courses.get(parentRound), upper = childRound===undefined?undefined:courses.get(childRound);
    let courseSpan = 0;
    // Short SC courses follow the fabric meridian. Parent-to-child chords on
    // small rings point through the cone and make rows stick out like shingles.
    if (placePosts && !point.branch && ['sc','dec','dec3'].includes(point.type) && course && (parents.length || point.round===1)) {
      const from=lower ?? course, to=upper ?? course;
      const fromCenter=roundCenters.get(lower?parentRound:point.round)!.sum;
      const toCenter=roundCenters.get(upper?childRound!:point.round)!.sum;
      const travel=toCenter.clone().sub(fromCenter), dr=to.radius-from.radius;
      const dy=travel.length();
      if (Math.hypot(dy,dr)>1e-8) {
        const center=roundCenters.get(point.round)!.sum;
        axis.fromArray(point.position).sub(center).normalize().multiplyScalar(dr).add(travel);
        axis.normalize();
        courseSpan=Math.hypot(dy,dr)/(lower&&upper?2:1);
      }
    }
    // Use the same local surface as the backing. A circular average loses the
    // change in slope and gauge around an asymmetric course, burying some loops
    // and leaving others standing off the fabric.
    let surfaceNormal: Vector3 | null=null;
    if(surfaceCourses && placePosts && !point.branch && course && (lower||upper)) {
      const center=roundCenters.get(point.round)!.sum;
      const theta=Math.atan2(point.position[2]-center.z,point.position[0]-center.x);
      const low=sample(lower?parentRound:point.round,theta);
      const high=sample(upper?childRound!:point.round,theta);
      const meridian=high.sub(low);
      const around=sample(point.round,theta+.001).sub(sample(point.round,theta-.001));
      const normal=new Vector3().crossVectors(meridian,around);
      if(normal.dot(new Vector3().fromArray(point.position).sub(center))<0)normal.negate();
      if(normal.lengthSq()>1e-12 && meridian.lengthSq()>1e-12) {
        surfaceNormal=normal.normalize();
        if(['sc','dec','dec3'].includes(point.type)) {
          courseSpan=meridian.length()/(lower&&upper?2:1);
          axis.copy(meridian).normalize();
        }
      }
    }
    const rotation = new Quaternion().setFromUnitVectors(up, axis);
    if (placePosts && !point.branch) {
      const outward = new Vector3().fromArray(point.position).sub(roundCenters.get(point.round)?.sum ?? new Vector3());
      // Keep the radial direction in the transported course plane.
      if (outward.lengthSq() > 1e-8) {
        outward.normalize();
        if (!parents.length && point.round === 1 && !courseSpan) axis.copy(outward);
        // Preserve the exact parent axis; project the surface normal onto its
        // perpendicular plane so tall posts still meet their parent stitches.
        const reference=surfaceNormal??outward;
        const normal = reference.clone().addScaledVector(axis, -reference.dot(axis));
        if (normal.lengthSq() < 1e-8) {
          const first = roundCenters.get(1)?.sum.y ?? 0;
          const second = roundCenters.get(2)?.sum.y ?? first + 1;
          normal.set(0, first > second ? 1 : -1, 0);
          normal.addScaledVector(axis, -normal.dot(axis));
        }
        normal.normalize();
        const tangent = new Vector3().crossVectors(axis, normal).normalize();
        rotation.setFromRotationMatrix(new Matrix4().makeBasis(tangent, axis, normal));
      }
    }
    const scale = new Vector3().fromArray(
      getStitchAppearance(point.type).scale,
    );
    if (placePosts && courseSpan && course && ['sc','dec','dec3'].includes(point.type)) {
      const i=course.points.findIndex(p=>p.id===point.id), n=course.points.length;
      const position=new Vector3().fromArray(point.position);
      const spacing=(position.distanceTo(new Vector3().fromArray(course.points[(i+n-1)%n].position))
        + position.distanceTo(new Vector3().fromArray(course.points[(i+1)%n].position)))/2;
      // Size the loop envelope to the actual gauge, so adjoining rows meet at
      // every display yarn thickness without changing topology or the opening.
      scale.x=Math.max(.55,Math.min(1.6,spacing/(3.98*radius)));
      scale.y=Math.max(.55,Math.min(2,courseSpan*1.14/(4.22*radius)));
    }
    const position = new Vector3().fromArray(point.position);
    if(point.loop)position.add(new Vector3(0,0,point.loop==='front'?radius*.35:-radius*.35).applyQuaternion(rotation));
    if (placePosts && ['bobble','bobble2','bobble3','bobble4','trbo','puff','popcorn'].includes(point.type)) {
      const center = roundCenters.get(point.round)?.sum;
      const outward = position.clone().sub(center ?? new Vector3());
      // Keep the radial direction in the transported course plane.
      if (outward.lengthSq() < 1e-12) outward.set(0, 0, 1);
      else outward.normalize();
      const tangent = new Vector3().crossVectors(up, outward).normalize();
      rotation.setFromRotationMatrix(new Matrix4().makeBasis(tangent, up, outward));
      // Keep the cluster embedded at its base while projecting beyond the
      // surrounding SC beads instead of making the whole course taller.
      position.addScaledVector(outward, radius * 1.8);
    }
    if (placePosts && span > 1e-6 && ["hdc", "dc", "tr", "dtr"].includes(point.type)) {
      // A tall stitch is a body on its parent connection, not a bead balanced
      // on the upper row. Keep its tip at the row anchor and its body below it.
      const length = Math.min(2 * radius * scale.y, span * 0.9);
      scale.y = length / (2 * radius);
      position.addScaledVector(axis, -length / 2);
    }
    if(placePosts&&point.auxiliary?.kind==='foundation'&&course) {
      const i=course.points.findIndex(p=>p.id===point.id),n=course.points.length;
      const before=course.points[(i+n-1)%n],after=course.points[(i+1)%n];
      const tangent=new Vector3().fromArray(after.position).sub(new Vector3().fromArray(before.position)).normalize();
      const normal=position.clone().sub(roundCenters.get(point.round)!.sum).normalize();
      const across=tangent.clone().cross(normal).normalize();
      rotation.setFromRotationMatrix(new Matrix4().makeBasis(across,tangent,normal));
      scale.set(.5,Math.max(.6,Math.min(1.2,course.radius*Math.PI*2/n/(4.22*radius))),.75);
    }
    const matrix = new Matrix4().makeRotationFromQuaternion(rotation).elements;
    const extent = new Vector3(
      Math.hypot(matrix[0] * scale.x, matrix[4] * scale.y, matrix[8] * scale.z),
      Math.hypot(matrix[1] * scale.x, matrix[5] * scale.y, matrix[9] * scale.z),
      Math.hypot(
        matrix[2] * scale.x,
        matrix[6] * scale.y,
        matrix[10] * scale.z,
      ),
    );
    frames.set(point.id, { position, rotation, scale, extent });
  }
  return frames;
}
