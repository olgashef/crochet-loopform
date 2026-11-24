import type { Stitch } from './pattern';

export interface GrowthMode { cosine: number; sine: number }
export interface CourseGrowth { shift: [number,number]; outline: GrowthMode[] }

/**
 * Low-order Fourier approximation of circumferential growth. A parent shared by
 * two children gains one stitch width; a child spanning two parents removes one.
 * The mean is handled by the count-based radius in geometry.ts. The first mode
 * is a translation of a circular course, not a radial bump. Higher modes describe
 * oval/lobed outlines. The 1/(1+k²/2) filter penalizes angular roughness, avoiding
 * isolated spikes. This is a gauge-based preview, not a calibrated cloth solver.
 */
export function courseGrowth(
  stitches: Stitch[], parentAngles: Map<number,number>, stitchWidth: number, materialHeight: number,
): CourseGrowth {
  const allocations=new Map<number,number>();
  for(const stitch of stitches) for(const parent of stitch.parents) {
    if(parentAngles.has(parent)) allocations.set(parent,(allocations.get(parent)??0)+1/stitch.parents.length);
  }
  const sites=[...allocations].map(([id,children])=>({angle:parentAngles.get(id)!,growth:children-1}));
  const mean=sites.reduce((sum,s)=>sum+s.growth,0)/(sites.length||1);
  const modes: GrowthMode[]=Array.from({length:3},(_,index)=>{
    const k=index+1;
    // Do not interpret frequencies beyond this course's sampling resolution.
    if(k*2>=sites.length)return {cosine:0,sine:0};
    // A conservative relaxation gain for this geometric approximation. The
    // count-based radius already accounts for mean growth; applying the full
    // directional residual stretched the outside of the bulge too aggressively.
    const gain=.35*stitchWidth/Math.PI/(1+.5*k*k);
    const cosine=gain*sites.reduce((sum,s)=>sum+(s.growth-mean)*Math.cos(k*s.angle),0);
    const sine=gain*sites.reduce((sum,s)=>sum+(s.growth-mean)*Math.sin(k*s.angle),0);
    return {cosine:Math.abs(cosine)<1e-10?0:cosine,sine:Math.abs(sine)<1e-10?0:sine};
  });
  const first=modes[0],length=Math.hypot(first.cosine,first.sine);
  // A course cannot shift laterally by an arbitrarily large fraction of its
  // available meridional yarn. Limit extreme patterns without losing direction.
  const factor=length>0?Math.min(1,materialHeight*.3/length):1;
  const outline=modes.slice(1);
  const amplitude=outline.reduce((sum,m)=>sum+Math.hypot(m.cosine,m.sine),0);
  const outlineFactor=amplitude>0?Math.min(1,materialHeight*.25/amplitude):1;
  return {
    shift:[first.cosine*factor,first.sine*factor],
    outline:outline.map(m=>({cosine:m.cosine*outlineFactor,sine:m.sine*outlineFactor})),
  };
}

export function growOutline(previous: GrowthMode[], growth: GrowthMode[], radius: number, previousRadius: number): GrowthMode[] {
  const contraction=previousRadius>0?Math.min(1,radius/previousRadius):1;
  const result=growth.map((mode,i)=>({cosine:mode.cosine+(previous[i]?.cosine??0)*contraction,sine:mode.sine+(previous[i]?.sine??0)*contraction}));
  const amplitude=result.reduce((sum,m)=>sum+Math.hypot(m.cosine,m.sine),0);
  const factor=amplitude>0?Math.min(1,radius*.3/amplitude):1;
  return result.map(m=>({cosine:m.cosine*factor,sine:m.sine*factor}));
}
export function outlineOffset(modes: GrowthMode[], angle: number): number {
  return modes.reduce((sum,m,i)=>sum+m.cosine*Math.cos((i+2)*angle)+m.sine*Math.sin((i+2)*angle),0);
}
