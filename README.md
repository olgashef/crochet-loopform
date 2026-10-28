# Loopform — crochet patterns in 3D

A local browser workspace for writing crochet patterns and inspecting their stitch connections in an interactive 3D preview. The initial example reproduces the red-and-beige pattern from the Yarnify screenshot shared during research.

## Run locally

Use Node.js **22.12 or newer**; Node.js 24 is supported. From this checkout:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. The development server binds to `0.0.0.0`; port 5173 must be free, or choose another with `npm run dev -- --port 5174`. A browser with WebGL support is needed for the 3D view. No backend service, account or API key is required. In a cloud workspace with a read-only home directory, install with `npm ci --cache /tmp/loopform-npm-cache`.

```sh
npm test        # Parser, attachment topology and geometry checks
npm run build  # TypeScript check and production build in dist/
npm run preview
```

`npm run preview` serves the production build on Vite's preview port, normally 4173.

## Workspace

- Write in the **Worksheet**: round labels, instructions, and automatically calculated totals match a printed crochet pattern. Counts are read-only; no typing or updating totals is needed. **Code** switches to the full syntax-highlighted text editor without converting or losing pattern information.
- In the worksheet, **Enter** moves to the next round (or adds one), **Shift+Enter** inserts a round below, and Backspace removes an empty row. Paste tab-separated rows directly from a spreadsheet. Round labels renumber automatically when you insert/delete a row or change a grouped duration.
- Use `[sc, inc] × 7`, `7 sc in mr`, and `49 sc for 8 rounds`. A hold is shown as a range such as **Rnd 9–16**, with the stitch total **per round**. Independent totals remain visible if an earlier row has an error, and the last valid model stays available.
- Write patterns in either editor. Auto-render updates valid changes after a short pause; turn it off to render manually. Use **Ctrl+Enter / Cmd+Enter** to render at any time.
- Inspect count and attachment errors by source line. An invalid edit preserves the last valid preview.
- Orbit, pan and zoom the 3D model. Click a stitch to inspect its round, position, type, source line and parent connections.
- Switch between **Stitches** and **Structure**, adjust display stitch size, reset the camera or use fullscreen.
- Scrub through rounds, step forward/back or play the construction sequence.
- Enable **Move rows** (↕), grab a row line or the green vertical handle, and drag up/down. **Front view** provides a straight-on view. Use ↑/↓ to nudge (Shift for larger steps), Escape to cancel a drag, or Undo/Reset to restore positions. The numeric offset and Up/Down buttons provide another way to move a row.
- Row adjustments change the preview geometry without rewriting stitch counts. They are saved locally and included in Loopform project JSON and rendered PNGs. Plain pattern text contains only crochet instructions. Rendering changed pattern text or loading another example starts with the new pattern’s shape.
- Recognize stitch types by shape: round **SC** bubbles, elongated **HDC** beads, longer **DC** beads, the tallest **TR** beads and protruding, lobed **BBL** bobbles. Beads align with their parent connections to follow the fabric's slope; two-parent stitches use the parents' midpoint. Tall stitch bodies extend down from their upper row anchor along the connection and are bounded by the space between rows. Chains and slip stitches are flattened; decreases are wide beads. The shape key shows the types in the visible rounds while yarn colors retain their pattern meaning.
- Use **Safety eyes** to place an eye pair between adjacent rounds, choose the stitch gaps and adjust its preview diameter. Eye placements are stored as pattern instructions and follow row adjustments and round playback.
- Load the **Mushroom cap**, **Little sphere**, **Everyday basket**, **Stitch sampler**, **Seven-stitch shaping**, **Two-color basket** or **Orange critter** examples. The sampler compares stitch shapes; the two-color basket demonstrates mid-round color changes. The orange critter includes bobble ears, safety eyes, a white belly and a chain tail.
- Import `.crochet` / `.txt` patterns or version-1 Loopform `.json` projects. Export pattern text, an editable project or a PNG of the current model view.
- Choose **Export → Pattern CSV** for a spreadsheet with round labels, instructions, calculated stitch totals per round, yarn colors and notes. Grouped rounds remain grouped; unfinished instructions have a blank total. CSV export uses the current editor contents.
- Pattern text, row adjustments and display thickness are saved in this browser's local storage when available. Export a file to keep a portable copy; browser storage is not a backup.

## Pattern format

