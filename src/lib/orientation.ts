export type PatternOrientation = "bottom-up" | "top-down";

/** Keep orientation in the pattern so plain text and project exports retain it. */
export function setPatternOrientation(source: string, orientation: PatternOrientation) {
  const lines = source.split(/\r?\n/).filter((line) => !/^\s*orientation\b/i.test(line));
  return [`orientation ${orientation}`, ...lines].join("\n");
}
