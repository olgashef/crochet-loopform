import * as THREE from 'three';
import type { ModelGeometry } from './geometry';
import type { ParsedPattern } from './pattern';
import { createYarnGeometry } from './yarnGeometry';
import { createFabricGeometry } from './fabricGeometry';
import { createBobbleGeometry } from './bobbleGeometry';
import { buildStitchFrames } from './stitchFrame';
import { buildSafetyEyes } from './safetyEyes';
import { createEmbroideryMesh } from './embroideryMesh';

/** Shared yarn geometry per piece, retaining all stitch colors and accessories. */
export function createPieceMesh(model: ModelGeometry, pattern: ParsedPattern, thickness: number) {
  const group = new THREE.Group();
  if (!model.points.length) return group;
  const material = new THREE.MeshStandardMaterial({roughness:.94,metalness:0});
  const frames = buildStitchFrames(model.points,.25*thickness,true);
  const nodes = new THREE.InstancedMesh(createYarnGeometry(.25*thickness),material,model.points.length);
  const transform = new THREE.Object3D(), color = new THREE.Color();
  model.points.forEach((p,i) => {
    const f = frames.get(p.id)!;
    transform.position.copy(f.position); transform.quaternion.copy(f.rotation); transform.scale.copy(f.scale);
    if(p.type==='bobble') transform.scale.multiplyScalar(.5);
    transform.updateMatrix(); nodes.setMatrixAt(i,transform.matrix); nodes.setColorAt(i,color.set(p.color));
  });
  nodes.computeBoundingSphere(); group.add(nodes);
  const bobbles = model.points.filter(p=>p.type==='bobble');
  if(bobbles.length) {
    const mesh = new THREE.InstancedMesh(createBobbleGeometry(.25*thickness),material,bobbles.length);
    bobbles.forEach((p,i)=> {const f=frames.get(p.id)!;transform.position.copy(f.position);transform.quaternion.copy(f.rotation);transform.scale.copy(f.scale);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);mesh.setColorAt(i,color.set(p.color));});
    mesh.computeBoundingSphere();group.add(mesh);
  }
  group.add(new THREE.Mesh(createFabricGeometry(model,Infinity,.15),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide})));
  const eyeMaterial = new THREE.MeshPhysicalMaterial({color:'#080a09',roughness:.13,clearcoat:1});
  const eyes = buildSafetyEyes(model,pattern.eyes);
  for(const eye of eyes) {
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1,24,16),eyeMaterial);
    pupil.position.fromArray(eye.position);pupil.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3().fromArray(eye.normal));
    pupil.scale.set(eye.size/2,eye.size/2,eye.size*.28);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:'#ffffff'}));
    glint.position.set(-.24,.28,.9);pupil.add(glint);group.add(pupil);
  }
  if(!eyes.length) eyeMaterial.dispose();
  group.add(createEmbroideryMesh(model, pattern.embroidery, thickness));
  return group;
}
export function disposePieceMesh(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(object=> {if(object instanceof THREE.Mesh) {geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));if(object instanceof THREE.InstancedMesh)object.dispose();}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