For patterns worked from the head downward, choose **First round → At top** below the preview, or add `orientation top-down` on its own line. The Orange critter example uses this orientation. `orientation bottom-up` (the default) places the first round at the bottom. Orientation preserves stitch numbering, eyes, branches and row adjustments and is saved in pattern/project exports and browser storage.

Use US crochet abbreviations and one numbered round per line. Round numbers must start at 1 and remain consecutive.

```text
# A little shape
[red]
1: 8 sc in mc (8)
2: 8 inc (16)
3: [1 sc, 1 inc] rep 8 times (24)
4: [5 sc, 1 inc] rep 4 times (28)
5: 3 sc, 1 inc, [6 sc, 1 inc] rep 3 times, 3 sc (32)

// Change yarn color
[beige]
6: [6 hdc, 1 dec] rep 4 times (28)
7: [5 sc, 1 dec] rep 4 times (24)
```

| Syntax                  | Meaning                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `sc`, `hdc`, `dc`, `tr` | Single, half-double, double and treble crochet                    |
| `inc`                   | Two single-crochet outputs attached to one parent stitch          |
| `dec`                   | One output joining two parent stitches                            |
| `ch`, `slst`            | Chain and slip-stitch primitives in the simplified graph          |
| `bobble`, `bbl`         | One 3-DC bobble: consumes one parent and produces one stitch      |
| `[bobble, sc] in same st` | Work both outputs into one parent stitch                       |
| `branch(12 ch, 11 slst)` | Chain out from the body and slip-stitch back; excluded from body totals |
| `branch(12 ch)`         | An open chain extending from its body attachment                 |
| `6 sc`                  | Six stitches; an omitted count means one                          |
| `[sc, inc] rep 6 times` | Repeat a group; nested groups are supported                       |
| `in mc`                 | Magic-ring foundation in round 1; `mr` and `magic ring` also work |
| `(24)`                  | Optional expected output count, checked against the instructions  |
| `[beige]`, `[#a9c6b5]`  | Named yarn color or three-/six-digit hex color                    |
| `// comment`            | Comment, including after instructions                             |
| `# My pattern`          | Comment; the first nonempty `#` line supplies the pattern title   |

Printed notation such as `Rnd 1 7 sc in mr`, `Rnd 3: [sc, inc] × 7` and `Rnd 9–16: 49 sc for 8 rounds` is supported. Explicit ranges must agree with any `for N rounds` suffix. Written-pattern exports include freshly calculated `(total)` values.

Aliases include `ss`, `chain`, `increase`, `decrease`, and `R1:` / `Round 1:` round labels. Repeats also accept `repeat`, `x` or `*` instead of `rep`.

Change yarn **within a round** by placing a color marker before the stitches that use it. This works in both Worksheet and Code:

```text
Rnd 1: [red] 4 sc, [beige] 4 sc in mr (8)
Rnd 2: [[red] sc, [beige] sc] × 4 (8)
Rnd 3: 8 sc (8)
```

Markers consume no stitches. The active color continues until the next marker, including across repeat groups and round boundaries; round 3 above is all beige. An increase makes both of its stitches in the active color. Standalone color lines still work. Written text, project JSON and CSV exports preserve inline markers; the CSV Yarn column lists the colors used in each row, separated by semicolons. These markers describe stitch colors, not yarn-carrying or finishing techniques.

### Bobbles and shared attachment stitches

A `bobble` is one completed stitch made from a 3-DC cluster, drawn as a lobed bump projecting out of the fabric. Use `bobble` or `bbl`, rather than `3 dc`, which makes three separate double crochet stitches. To work a bobble and a single crochet into the same parent, write `[bobble, sc] in same st`; this consumes one parent and contributes two outputs to the round total. Reverse the order with `[sc, bobble] in same st` when the pattern calls for it.

### Safety eyes

Eye placement can also be written on its own line in either editor:

```text
eyes between 5 and 6 at 10, 14 size 0.8
```

This places two eyes between rounds 5 and 6, in the gaps **after stitches 10 and 14 of round 5**. Four stitches, numbered 11–14, lie between those gaps. Positions are one-based and must be distinct, and both adjacent rounds must exist. `size` is the eye diameter in relative preview units, not millimeters; it is optional, defaults to `0.7` and accepts values from `0.15` to `2`. Up to 16 pairs are supported. Adjust the positions to match the intended face direction rather than assuming that a round's first stitch faces the camera.

