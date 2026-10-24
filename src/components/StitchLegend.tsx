import type { StitchType } from "../lib/pattern";
import { STITCH_APPEARANCES, STITCH_TYPE_ORDER } from "../lib/stitchAppearance";
import "./StitchLegend.css";

export interface StitchLegendProps {
  types: StitchType[];
}

/** Uses the same proportions as the 3D beads, independent of yarn color. */
export function StitchLegend({ types }: StitchLegendProps) {
  const present = new Set(types);
  const visibleTypes = STITCH_TYPE_ORDER.filter((type) => present.has(type));

  if (!visibleTypes.length) return null;

  return (
    <div className="stitch-legend" aria-label="Stitch shape key">
      <span className="stitch-legend-label">STITCH SHAPES</span>
      <ul
        className="stitch-legend-items"
        aria-label="Stitch types in this model"
      >
        {visibleTypes.map((type) => {
          const appearance = STITCH_APPEARANCES[type];
          const title = `${appearance.label}: ${appearance.description}`;
          return (
            <li key={type} title={title} aria-label={title}>
              <span className="stitch-legend-glyph-space" aria-hidden="true">
                <span
                  className="stitch-legend-glyph"
                  style={{
                    width: 12 * appearance.scale[0],
                    height: 12 * appearance.scale[1],
                  }}
                />
              </span>
              <span className="stitch-legend-abbreviation">
                {appearance.abbreviation}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
