# Yarnify3D: pattern-to-model screenshot analysis

Evidence: one user-supplied screenshot showing the pattern editor and rendered output. No application code or exported project data was available for this analysis. The screenshot is visible in the conversation; a standalone image file was not provided in the checkout.

## Working hypothesis

Yarnify appears to render an **abstract stitch-connectivity structure**: spheres at stitch-related material points and straight bars between connected points. A plausible implementation parses the pattern into individual stitch operations, resolves their attachment relationships, assigns approximate 3D positions and draws the resulting graph.

The rendered structure supports a graph interpretation. The exact positional algorithm is unknown: a force-directed layout, weighted-distance optimizer, position-based solver, circular/profile placement or hybrid could generate this kind of image. The screenshot does not establish one sphere per stitch, a particular graphics library or a physically calibrated yarn simulation.

## Pattern transcription

```text
# Crochet Pattern
[red]
1: 8 sc in mc (8)
2: 8 inc (16)
3: [1 sc, 1 inc] rep 8 times (24)
4: [5 sc, 1 inc] rep 4 times (28)
5: 3 sc, 1 inc, [6 sc, 1 inc] rep 3 times, 3 sc (32)
6: [7 sc, 1 inc] rep 4 times (36)
7: [5 sc, 1 inc] rep 6 times (42)
8: 3 sc, 1 inc, [6 sc, 1 inc] rep 5 times, 3 sc (48)
9: [7 sc, 1 inc] rep 6 times (54)

// Change color to beige
[beige]
// Round 10: BLO, hdc decreases approximated as dec
10: [7 hdc, 1 dec] rep 6 times (48)
11: [6 sc, 1 dec] rep 6 times (42)
12: [5 sc, 1 dec] rep 6 times (36)
```

The editor also shows color swatches beside the color names. The transcription records the text, not those UI decorations.

## Arithmetic and construction sequence

Under ordinary single-crochet increase and two-together decrease semantics, all stated round totals are consistent:

| Round | Color | Previous-round stitches consumed | New stitches produced | Construction |
| --- | --- | ---: | ---: | --- |
| 1 | Red | Magic ring | 8 | Foundation |
| 2 | Red | 8 | 16 | 8 increases |
| 3 | Red | 16 | 24 | 8 sc + 8 increases |
| 4 | Red | 24 | 28 | 20 sc + 4 increases |
| 5 | Red | 28 | 32 | 24 sc + 4 increases, offset placement |
| 6 | Red | 32 | 36 | 28 sc + 4 increases |
| 7 | Red | 36 | 42 | 30 sc + 6 increases |
| 8 | Red | 42 | 48 | 36 sc + 6 increases, offset placement |
| 9 | Red | 48 | 54 | 42 sc + 6 increases |
| 10 | Beige | 54 | 48 | 42 hdc + 6 decreases |
| 11 | Beige | 48 | 42 | 36 sc + 6 decreases |
| 12 | Beige | 42 | 36 | 30 sc + 6 decreases |

There are 288 red stitch outputs and 126 beige outputs, totaling **414 stitch outputs**. That would imply 414 primary stitch vertices only in a representation using one vertex per produced stitch. Additional internal, foundation or auxiliary nodes could change the rendered sphere count; the image was not counted point by point.

The expected construction starts at the bottom red foundation, grows outward through the red rounds, then contracts through three beige rounds. Round 12 still has 36 stitches, so an open upper edge is expected. Decreasing stitch counts alone do not close the object.

Increases allow larger circumferences, but counts alone do not uniquely determine vertical shape. Stitch dimensions, placement, bending assumptions and layout constraints decide whether additional fabric extends radially, rises, buckles or folds.

## A plausible implementation pipeline

### 1. Parse and expand the notation

Recognize color directives, round labels, stitches, repeat groups, comments, the magic-ring foundation and stated totals. Preserve the original instruction and repeat structure for editing, while expanding into individual construction operations for modeling.

For example, round 3 expands into eight `sc, inc` operation pairs. An increase makes two output stitches, so the result is 24 stitches, not 16. Parenthesized totals are plausibly expected counts used for validation, but this screenshot does not show whether Yarnify checks them, ignores them or uses them as layout inputs.

### 2. Resolve attachment topology

Maintain a cursor through the available stitches of the previous round:

```text
sc:  consume 1 parent → create 1 child attached to it
hdc: consume 1 parent → create 1 child, with different geometry metadata
inc: consume 1 parent → create 2 children attached to that same parent
dec: consume 2 parents → create 1 child attached to both
```

Also connect successive stitch outputs in working order. The foundation and end-of-round behavior need separate rules. The example alone does not identify whether the model uses a continuous spiral, joined rounds or only geometric circular closures.

Repeated attachments create branching connections for increases; two-parent attachments create converging connections for decreases. Those relationships can explain diagonal and fan-like bars in the image. More detailed models can use several internal points per stitch instead of a single top point.

### 3. Compute 3D positions

