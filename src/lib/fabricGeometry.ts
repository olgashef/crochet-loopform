import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';
import type { ModelGeometry, ModelPoint } from './geometry';
import { createFlatFabricGeometry } from './flatGeometry';

const TAU = Math.PI * 2;
interface Ring {
  round?: number;
  parentRound?: number;
  center: Vector3;
  points: { angle: number; radius: number; point: ModelPoint }[];
}
const angleOf = (x: number, z: number) => (Math.atan2(z, x) + TAU) % TAU;

/**
 * A thin backing beneath the yarn loops, using only the body's existing profile.
 * Pass the row-offset-adjusted model; no shaping, positions, or colors are changed.
 */
export function createFabricGeometry(
  model: ModelGeometry,
  visibleRounds = Infinity,
  inset = 0.16,
): BufferGeometry {
  if(model.planarFoundation) {
    // Triangulate each flat annulus at a shared angular resolution, including
    // the center, so no cylindrical wall or hollow tube is introduced.
    const rings=model.roundCenters.filter(r=>r.round<=visibleRounds).map(r=>model.points.filter(p=>p.round===r.round&&!p.branch));
    const vertices:number[]=[],colors:number[]=[],ids:number[]=[];
    const sample=(ring:ModelPoint[],u:number)=>{const f=u*ring.length,i=Math.floor(f)%ring.length,t=f-Math.floor(f);return new Vector3().fromArray(ring[i].position).lerp(new Vector3().fromArray(ring[(i+1)%ring.length].position),t);};
    const n=Math.max(32,...rings.map(r=>r.length*2));
    for(let row=0;row<rings.length;row++)for(let i=0;i<n;i++) {
      const u=i/n,v=(i+1)/n,outer=rings[row],inner=rings[row-1];
      const a=inner?sample(inner,u):new Vector3(),b=inner?sample(inner,v):new Vector3(),c=sample(outer,v),d=sample(outer,u);
      const stitch=outer[Math.floor(u*outer.length)],color=new Color(stitch.color);
      for(const p of [a,b,c,a,c,d]){vertices.push(p.x,p.y,p.z-inset);colors.push(color.r,color.g,color.b);ids.push(stitch.id);}
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.setAttribute('stitchId',new Float32BufferAttribute(ids,1));g.computeVertexNormals();return g;
  }
  if(model.construction==='rows')return createFlatFabricGeometry(model,visibleRounds,inset);
  const byRound = new Map<number, ModelPoint[]>();
  for (const point of model.points) {
    if (point.branch || point.round > visibleRounds) continue;
    const points = byRound.get(point.round) ?? [];
    points.push(point);
    byRound.set(point.round, points);
  }
  const rings: Ring[] = model.roundCenters.flatMap(round => {
    const points = byRound.get(round.round);
    if (!points?.length || round.round > visibleRounds) return [];
    const center = new Vector3().fromArray(round.center);
    return [{ round:round.round,parentRound:round.parentRound,center, points: points.map(point => {
      const x = point.position[0] - center.x;
      const z = point.position[2] - center.z;
      return { angle: angleOf(x, z), radius: Math.hypot(x, z), point };
    }).sort((a, b) => a.angle - b.angle) }];
  });
  const complete = rings.length === model.roundCenters.length;
  // The anchor lies through the loop, not at its outer edge. Carry the thin
  // fabric to the exposed loop edge so an open rim has no dangling half-row.
  // Keep the zero-inset picking/projection surface on the original anchors.
  if (inset > 0 && model.endClosed === false && rings.length > 1) {
    const last = rings.at(-1)!, previous = rings.at(-2)!;
    const radius = (ring: Ring) => ring.points.reduce((n,p)=>n+p.radius,0)/ring.points.length;
    const dr=(radius(last)-radius(previous))*.32, dy=(last.center.y-previous.center.y)*.32;
    rings.push({center:last.center.clone().add(new Vector3(0,dy,0)), points:last.points.map(p=>({
      ...p, radius:Math.max(.02,p.radius+dr), point:{...p.point,position:[p.point.position[0],p.point.position[1]+dy,p.point.position[2]]},
    }))});
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const stitchIds: number[] = [];
  const colorCache = new Map<string, Color>();
  const depth = Number.isFinite(inset) ? Math.max(0, inset) : 0.16;

  // Interpolation around the actual rings retains local shaping and unequal
  // stitch heights while a common angle prevents seams at increases/decreases.
  function rawSample(ring: Ring, angle: number) {
    const theta = (angle % TAU + TAU) % TAU;
    let low = 0, high = ring.points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ring.points[middle].angle <= theta) low = middle + 1;
      else high = middle;
    }
    const right = ring.points[low % ring.points.length];
    const left = ring.points[(low + ring.points.length - 1) % ring.points.length];
    const leftAngle = left.angle - (low === 0 ? TAU : 0);
    const rightAngle = right.angle + (low === ring.points.length ? TAU : 0);
    const fraction = (theta - leftAngle) / (rightAngle - leftAngle || TAU);
    const radius = Math.max(0.02, left.radius + (right.radius - left.radius) * fraction);
    const y = left.point.position[1] + (right.point.position[1] - left.point.position[1]) * fraction;
    return {
      position: new Vector3(ring.center.x + Math.cos(theta) * radius, y, ring.center.z + Math.sin(theta) * radius),
      stitch: (fraction < 0.5 ? left : right).point,
    };
  }
  const ringIndices=new Map(rings.map((ring,index)=>[ring,index]));
  function sample(ring: Ring, angle: number) {
    const result=rawSample(ring,angle);
    if(!depth || rings.length<2)return result;
    const index=ringIndices.get(ring)!;
    const before=rings.find(r=>r.round===ring.parentRound)??rings[Math.max(0,index-1)],after=rings.find(r=>r.parentRound===ring.round)??ring;
    const along=rawSample(after,angle).position.sub(rawSample(before,angle).position);
    const around=rawSample(ring,angle+.001).position.sub(rawSample(ring,angle-.001).position);
    const normal=along.cross(around);
    if(normal.dot(result.position.clone().sub(ring.center))<0)normal.negate();
    if(normal.lengthSq()>1e-12)result.position.addScaledVector(normal.normalize(),-depth);
    return result;
  }
  function triangle(a: Vector3, b: Vector3, c: Vector3, stitch: ModelPoint, outward: Vector3) {
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-18) return;
    if (normal.dot(outward) < 0) [b, c] = [c, b];
    const color=stitch.color;
    let rgb = colorCache.get(color);
    if (!rgb) { rgb = new Color(color); colorCache.set(color, rgb); }
    for (const position of [a, b, c]) {
      positions.push(position.x, position.y, position.z);
      colors.push(rgb.r, rgb.g, rgb.b);
      stitchIds.push(stitch.id);
    }
  }
  function quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, stitch: ModelPoint, outward: Vector3) {
    triangle(a, b, c, stitch, outward);
    triangle(a, c, d, stitch, outward);
  }
  // Every strip must share identical boundary vertices. Per-strip counts left
  // cracks at increases: the two sides sampled the same inset ring differently.
  const segments = Math.max(24, ...rings.map(ring => ring.points.length * 2));
  for (let index = 1; index < rings.length; index++) {
    const upper = rings[index], lower = rings.find(r=>r.round===upper.parentRound)??rings[index - 1];
    const worked=new Set(upper.points.flatMap(p=>p.point.parents));
    for (let segment = 0; segment < segments; segment++) {
      const start = segment * TAU / segments, end = (segment + 1) * TAU / segments;
      if(upper.round!==undefined&&worked.size&&!worked.has(sample(lower,(start+end)/2).stitch.id))continue;
      const a = sample(lower, start).position, b = sample(lower, end).position;
      const c = sample(upper, end).position, d = sample(upper, start).position;
      const left = a.clone().lerp(d, 0.5), right = b.clone().lerp(c, 0.5);
      const middle = (start + end) / 2;
      const outward = new Vector3(Math.cos(middle), 0, Math.sin(middle));
      // Keep yarn changes crisp instead of interpolating unrelated RGB colors.
      quad(a, left, right, b, sample(lower, middle).stitch, outward);
      quad(left, d, c, right, sample(upper, middle).stitch, outward);
    }
  }
  function cap(index: number) {
    const ring = rings[index];
    if (!ring || ring.points.length > 8) return;
    const neighbor = rings[index === 0 ? 1 : index - 1];
    const sign = Math.sign(ring.center.y - (neighbor?.center.y ?? ring.center.y)) || (index === 0 ? -1 : 1);
    const outward = new Vector3(0, sign, 0);
    const center = ring.center.clone().addScaledVector(outward,-depth);
    for (let segment = 0; segment < segments; segment++) {
      const start = segment * TAU / segments, end = (segment + 1) * TAU / segments;
      triangle(center, sample(ring, start).position, sample(ring, end).position, sample(ring, (start + end) / 2).stitch, outward);
    }
  }
  if(!model.openFoundation)cap(0);
  if (rings.length > 1 && model.endClosed !== false && complete) cap(rings.length - 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('stitchId', new Float32BufferAttribute(stitchIds, 1));
  geometry.computeVertexNormals();
  if (positions.length) { geometry.computeBoundingBox(); geometry.computeBoundingSphere(); }
  return geometry;
}
