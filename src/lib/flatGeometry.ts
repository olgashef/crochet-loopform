import { BufferGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import type { ModelGeometry, ModelPoint, Position } from './geometry';
import type { ParsedPattern, Stitch, StitchType } from './pattern';
import type { StitchFrame } from './stitchFrame';
import { getStitchAppearance } from './stitchAppearance';
import { PREVIEW_STITCH_WIDTH as WIDTH } from './stitchScale';

const HEIGHT: Record<StitchType,number> = {dtr:2.8,dec3:1,bobble2:1,bobble3:1,bobble4:1,trbo:1.5,puff:1.2,popcorn:1.3,sc:1,hdc:1.4,dc:1.85,tr:2.3,ch:.75,slst:.45,dec:1,bobble:1};
const vector=(p:Position)=>new Vector3().fromArray(p);

/** Open courses, with parent order reversed on each turn. Never close a seam. */
export function buildFlatGeometry(pattern:ParsedPattern):ModelGeometry {
  const points:ModelPoint[]=[],byId=new Map<number,ModelPoint>();
  const roundCenters:ModelGeometry['roundCenters']=[];
  function add(stitch:Stitch,position:Position) {
    const point:ModelPoint={...stitch,parents:[...stitch.parents],position,flat:true};
    points.push(point);byId.set(point.id,point);return point;
  }
  const chain=pattern.chainStart?.stitches??[];
  chain.forEach((s,i)=>add(s,[(i-(chain.length-1)/2)*WIDTH,0,0]));
  for(const round of pattern.rounds) {
    const direction=round.number%2?-1:1;
    const anchors=round.stitches.map(stitch=>{
      const parents=stitch.parents.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
      return parents.length?parents.reduce((sum,p)=>sum.add(vector(p.position)),new Vector3()).divideScalar(parents.length):new Vector3(0,(round.number-1)*.92,0);
    });
    const centerX=anchors.reduce((sum,p)=>sum+p.x,0)/Math.max(1,anchors.length);
    const body=round.stitches.map((stitch,i)=>{
      const even=centerX+direction*(i-(round.stitches.length-1)/2)*WIDTH;
      const parents=stitch.parents.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
      // Points mark post centers. Connect the two half-posts rather than
      // leaving a full stitch-height gap above the smaller foundation loops.
      const parentHalf=parents.length?parents.reduce((sum,p)=>sum+(p.auxiliary?.kind==='foundation'?.22:.46*HEIGHT[p.type]),0)/parents.length:.46;
      return add(stitch,[even*.7+anchors[i].x*.3,anchors[i].y+parentHalf+.46*HEIGHT[stitch.type],0]);
    });
    const before=pattern.rounds[round.number-2]?.stitches.at(-1);
    const anchor=before?byId.get(before.id):undefined;
    for(const stitch of pattern.stitches.filter(s=>s.round===round.number&&s.auxiliary?.kind==='turning')) {
      if(!body.length)continue;
      const trailing=stitch.id>round.stitches.at(-1)!.id;
      const root=trailing?body.at(-1):anchor;
      if(!root)continue;
      const t=stitch.auxiliary!.step/(stitch.auxiliary!.count+1);
      add(stitch,[root.position[0]+(trailing?direction:-direction)*WIDTH*.6,root.position[1]+(trailing?.92:body[0].position[1]-root.position[1])*t,0]);
    }
    for(const stitch of pattern.stitches.filter(s=>s.round===round.number&&s.branch)) {
      const branch=stitch.branch!,root=byId.get(branch.anchor);if(!root)continue;
      add(stitch,[root.position[0]+direction*branch.step*WIDTH*.72,root.position[1]+.2*Math.sin(branch.step/branch.length*Math.PI)+(branch.returning?.16:0),0]);
    }
    if(body.length) {
      const center=body.reduce((sum,p)=>sum.add(vector(p.position)),new Vector3()).divideScalar(body.length);
      roundCenters.push({round:round.number,center:center.toArray(),radius:body.length*WIDTH/2,
        height:.92*round.stitches.reduce((sum,s)=>sum+HEIGHT[s.type],0)/body.length,count:body.length});
    }
  }
  points.sort((a,b)=>a.id-b.id);
  const links:ModelGeometry['links']=[],seen=new Set<string>();
  for(const p of points)for(const [from,kind] of [[p.previous,'course'],...p.parents.map(id=>[id,'parent'])] as [number|null,'course'|'parent'][]) {
    if(from===null || !byId.has(from) || from===p.id)continue;
    const key=`${Math.min(from,p.id)}:${Math.max(from,p.id)}:${kind}`;
    if(!seen.has(key)){seen.add(key);links.push({from,to:p.id,kind,color:p.color});}
  }
  if(!points.length)return {construction:'rows',endClosed:false,points,links,roundCenters,bounds:{width:0,height:0,depth:0}};
  const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const p of points){min.min(vector(p.position));max.max(vector(p.position));}
  const center=min.clone().add(max).multiplyScalar(.5);
  const place=(p:Position):Position=>{
    const v=vector(p).sub(center);if(pattern.orientation==='top-down')v.y*=-1;return v.toArray();
  };
  points.forEach(p=>p.position=place(p.position));roundCenters.forEach(r=>r.center=place(r.center));
  return {construction:'rows',endClosed:false,points,links,roundCenters,bounds:{width:max.x-min.x,height:max.y-min.y,depth:0}};
}

