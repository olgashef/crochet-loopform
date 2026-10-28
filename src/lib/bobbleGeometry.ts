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
  return geometry;
}