Eyes sit outside the fabric, appear once the upper round is visible and move with the surrounding rows. Their directives survive pattern-text, project JSON and CSV export; the current appearance is included in PNG export.

### Chains extending from the body

Use a `branch(...)` instruction for a chain that leaves the body instead of becoming part of its next circular round. For the instruction “CH12, start in second stitch from hook and SL ST 11 stitches down, then 24SC,” write:

```text
Rnd 27: branch(12 ch, 11 slst), 24 sc (24)
```

The preview makes 12 outward chain stitches and 11 slip stitches returning along them, skipping the chain nearest the hook. The branch attaches to the preceding body stitch; at the start of a round, that is the last body stitch of the previous round. Put the branch later in the round to choose another attachment, for example `6 sc, branch(12 ch, 11 slst), 18 sc`. A returning branch requires exactly one fewer slip stitch than chains. Use `branch(12 ch)` for an open chain, or several branch instructions for multiple appendages.

Branch stitches are visible and selectable, but do not consume body stitches or enter the round's `(24)` total. The next round still works into the 24 body stitches. They do count toward the overall 8,000-stitch limit. Written text, CSV instructions and project JSON retain branch instructions, and PNG export includes their rendered shape. Free-form English such as “start in second ST from hook” must be translated into this syntax before pasting it into the app.

Each later round must consume exactly the previous round's available stitches. An ordinary stitch consumes one parent, an increase consumes one and produces two, a decrease consumes two and produces one, and a chain creates an output without consuming a parent. These explicit rules make the preview predictable; they do not cover every real crochet construction. To keep interactive work bounded, patterns are limited to 8,000 stitch outputs, 150 rounds, 120,000 characters and 12 nested repeat levels.

## Modeling scope

This version targets **continuous-round crochet**, with bobbles, safety-eye placement and attached chain branches. It preserves individual stitch IDs, construction order and parent attachments. A deterministic circular-profile approximation derives radii from body-round counts and estimates vertical rise from available stitch height and radial travel. Attachment placement adds local angular/radial variation; taller stitch types create more height. Branches use a deterministic outward curve with slip stitches alongside the chain; this previews an appendage's attachment and construction, not its final drape or a physically shaped horn.

The preview is **not a calibrated yarn, tension, stuffing or contact simulation**. Shaped beads and straight connectors show the construction graph, not the complete over-and-under yarn path. Bead proportions are visual stitch symbols. “Stitch size” changes display thickness, not pattern counts, physical dimensions or gauge.

Flat rows, turns, BLO/FLO, separate-component sewing, specialized hdc decreases and arbitrary mesh-to-pattern conversion are not implemented. A note such as `// BLO` remains a comment and does not change topology. Physical sample comparison is still needed before treating a preview as a size or shape prediction.

## Source map

- `src/lib/pattern.ts`: safe pattern tokenizer/parser, repeat expansion, count validation, attachment graph and examples.
- `src/lib/geometry.ts`: original deterministic profile-layout approximation and graph links.
- `src/components/PatternEditor.tsx`: CodeMirror editor and source-line selection.
- `src/components/PatternWorksheet.tsx` and `src/lib/worksheet.ts`: worksheet authoring, automatic totals, round ranges, spreadsheet paste and written export.
- `src/components/ModelViewer.tsx`: Three.js rendering, camera controls, picking and PNG capture.
- `src/lib/stitchAppearance.ts` and `src/components/StitchLegend.tsx`: shared stitch-shape definitions and the visible-round shape key.
- `src/lib/stitchFrame.ts`: parent-aligned bead rotations and rotated bounds.
- `src/lib/bobbleGeometry.ts`: lobed bobble stitch geometry.
- `src/lib/safetyEyes.ts`: eye directives, placement validation and surface positions.
- `src/App.tsx`: workspace, rendering controls, playback, import/export and local persistence.
- `src/components/RowManipulator.ts` and `src/lib/rowOffsets.ts`: vertical row dragging, selection, and shape offsets.
- `src/styles.css`: workspace layout and styling.
- `src/lib/*.test.ts`: parser and geometry regression checks.
- `docs/research/`: source-linked research and screenshot analysis that informed the prototype.

The application implementation is original to this repository. The research documents reference external projects; their implementation code has not been vendored into the app.
