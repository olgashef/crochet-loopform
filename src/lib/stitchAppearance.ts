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
  "dtr",
  "dec3",
  "bobble2",
  "bobble3",
  "bobble4",
  "trbo",
  "puff",
  "popcorn",

  "bobble",
  "ch",
  "slst",
  "dec",
];

/** Shared by the 3D renderer and the shape key. These are visual symbols. */
export const STITCH_APPEARANCES: Record<StitchType, StitchAppearance> = {
  dtr: {label:"Double treble", abbreviation:"DTR", scale:[1, 3.6, 1], description:"dtr crochet stitch"},
  dec3: {label:"Triple decrease", abbreviation:"DEC3", scale:[1.45,.8,1], description:"dec3 crochet stitch"},
  bobble2: {label:"Tiny bobble (2 dc)", abbreviation:"BOBBLE2", scale:[1.8,1.7,2], description:"bobble2 crochet stitch"},
  bobble3: {label:"Small bobble (3 dc)", abbreviation:"BOBBLE3", scale:[2.3,2.1,2.6], description:"bobble3 crochet stitch"},
  bobble4: {label:"Bobble (4 dc)", abbreviation:"BOBBLE4", scale:[2.8,2.5,3.2], description:"bobble4 crochet stitch"},
  trbo: {label:"Treble bobble", abbreviation:"TRBO", scale:[3.2,3.4,3.8], description:"trbo crochet stitch"},
  puff: {label:"Puff stitch", abbreviation:"PUFF", scale:[2.6,2.4,2.8], description:"puff crochet stitch"},
  popcorn: {label:"Popcorn", abbreviation:"POPCORN", scale:[2.5,2.7,3.3], description:"popcorn crochet stitch"},

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
    description: "Five partial double crochets closed together into one raised stitch.",
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
