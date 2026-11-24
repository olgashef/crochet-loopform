import { courseGrowth, growOutline, outlineOffset, type GrowthMode } from "./courseGrowth";
import { Quaternion, Vector3 } from "three";
import { closesLastRound } from './pieceEdge';
import type { ParsedPattern, Stitch, StitchType } from "./pattern";
import { PREVIEW_STITCH_WIDTH } from './stitchScale';
import { buildFlatGeometry } from './flatGeometry';

export type Position = [number, number, number];

export interface ModelPoint {
  id: number;
  round: number;
  index: number;
  color: string;
  patternColor?: string;
  paintSourceLine?: number;
  type: StitchType;
  position: Position;
  parents: number[];
  previous: number | null;
  isIncrease: boolean;
  loop?: 'front'|'back';
  countedChain?:number;
  branch?: Stitch["branch"];
  auxiliary?: Stitch['auxiliary'];
  flat?: boolean;
}

export interface ModelLink {
  from: number;
  to: number;
  kind: "course" | "parent";
  color: string;
}

export interface ModelGeometry {
  planarFoundation?: boolean;
  openFoundation?: boolean;
  construction?: 'rows';
  endClosed?: boolean;
  points: ModelPoint[];
  links: ModelLink[];
  bounds: { width: number; height: number; depth: number };
  roundCenters: {
    round: number;
    center: Position;
    radius: number;
    height: number;
    count: number;
    parentRound?: number;
  }[];
}

const TAU = Math.PI * 2;
// Right-handed rounds advance counterclockwise in the construction plane.
const ROUND_DIRECTION = -1;
const STITCH_WIDTH = PREVIEW_STITCH_WIDTH;
const COURSE_HEIGHT = 0.92;

/** Relative material heights, kept separate from display yarn thickness. */
const HEIGHT: Record<StitchType, number> = {dtr:2.8,dec3:1,bobble2:1,bobble3:1,bobble4:1,trbo:1.5,puff:1.2,popcorn:1.3,
  sc: 1,
  hdc: 1.4,
  dc: 1.85,
  tr: 2.3,
  ch: 0.75,
  slst: 0.45,
  dec: 1,
  bobble: 1,
};

const wrapAngle = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle));

function averageAngle(angles: number[]): number {
  return Math.atan2(
    angles.reduce((sum, angle) => sum + Math.sin(angle), 0),
    angles.reduce((sum, angle) => sum + Math.cos(angle), 0),
  );
}

/**
 * A deterministic, gauge-scaled profile preview with explicit stitch topology.
 *
 * A course's available fabric height is split between radial travel and vertical
 * rise. Attachment-aware angular placement preserves local shaping information.
 * This is intentionally an approximate preview, not an elastic yarn simulation.
 * Coordinates are [x, y-up, z], centered for orbiting and camera fitting.
 */
