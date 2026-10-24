import type { ModelGeometry, Position } from "./geometry";
export type RowOffsets = Record<number, number>;
export function sanitizeRowOffsets(value: unknown): RowOffsets {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, v]) =>
        /^\d+$/.test(key) &&
        Number(key) >= 1 &&
        Number(key) <= 150 &&
        typeof v === "number" &&
        Number.isFinite(v) &&
        Math.abs(v) <= 1000 &&
        v !== 0,
    ),
  );
}
export function offsetRows(
  model: ModelGeometry,
  offsets: RowOffsets,
): ModelGeometry {
  const points = model.points.map((p) => ({
    ...p,
    position: [
      p.position[0],
      p.position[1] + (offsets[p.round] || 0),
      p.position[2],
    ] as Position,
  }));
  let min = Infinity,
    max = -Infinity;
  for (const p of points) {
    min = Math.min(min, p.position[1]);
    max = Math.max(max, p.position[1]);
  }
  return {
    ...model,
    points,
    roundCenters: model.roundCenters.map((r) => ({
      ...r,
      center: [
        r.center[0],
        r.center[1] + (offsets[r.round] || 0),
        r.center[2],
      ] as Position,
    })),
    bounds: { ...model.bounds, height: points.length ? max - min : 0 },
  };
}
