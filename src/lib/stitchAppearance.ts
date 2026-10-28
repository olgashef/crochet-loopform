import type { StitchType } from "./pattern";

export interface StitchAppearance {
  label: string;
  abbreviation: string;
  /** Relative bead dimensions. Yarn color and stitch topology stay separate. */
  scale: [number, number, number];
  description: string;
}

export const STITCH_TYPE_ORDER: StitchType[] = [
  "sc",
  "hdc",
  "dc",
  "tr",
  "bobble",
  "ch",
  "slst",
  "dec",
];

/** Shared by the 3D renderer and the shape key. These are visual symbols. */
export const STITCH_APPEARANCES: Record<StitchType, StitchAppearance> = {
  sc: {
    label: "Single crochet",
    abbreviation: "SC",
    scale: [1, 1, 1],
    description: "A round bubble. Single crochet increases make two of these.",
  },
  hdc: {
    label: "Half double crochet",
    abbreviation: "HDC",
    scale: [0.88, 1.7, 0.88],
    description: "An elongated bead, taller than single crochet.",
  },
  dc: {
    label: "Double crochet",
    abbreviation: "DC",
    scale: [0.82, 2.4, 0.82],
    description: "A long bead, taller than half double crochet.",
  },
  tr: {
    label: "Treble crochet",
    abbreviation: "TR",
    scale: [0.78, 3.1, 0.78],
    description: "The tallest bead, taller than double crochet.",
  },
  bobble: {
    label: "Bobble stitch",
    abbreviation: "BBL",
    scale: [3.2, 2.9, 3.8],
    description: "A raised, three-lobed cluster of double-crochet loops closed together; counts as one stitch.",
  },
  ch: {
    label: "Chain",
    abbreviation: "CH",
    scale: [1.25, 0.52, 0.78],
    description: "A small horizontal oval.",
  },
  slst: {
    label: "Slip stitch",
    abbreviation: "SL ST",
    scale: [0.95, 0.42, 0.85],
    description: "A short, flattened bead.",
  },
  dec: {
    label: "Decrease",
    abbreviation: "DEC",
    scale: [1.25, 0.75, 0.9],
    description: "A wide bead joining two parent stitches.",
  },
};

export function getStitchAppearance(type: string): StitchAppearance {
  return Object.hasOwn(STITCH_APPEARANCES, type)
    ? STITCH_APPEARANCES[type as StitchType]
    : STITCH_APPEARANCES.sc;
}
