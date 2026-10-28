import type { ParsedPattern, Stitch, StitchType } from "./pattern";

export type Position = [number, number, number];

export interface ModelPoint {
  id: number;
  round: number;
  index: number;
  color: string;
  type: StitchType;
  position: Position;
  parents: number[];
  previous: number | null;
  isIncrease: boolean;
  branch?: Stitch["branch"];
}

export interface ModelLink {
  from: number;
  to: number;
  kind: "course" | "parent";
  color: string;
}

export interface ModelGeometry {
  points: ModelPoint[];
  links: ModelLink[];
  bounds: { width: number; height: number; depth: number };
  roundCenters: {
    round: number;
    center: Position;
    radius: number;
    height: number;
    count: number;
  }[];
}

const TAU = Math.PI * 2;
const STITCH_WIDTH = 0.9;
const COURSE_HEIGHT = 0.92;

/** Relative material heights, kept separate from display yarn thickness. */
const HEIGHT: Record<StitchType, number> = {
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
  const points: ModelPoint[] = [];
  const links: ModelLink[] = [];
  const roundCenters: ModelGeometry["roundCenters"] = [];
  const byId = new Map<number, ModelPoint>();
  const anglesById = new Map<number, number>();
  const radiiByRound = new Map<number, number>();
  const previousRoundById = new Map<number, number>();
  let previousRadius = 0;
  let previousHeight = 0;
  let courseY = 0;

  for (const round of pattern.rounds) {
    const count = round.stitches.length;
    if (!count) continue;

    const radius = Math.max(0.22, (count * STITCH_WIDTH) / TAU);
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
          (((ordinal - (group.length - 1) / 2) * TAU) / count) * 0.78;
      });
    }

    const phaseSamples = naturalAngles.flatMap((angle, index) =>
      angle === null ? [] : [angle - (index * TAU) / count],
    );
    const phase = phaseSamples.length
      ? averageAngle(phaseSamples)
      : -Math.PI / 2;

    // Smooth the shaping signal to avoid abrupt spokes while retaining exactly
    // where an author chose to place increases and decreases.
    const shaping: number[] = round.stitches.map((stitch) =>
      stitch.isIncrease ? 0.5 : stitch.parents.length > 1 ? -0.7 : 0,
    );
    const shapingMean = shaping.reduce((sum, value) => sum + value, 0) / count;

    round.stitches.forEach((stitch: Stitch, index: number) => {
      const evenAngle = phase + (index * TAU) / count;
      const natural = naturalAngles[index];
      const angle =
        evenAngle +
        (natural === null ? 0 : wrapAngle(natural - evenAngle) * 0.34);
      const smoothShape =
        (shaping[(index + count - 1) % count] +
          2 * shaping[index] +
          shaping[(index + 1) % count]) /
          4 -
        shapingMean;

      const parents = stitch.parents
        .map((id) => byId.get(id))
        .filter((point): point is ModelPoint => Boolean(point));
      const inheritedOffset = parents.length
        ? parents.reduce((sum, parent) => {
            const parentRadius = Math.hypot(
              parent.position[0],
              parent.position[2],
            );
            const referenceRadius =
              radiiByRound.get(previousRoundById.get(parent.id) ?? -1) ??
              parentRadius;
            return sum + parentRadius - referenceRadius;
          }, 0) / parents.length
        : 0;
      const localRadius = Math.max(
        0.18,
        radius + 0.09 * smoothShape + 0.3 * inheritedOffset,
      );
      const localY =
        courseY +
        0.1 * COURSE_HEIGHT * ((HEIGHT[stitch.type] ?? 1) - meanStitchHeight);
      const point: ModelPoint = {
        id: stitch.id,
        round: stitch.round,
        index: stitch.index,
        color: stitch.color,
        type: stitch.type,
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
      previousRoundById.set(stitch.id, round.number);
    });

    roundCenters.push({
      round: round.number,
      center: [0, courseY, 0],
      radius,
      height: materialHeight,
      count,
    });
    radiiByRound.set(round.number, radius);
    previousRadius = radius;
    previousHeight = materialHeight;
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
    const radialLength = Math.hypot(anchor.position[0], anchor.position[2]);
    const outwardX = radialLength > 1e-8 ? anchor.position[0] / radialLength : 1;
    const outwardZ = radialLength > 1e-8 ? anchor.position[2] / radialLength : 0;
    const distance = branch.step * STITCH_WIDTH * 0.72;
    const bend = 0.22 * Math.sin((branch.step / branch.length) * Math.PI);
    const side = bend + (branch.returning ? 0.16 : 0);
    const point: ModelPoint = {
      id: stitch.id,
      round: stitch.round,
      index: stitch.index,
      color: stitch.color,
      type: stitch.type,
      parents: [...stitch.parents],
      previous: stitch.previous,
      isIncrease: stitch.isIncrease,
      branch: { ...branch },
      position: [
        anchor.position[0] + outwardX * distance - outwardZ * side,
        anchor.position[1] + distance * 0.12 + (branch.returning ? 0.08 : 0),
        anchor.position[2] + outwardZ * distance + outwardX * side,
      ],
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