/** Flat stitches face the fabric plane instead of an imaginary circular center. */
export function buildFlatStitchFrames(points:ModelPoint[],radius:number,placePosts:boolean):Map<number,StitchFrame> {
  const frames=new Map<number,StitchFrame>(),byId=new Map(points.map(p=>[p.id,p]));
  for(const p of points) {
    const position=vector(p.position),rotation=new Quaternion();
    const scale=new Vector3().fromArray(getStitchAppearance(p.type).scale);
    const parents=p.parents.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
    const axis=parents.length?position.clone().sub(parents.reduce((s,p)=>s.add(vector(p.position)),new Vector3()).divideScalar(parents.length)):p.flat&&!p.auxiliary?new Vector3(position.x,position.y,0).normalize():new Vector3(0,1,0);
    if(placePosts) {
      if(p.auxiliary?.kind==='foundation'){scale.set(WIDTH/(3.98*radius),.55,1);}
      else if(p.auxiliary?.kind==='turning'){scale.set(.55,.65,1);}
      else if(p.branch){scale.multiplyScalar(.8);}
      else {
        // Keep loops on the surface; changes in stitch height are in the row geometry.
        if(axis.lengthSq()>1e-10){axis.normalize();const normal=new Vector3(0,0,1).addScaledVector(axis,-axis.z);
          if(normal.lengthSq()<1e-8){normal.set(position.x,position.y,0);normal.addScaledVector(axis,-normal.dot(axis));}
          if(normal.lengthSq()<1e-8)normal.set(1,0,0);
          normal.normalize();const tangent=axis.clone().cross(normal).normalize();rotation.setFromRotationMatrix(new Matrix4().makeBasis(tangent,axis,normal));}
        if(['bobble','bobble2','bobble3','bobble4','trbo','puff','popcorn'].includes(p.type))position.z+=radius*1.8;
        else {scale.x=WIDTH/(3.98*radius);scale.y=.92*HEIGHT[p.type]*1.14/(4.22*radius);}
      }
    }
    if(p.loop)position.z+=p.loop==='front'?radius*.35:-radius*.35;
    const m=new Matrix4().makeRotationFromQuaternion(rotation).elements;
    const extent=new Vector3(Math.hypot(m[0]*scale.x,m[4]*scale.y,m[8]*scale.z),Math.hypot(m[1]*scale.x,m[5]*scale.y,m[9]*scale.z),Math.hypot(m[2]*scale.x,m[6]*scale.y,m[10]*scale.z));
    frames.set(p.id,{position,rotation,scale,extent});
  }
  return frames;
}