A simple initializer might place the round's stitch points around an approximate circle, with radius related to stitch count and effective stitch width. Stitch height and increase/decrease distribution could then influence vertical position and subsequent relaxation.

A candidate spring-like model minimizes an energy such as:

```text
E = Σedges stiffness × (actualDistance - targetDistance)²
    + bending/orientation penalties
    + collision/overlap penalties
```

This is a proposed implementation model, **not a recovered Yarnify equation**. Target distances could depend on stitch type, gauge and connection role. A solver can then adjust positions iteratively while topology remains fixed. Alternatively, a simpler procedural placement algorithm might assign positions without an energy minimization step.

The screenshot's first beige transition appears taller than the next two, which is consistent with round 10 using hdc and the following rounds using sc. A precise hdc-to-sc height ratio cannot be measured reliably from this view. Some small intermediate beige points may be internal stitch geometry or partially occluded points.

### 4. Render and color the structure

Place a sphere at each visible graph point, a cylinder or similar straight primitive along each connection, and apply the current yarn color to the newly created stitch geometry. Lighting gives the spheres their rounded shaded appearance. This abstract geometry does not trace the full over-and-under yarn path of real crochet.

The red-to-beige boundary suggests that color is associated with construction ranges or their geometry. The screenshot cannot distinguish whether color is stored per instruction, per round, per stitch or only in a rendering layer.

## Two important observations

### Increase placement carries information beyond round counts

Rounds 5 and 8 split an ordinary sc group across the beginning/end of the round. This offsets the increase locations rather than stacking them directly over the preceding round's increases. In actual crochet, staggering can reduce aligned increase ridges and angular shaping. A renderer retaining attachment topology can respond to those changes; one using only counts might draw the same shape regardless.

This provides an especially useful experiment: compare the existing staggered round 5 with `[6 sc, 1 inc] rep 4 times (32)`. Both consume 28 stitches and produce 32. Any meaningful local shape difference would demonstrate sensitivity beyond the round total.

### A strict equal-width ring model is not established

For perfectly circular rounds with constant circumferential stitch width:

```text
radius ≈ count × stitchWidth / (2π)
radius(round12) / radius(round9) ≈ 36 / 54 ≈ 0.667
```

Visually, the screenshot's upper opening is much closer in width to the red rim than this ratio predicts, and the beige horizontal connections appear more widely spaced. This makes the strict fixed-width circle model an insufficient identification of Yarnify's actual algorithm. Edge strain, effective stitch dimensions, noncircular layout, viewing perspective or other settings may contribute. Pixel widths from one view do not directly establish physical radii.

## What the screenshot does not demonstrate

- **BLO modeling:** `BLO` appears in a comment, not in the executable round text. There is no explicit BLO stitch operation in the transcription. This does not establish whether the app supports BLO elsewhere.
- **A special hdc decrease:** the comment explicitly says hdc decreases were approximated as `dec`. The example therefore does not demonstrate a distinct half-double-crochet decrease geometry.
- **Physical accuracy:** a plausible bowl shape is not a comparison against a crocheted sample, and it does not identify stuffing, yarn elasticity or contact behavior.
- **Exact source/framework:** spheres and bars can be drawn with many libraries. Similarity to another open-source tool does not establish shared code.
- **A particular solver:** the static image reveals output structure, not the method that placed it.

## Most informative follow-up experiments

| Change | Keep fixed | What to observe |
| --- | --- | --- |
| Replace staggered round 5 with `[6 sc, 1 inc] rep 4 times (32)` | All round totals | Local sensitivity to increase positions |
| Replace the 42 hdc in round 10 with sc | Counts, color and decrease placement | Whether stitch type changes band height |
| Compare `[5 sc, 1 dec] rep 6 times (36)` with `30 sc, 6 dec (36)` in round 12 | Input 42, output 36 | Whether concentrated decreases produce asymmetric shaping |
| Change only a parenthesized total | Executable stitches | Whether totals are validated, ignored or used directly |
| Add/remove the BLO comment only | All executable text | Whether this comment affects processing; ordinary comment behavior predicts no change |
| Recalculate identical text repeatedly | All settings | Deterministic placement versus changing initial conditions |
| Change only visual yarn thickness | Pattern and gauge | Rendering scale versus geometry recomputation |
| Inspect an exported project/model | Tiny disposable pattern | Direct evidence for stitch IDs, attachments, positions and edge targets |

For each experiment, preserve camera orientation and settings and compare both geometry and diagnostics. An unchanged silhouette does not prove that internal topology is unchanged; individual connections or exported data are stronger evidence.

## Implication for our modeler

The useful foundation is a structured, editable pattern with explicit attachment topology, plus a separate geometry/layout layer and renderer. That lets us improve physical realism and visual yarn detail without losing stitch identity or corrupting written instructions. The screenshot supplies a concrete target for the abstract graph view; it does not yet supply an exact Yarnify algorithm to reproduce.
