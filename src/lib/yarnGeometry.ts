import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';

/** A continuous interlocking crochet loop with three subtle twisted yarn plies. */
export function createYarnGeometry(radius: number) {
  const points = [
    [-.37,.28,-.04],[-.29,.41,.02],[-.14,.32,.13],[.02,-.28,.17],
    [.16,-.39,.08],[.31,-.20,-.06],[.37,.28,-.04],[.29,.41,.02],
    [.14,.32,.13],[-.02,-.28,.01],[-.16,-.39,-.08],[-.31,-.20,-.06],
  ].map(p => new Vector3(p[0]*radius*4,p[1]*radius*4,p[2]*radius*4));
  const curve = new CatmullRomCurve3(points,true,'centripetal');
  const segments = 64, radial = 9;
  const geometry = new TubeGeometry(curve,segments,radius*.51,radial,true);
  const positions = geometry.getAttribute('position');
  // The shallow helical ridges catch light like plied yarn, without a texture
  // atlas or separate geometry/draw calls for every fiber.
  for (let i=0;i<=segments;i++) {
    const center = curve.getPointAt(i/segments);
    for(let j=0;j<=radial;j++) {
      const index=i*(radial+1)+j;
      const ripple=1+.085*Math.cos(j/radial*Math.PI*6+i/segments*Math.PI*36);
      const p=new Vector3().fromBufferAttribute(positions,index).sub(center).multiplyScalar(ripple).add(center);
      positions.setXYZ(index,p.x,p.y,p.z);
    }
  }
  geometry.computeVertexNormals();
  const variants=[1,2,3,4,5].map(count=>{
    const chainPoints:Vector3[]=[];
    for(let link=0;link<count;link++)for(let i=0;i<12;i++){
      const p=curve.getPoint(i/12);
      chainPoints.push(new Vector3(p.x*.72,p.y/count+(link-(count-1)/2)*radius*3.1/count,p.z));
    }
    const path=new CatmullRomCurve3(chainPoints,false,'centripetal');
    return new TubeGeometry(path,segments,radius*.40,radial,false);
  });
  geometry.morphAttributes.position=variants.map(g=>g.getAttribute('position').clone());
  geometry.morphAttributes.normal=variants.map(g=>g.getAttribute('normal').clone());
  variants.forEach(g=>g.dispose());
  return geometry;
}