/** Shared rectangular surface for backing, eyes, and embroidery. */
export function flatSurface(model:ModelGeometry,visibleRounds=Infinity) {
  const rows=model.roundCenters.filter(r=>r.round<=visibleRounds).map(r=>({
    ...r,points:model.points.filter(p=>p.round===r.round&&!p.auxiliary&&!p.branch).sort((a,b)=>a.position[0]-b.position[0]),
  })).filter(r=>r.points.length);
  function at(index:number,u:number) {
    const row=rows[index];if(!row)return null;
    const first=row.points[0],last=row.points.at(-1)!;
    const x=first.position[0]-WIDTH*.48+Math.max(0,Math.min(1,u))*(last.position[0]-first.position[0]+WIDTH*.96);
    let right=row.points.findIndex(p=>p.position[0]>=x);if(right<0)right=row.points.length-1;
    const a=row.points[Math.max(0,right-1)],b=row.points[right];
    const t=Math.max(0,Math.min(1,(x-a.position[0])/(b.position[0]-a.position[0]||1)));
    return {position:new Vector3(x,a.position[1]+(b.position[1]-a.position[1])*t,0),stitch:t<.5?a:b};
  }
  const direction=rows.length>1?Math.sign(rows[1].center[1]-rows[0].center[1])||1:Math.sign((rows[0]?.center[1]??0)-(model.points.find(p=>p.auxiliary?.kind==='foundation')?.position[1]??-1))||1;
  function sample(round:number,u:number) {
    if(!rows.length || round<.5 || round>rows.length+.5)return null;
    const index=Math.max(0,Math.min(rows.length-1,Math.floor(round)-1));
    const a=at(index,u)!;
    if(round<1)a.position.y-=direction*rows[0].height*(1-round);
    else if(round>rows.length)a.position.y+=direction*rows.at(-1)!.height*(round-rows.length);
    else {const b=at(Math.min(rows.length-1,index+1),u)!;a.position.lerp(b.position,round-Math.floor(round));}
    return a;
  }
  return {rows,sample,at};
}

export function createFlatFabricGeometry(model:ModelGeometry,visibleRounds:number,inset:number):BufferGeometry {
  const surface=flatSurface(model,visibleRounds),positions:number[]=[],colors:number[]=[],ids:number[]=[];
  const segments=Math.max(1,...surface.rows.map(r=>r.count))*2;
  const rgb=new Color();
  const boundaries=[.5,...surface.rows.map(r=>r.round),surface.rows.length+.5];
  for(let row=1;row<boundaries.length;row++)for(let col=0;col<segments;col++) {
    const a=surface.sample(boundaries[row-1],col/segments),b=surface.sample(boundaries[row-1],(col+1)/segments);
    const c=surface.sample(boundaries[row],(col+1)/segments),d=surface.sample(boundaries[row],col/segments);
    if(!a||!b||!c||!d)continue;
    const midLeft=a.position.clone().lerp(d.position,.5),midRight=b.position.clone().lerp(c.position,.5);
    for(const [vertices,stitch] of [[[a.position,b.position,midRight,a.position,midRight,midLeft],a.stitch],[[midLeft,midRight,c.position,midLeft,c.position,d.position],d.stitch]] as [Vector3[],ModelPoint][]) {
      rgb.set(stitch.color);
      for(const p of vertices){positions.push(p.x,p.y,-Math.max(0,inset));colors.push(rgb.r,rgb.g,rgb.b);ids.push(stitch.id);}
    }
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setAttribute('stitchId',new Float32BufferAttribute(ids,1));geometry.computeVertexNormals();
  if(positions.length){geometry.computeBoundingBox();geometry.computeBoundingSphere();}return geometry;
}
