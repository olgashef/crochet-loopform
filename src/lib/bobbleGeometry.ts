import { SphereGeometry } from "three";

/**
 * Three closed DC lobes form one bobble, rather than three separate stitches.
 * The surface stays inside the unit sphere so ellipsoid frame bounds and the
 * renderer's conservative stitch hit target remain valid after deformation.
 */
export function createBobbleGeometry(radius = 1): SphereGeometry {
  const geometry = new SphereGeometry(radius, 36, 24);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const equator = Math.max(0, 1 - (y / radius) ** 2);
    const groove = 1 - 0.25 * equator * (0.5 + 0.5 * Math.cos(3 * angle));
    positions.setXYZ(index, x * groove, y, z * groove);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Three lobes have an asymmetric AABB; retain the known origin-centered
  // radial bound instead of Three's larger box-centered sphere estimate.
  geometry.boundingSphere!.center.set(0, 0, 0);
  geometry.boundingSphere!.radius = radius;
  // Morph targets keep each cluster's leg count and closure distinguishable.
  const variants=[2,3,4,5,5,3,5].map((legs,variant)=>{
    const shape=new SphereGeometry(radius,36,24),p=shape.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),angle=Math.atan2(z,x);
      const equator=Math.max(0,1-(y/radius)**2);
      const depth=variant===5?.09:variant===6?.32:.25;
      const rib=1-depth*equator*(.5+.5*Math.cos(legs*angle));
      const ply=1-.025*(.5+.5*Math.cos(y/radius*45+angle*3));
      const crown=variant===6&&y>0?1-.22*(y/radius)**4:1;
      p.setXYZ(i,x*rib*ply,y*crown,z*rib*ply);
    }
    shape.computeVertexNormals();return shape;
  });
  geometry.morphAttributes.position=variants.map(g=>g.getAttribute('position').clone());
  geometry.morphAttributes.normal=variants.map(g=>g.getAttribute('normal').clone());
  variants.forEach(g=>g.dispose());
  return geometry;
}
