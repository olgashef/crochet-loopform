import { Mesh, InstancedMesh, Matrix4, type Raycaster, type Intersection } from 'three';
import type { StitchType } from './pattern';

/** Set per-stitch geometry while retaining shared meshes, colors and picking IDs. */
const carrier = new Mesh();
export function setStitchMorph(mesh:InstancedMesh,index:number,target:number|undefined) {
  const count=mesh.geometry.morphAttributes.position?.length??0;
  if(!count)return;
  carrier.morphTargetInfluences=Array.from({length:count},(_,i)=>i===target?1:0);
  mesh.setMorphAt(index,carrier);
  if(mesh.morphTexture)mesh.morphTexture.needsUpdate=true;
}
export const CLUSTER_TYPES:StitchType[]=['bobble2','bobble3','bobble4','bobble','trbo','puff','popcorn'];

/** Three's stock instance picking uses the base mesh, ignoring per-instance morphs. */
export class StitchInstancedMesh extends InstancedMesh {
  override raycast(raycaster:Raycaster,intersects:Intersection[]) {
    const proxy=new Mesh(this.geometry,this.material),matrix=new Matrix4();
    const hits:Intersection[]=[];
    for(let i=0;i<this.count;i++) {
      this.getMatrixAt(i,matrix);
      proxy.matrixWorld.multiplyMatrices(this.matrixWorld,matrix);
      if(this.morphTexture)this.getMorphAt(i,proxy);
      proxy.raycast(raycaster,hits);
      for(const hit of hits){hit.instanceId=i;hit.object=this;intersects.push(hit);}
      hits.length=0;
    }
  }
}