export function buildGeometry(pattern: ParsedPattern): ModelGeometry {
  if(pattern.joinedStart) {
    const {joinedStart,...rest}=pattern;
    const chains=pattern.chainStart?.stitches??[];
    const shift=(s:Stitch):Stitch=>({...s,round:s.round+1});
    const rounds=[{number:1,color:chains[0]?.color??'#f3e8d6',stitches:chains.map(shift),inputCount:0,outputCount:chains.length,declaredCount:null,increases:0,decreases:0,line:joinedStart.line},
      ...pattern.rounds.map(r=>({...r,number:r.number+1,stitches:r.stitches.map(shift)}))];
    const model=buildGeometry({...rest,chainStart:undefined,rounds,stitches:pattern.stitches.map(shift)});
    for(const p of model.points)p.round--;
    for(const r of model.roundCenters){r.round--;if(r.parentRound!==undefined)r.parentRound--;}
    const first=chains[0],last=chains.at(-1);
    if(first&&last)model.links.push({from:last.id,to:first.id,kind:'course',color:first.color});
    model.openFoundation=true;
    return model;
  }
  if(pattern.construction==='rows')return buildFlatGeometry(pattern);
  if(pattern.ovalStart) {
    const {ovalStart,...circular}=pattern;
    const model=buildGeometry({...circular,chainStart:undefined,stitches:circular.stitches.filter(s=>!s.auxiliary),rounds:circular.rounds.map(r=>r.number===1?{...r,stitches:r.stitches.map(s=>({...s,parents:[]}))}:r)});
    // Concentric courses expand in the foundation plane. The straight
    // chain remains the center spine; additional stitches grow the perimeter.
    const halfSpine=Math.max(.45,(ovalStart.chains-2)*STITCH_WIDTH/2);
    let radius=Math.max(.48,((pattern.rounds[0]?.outputCount??0)*STITCH_WIDTH-4*halfSpine)/(Math.PI*2));
    let previousCount=0, depth=0, direction=1;
    let maxRadius=radius;
    for(const round of pattern.rounds) {
      const loopBalance=round.stitches.reduce((n,s)=>n+(s.loop==='back'?1:s.loop==='front'?-1:0),0);
      if(loopBalance)direction=Math.sign(loopBalance);
      if(round.number>1) {
        const travel=(round.outputCount-previousCount)*STITCH_WIDTH/(Math.PI*2);
        const height=COURSE_HEIGHT*round.stitches.reduce((n,s)=>n+HEIGHT[s.type],0)/round.stitches.length;
        radius=Math.max(.2,radius+travel);
        // Once increases stop supplying a flat perimeter, the available post
        // height lifts the next course. Loop selection chooses the fold side.
        depth+=direction*Math.sqrt(Math.max(0,height*height-travel*travel));
      }
      maxRadius=Math.max(maxRadius,radius);
      const perimeter=4*halfSpine+Math.PI*2*radius;
      const locate=(fraction:number):Position=>{
        let d=fraction*perimeter;
        if(d<2*halfSpine)return [halfSpine-d,radius,0];
        d-=2*halfSpine;
        if(d<Math.PI*radius){const t=Math.PI/2+d/radius;return [-halfSpine+Math.cos(t)*radius,Math.sin(t)*radius,0];}
        d-=Math.PI*radius;
        if(d<2*halfSpine)return [-halfSpine+d,-radius,0];
        d-=2*halfSpine;const t=-Math.PI/2+d/radius;return [halfSpine+Math.cos(t)*radius,Math.sin(t)*radius,0];
      };
      for(const stitch of round.stitches){const p=model.points.find(p=>p.id===stitch.id)!;p.position=locate((stitch.index+.5)/round.outputCount);p.position[2]=depth;p.flat=true;}
      const center=model.roundCenters.find(r=>r.round===round.number)!;
      center.center=[0,0,depth];center.radius=radius;center.height=.92;
      previousCount=round.outputCount;
    }
    for(const stitch of pattern.chainStart?.stitches??[]) {
      const hook=stitch.index===ovalStart.chains-1;
      const position:Position=[hook?halfSpine: -halfSpine+stitch.index*STITCH_WIDTH,hook?.45:0,0];
      model.points.push({...stitch,flat:true,position});
      if(stitch.previous!==null)model.links.push({from:stitch.previous,to:stitch.id,kind:'course',color:stitch.color});
    }
    for(const stitch of pattern.rounds[0]?.stitches??[]) {
      const point=model.points.find(p=>p.id===stitch.id)!;
      point.parents=[...stitch.parents];
      for(const parent of stitch.parents)model.links.push({from:parent,to:stitch.id,kind:'parent',color:stitch.color});
    }
    model.planarFoundation=true;model.endClosed=false;
    const depths=model.points.map(p=>p.position[2]);
    model.bounds={width:2*(halfSpine+maxRadius),height:2*maxRadius,depth:Math.max(...depths)-Math.min(...depths)};
    return model;
  }
  const points: ModelPoint[] = [];
  const links: ModelLink[] = [];
  const roundCenters: ModelGeometry["roundCenters"] = [];
  const byId = new Map<number, ModelPoint>();
  const anglesById = new Map<number, number>();
  const courseShifts = new Map<number, [number,number]>();
  const stitchRounds=new Map(pattern.stitches.map(s=>[s.id,s.round]));
  const parentRounds=new Map(pattern.rounds.map(r=>[r.number,r.stitches.flatMap(s=>s.parents.map(id=>stitchRounds.get(id))).find(n=>n!==undefined&&n<r.number)]));
  const outlines=new Map<number,GrowthMode[]>(), radialOffsets=new Map<number,number>();
  let outline: GrowthMode[] = [];
  let previousRadius = 0;
  let previousHeight = 0;
  let courseY = 0;

  const closed = closesLastRound(pattern.rounds.map(r=>r.outputCount), pattern.edge);
  let profile = pattern.rounds.map(round => Math.max(0.22, round.stitches.length * STITCH_WIDTH / TAU));
  if (closed) {
    // A stuffed fabric shoulder curves across neighboring courses. Relax only
    // the profile, retaining every stitch and its construction relationships.
    for (let pass = 0; pass < 3; pass++) {
      profile = profile.map((radius, i, radii) => i === 0 || i === radii.length - 1 ? radius :
        radius * .5 + (radii[i-1] + radii[i+1]) * .25);
    }
  }
  for (const round of pattern.rounds) {
    const count = round.stitches.length;
    if (!count) continue;

    const parentNumber=parentRounds.get(round.number);
    const parentCourse=roundCenters.find(r=>r.round===parentNumber);
    if(parentCourse){previousRadius=parentCourse.radius;previousHeight=parentCourse.height;courseY=parentCourse.center[1];outline=outlines.get(parentNumber!)??[];}
    const fork=parentNumber!==undefined&&parentNumber!==round.number-1;
    const radialOffset=(radialOffsets.get(parentNumber??0)??0)+(fork?.38:0);
    radialOffsets.set(round.number,radialOffset);
    const radius = profile[round.number - 1]+radialOffset;
    const meanStitchHeight =
      round.stitches.reduce(
        (sum, stitch) => sum + (HEIGHT[stitch.type] ?? 1),
        0,
      ) / count;
    const materialHeight = COURSE_HEIGHT * meanStitchHeight;

    if (points.length) {
      const radialTravel = Math.abs(radius - previousRadius);
      // Dense increases cannot all lie on an unstretched circular profile.
      // Keep a small positive rise rather than producing NaN or a folded ring;
      // this approximation is described in the UI instead of claiming physics.
      const minimumRise =
        0.14 * Math.min(materialHeight, previousHeight || materialHeight);
      courseY += Math.max(
        minimumRise,
        Math.sqrt(Math.max(0, materialHeight ** 2 - radialTravel ** 2)),
      );
    }

    const naturalAngles = round.stitches.map((stitch) => {
      const parentAngles = stitch.parents
        .map((id) => anglesById.get(id))
        .filter((angle): angle is number => angle !== undefined);
      return parentAngles.length ? averageAngle(parentAngles) : null;
    });

    // Two increase outputs share one parent but occupy distinct positions.
    const childrenPerParent = new Map<number, number[]>();
    round.stitches.forEach((stitch, index) => {
      if (stitch.parents.length !== 1) return;
      const parent = stitch.parents[0];
      const group = childrenPerParent.get(parent) ?? [];
      group.push(index);
      childrenPerParent.set(parent, group);
    });
    for (const group of childrenPerParent.values()) {
      if (group.length < 2) continue;
      group.forEach((index, ordinal) => {
        if (naturalAngles[index] === null) return;
        naturalAngles[index]! +=
          ROUND_DIRECTION * (((ordinal - (group.length - 1) / 2) * TAU) / count) * 0.78;
      });
    }

    const phaseSamples = naturalAngles.flatMap((angle, index) =>
      angle === null ? [] : [angle - ROUND_DIRECTION * (index * TAU) / count],
    );
    const phase = phaseSamples.length
      ? averageAngle(phaseSamples)
      : -Math.PI / 2;

    const growth=courseGrowth(round.stitches,anglesById,STITCH_WIDTH,materialHeight);
    outline=growOutline(outline,growth.outline,radius,previousRadius);
    outlines.set(round.number,outline);
    courseShifts.set(round.number,growth.shift);
    const ringStart=points.length;

    round.stitches.forEach((stitch: Stitch, index: number) => {
      const evenAngle = phase + ROUND_DIRECTION * (index * TAU) / count;
      const natural = naturalAngles[index];
      const angle =
        evenAngle +
        (natural === null ? 0 : wrapAngle(natural - evenAngle) * 0.34);
      const localRadius=Math.max(.18,radius+outlineOffset(outline,angle));
      const localY =
        courseY +
        0.1 * COURSE_HEIGHT * ((HEIGHT[stitch.type] ?? 1) - meanStitchHeight);
      const point: ModelPoint = {
        id: stitch.id,
        round: stitch.round,
        index: stitch.index,
        color: stitch.color,
        patternColor: stitch.patternColor,
        paintSourceLine: stitch.paintSourceLine,
        type: stitch.type,
        loop: stitch.loop,
        auxiliary:stitch.auxiliary,
        countedChain:stitch.countedChain,
        parents: [...stitch.parents],
        previous: stitch.previous,
        isIncrease: stitch.isIncrease,
        position: [
          Math.cos(angle) * localRadius,
          localY,
          Math.sin(angle) * localRadius,
        ],
      };
      points.push(point);
      byId.set(stitch.id, point);
      anglesById.set(stitch.id, angle);
    });

    // Keep the course's yarn budget when its circular outline becomes oval or
    // lobed. Normalize perimeter to the same count/gauge polygon as before.
    const ring=points.slice(ringStart);
    const perimeter=ring.reduce((sum,p,i)=>{
      const next=ring[(i+1)%ring.length];
      return sum+Math.hypot(p.position[0]-next.position[0],p.position[2]-next.position[2]);
    },0);
    const target=2*count*radius*Math.sin(Math.PI/count);
    if(perimeter>1e-8 && count>2) {
      const scale=target/perimeter;
      for(const p of ring){p.position[0]*=scale;p.position[2]*=scale;}
    }

    roundCenters.push({
      round: round.number,
      center: [0, courseY, 0],
      radius,
      height: materialHeight,
      count,
      parentRound:parentNumber,
    });
    previousRadius = radius;
    previousHeight = materialHeight;
  }

  // Unequal course heights create a wedge: its longer side is on the outside
  // of the bend. Transport the following courses along that new direction,
  // rather than resetting every round to the global vertical axis.
  const courseFrames = new Map<number, Quaternion>();
  const frame = new Quaternion();
  const centerline = new Vector3();
  let lastY = roundCenters[0]?.center[1] ?? 0;
  const originalY=new Map(roundCenters.map(r=>[r.round,r.center[1]]));
  for (const course of roundCenters) {
    const parent=roundCenters.find(r=>r.round===course.parentRound);
    if(parent){frame.copy(courseFrames.get(parent.round)??new Quaternion());centerline.fromArray(parent.center);lastY=originalY.get(parent.round)!;}
    const ring = points.filter(p=>p.round===course.round);
    const mean = ring.reduce((sum,p)=>sum+HEIGHT[p.type],0)/ring.length;
    let gradientX=0, gradientZ=0;
    for (const point of ring) {
      const angle=anglesById.get(point.id)!;
      const extra=COURSE_HEIGHT*(HEIGHT[point.type]-mean);
      gradientX+=extra*Math.cos(angle)*2/ring.length;
      gradientZ+=extra*Math.sin(angle)*2/ring.length;
    }
    const magnitude=Math.hypot(gradientX,gradientZ);
    const turn = new Quaternion();
    if(course.round>1 && magnitude>1e-8) {
      // y cross (-gradientX,0,-gradientZ) is the local bending axis.
      turn.setFromAxisAngle(new Vector3(-gradientZ,0,gradientX).normalize(),magnitude/course.radius);
    }
    const nextFrame=frame.clone().multiply(turn);
    const halfway=frame.clone().slerp(nextFrame,.5);
    const y=course.center[1];
    const shift=courseShifts.get(course.round)??[0,0];
    centerline.add(new Vector3(shift[0],y-lastY,shift[1]).applyQuaternion(halfway));
    for (const point of ring) {
      const local=new Vector3(point.position[0],point.position[1]-y,point.position[2]);
      point.position=local.applyQuaternion(nextFrame).add(centerline).toArray();
    }
    course.center=centerline.toArray();
    courseFrames.set(course.round,nextFrame.clone());
    frame.copy(nextFrame);lastY=y;
  }

  // Branch stitches are laid out after the body so that their length never
  // changes a round's circumference, parent count, or vertical profile.
  // Work out from the attachment, then return beside the chain rather than
  // wrapping those stitches into the body's circular course.
  for (const stitch of pattern.stitches) {
    if (!stitch.branch) continue;
    const branch = stitch.branch;
    const anchor = byId.get(branch.anchor);
    if (!anchor) continue;
    const angle=anglesById.get(anchor.id) ?? 0;
    const outwardX=Math.cos(angle), outwardZ=Math.sin(angle);
    const distance = branch.step * STITCH_WIDTH * 0.72;
    const bend = 0.22 * Math.sin((branch.step / branch.length) * Math.PI);
    const siblings=pattern.stitches.filter(s=>s.branch?.returning&&s.branch.anchor===branch.anchor&&s.branch.step===branch.step);
    const ordinal=siblings.findIndex(s=>s.id===stitch.id);
    const fan=branch.returning?(ordinal-(siblings.length-1)/2)*STITCH_WIDTH*.45:0;
    const side = bend + (branch.returning ? (stitch.type==='slst'?.16:.45*HEIGHT[stitch.type]) : 0);
    const displacement=new Vector3(outwardX*(distance+fan)-outwardZ*side,
      distance*.12+(branch.returning ? .08 : 0),outwardZ*(distance+fan)+outwardX*side)
      .applyQuaternion(courseFrames.get(anchor.round) ?? new Quaternion());
    const point: ModelPoint = {
      id: stitch.id,
      round: stitch.round,
      index: stitch.index,
      color: stitch.color,
      patternColor: stitch.patternColor,
      paintSourceLine: stitch.paintSourceLine,
      type: stitch.type,
      parents: [...stitch.parents],
      previous: stitch.previous,
      isIncrease: stitch.isIncrease,
      branch: { ...branch },
      position: new Vector3().fromArray(anchor.position).add(displacement).toArray(),
    };
    points.push(point);
    byId.set(point.id, point);
  }
  // Keep rendering, picking, and playback in construction order even though
  // body and branch positions were computed in separate passes.
  points.sort((a, b) => a.id - b.id);

  const edgeKeys = new Set<string>();
  const addLink = (
    from: number,
    to: number,
    kind: ModelLink["kind"],
    color: string,
  ) => {
    if (from === to || !byId.has(from) || !byId.has(to)) return;
    const key = `${Math.min(from, to)}:${Math.max(from, to)}:${kind}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    links.push({ from, to, kind, color });
  };
  for (const point of points) {
    if (point.previous !== null)
      addLink(point.previous, point.id, "course", point.color);
    for (const parent of point.parents)
      addLink(parent, point.id, "parent", point.color);
  }
  // Close only the foundation ring. Subsequent courses follow the pattern's
  // construction-order edge, retaining the transition between spiral rounds.
  const firstRound = pattern.rounds.find((round) => round.stitches.length > 0);
  if (firstRound && firstRound.stitches.length > 2) {
    addLink(
      firstRound.stitches[0].id,
      firstRound.stitches.at(-1)!.id,
      "course",
      firstRound.color,
    );
  }

  for(const round of pattern.rounds)if(round.joined&&round.stitches.length>1)
    addLink(round.stitches.at(-1)!.id,round.stitches[0].id,'course',round.color);

  if (!points.length)
    return {
      points,
      links,
      bounds: { width: 0, height: 0, depth: 0 },
      roundCenters,
    };

  const min: Position = [Infinity, Infinity, Infinity];
  const max: Position = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point.position[axis]);
      max[axis] = Math.max(max[axis], point.position[axis]);
    }
  }
  const center: Position = [
    (max[0] + min[0]) / 2,
    (max[1] + min[1]) / 2,
    (max[2] + min[2]) / 2,
  ];
  for (const point of points) {
    point.position = point.position.map(
      (value, axis) => value - center[axis],
    ) as Position;
    if (pattern.orientation === "top-down") point.position[1] *= -1;
  }
  for (const round of roundCenters) {
    round.center = round.center.map(
      (value, axis) => value - center[axis],
    ) as Position;
    if (pattern.orientation === "top-down") round.center[1] *= -1;
  }
  return {
    endClosed: closed,
    points,
    links,
    bounds: {
      width: max[0] - min[0],
      height: max[1] - min[1],
      depth: max[2] - min[2],
    },
    roundCenters,
  };
}
