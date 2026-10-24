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

- Write patterns in the syntax-highlighted editor. Auto-render updates valid changes after a short pause; turn it off to render manually. Use **Ctrl+Enter / Cmd+Enter** to render at any time.
- Inspect count and attachment errors by source line. An invalid edit preserves the last valid preview.
- Orbit, pan and zoom the 3D model. Click a stitch to inspect its round, position, type, source line and parent connections.
- Switch between **Stitches** and **Structure**, adjust display stitch size, reset the camera or use fullscreen.
- Scrub through rounds, step forward/back or play the construction sequence.
- Recognize stitch types by shape: round **SC** bubbles, elongated **HDC** beads, longer **DC** beads and the tallest **TR** beads. Chains and slip stitches are flattened; decreases are wide beads. The shape key shows the types in the visible rounds while yarn colors retain their pattern meaning.
- Load the **Mushroom cap**, **Little sphere**, **Everyday basket** or **Stitch sampler** examples. The sampler uses one color to compare stitch shapes directly.
- Import `.crochet` / `.txt` patterns or version-1 Loopform `.json` projects. Export pattern text, an editable project or a PNG of the current model view.
- Pattern text and display thickness are saved in this browser's local storage when available. Export a file to keep a portable copy; browser storage is not a backup.

## Pattern format

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
| `6 sc`                  | Six stitches; an omitted count means one                          |
| `[sc, inc] rep 6 times` | Repeat a group; nested groups are supported                       |
| `in mc`                 | Magic-ring foundation in round 1; `mr` and `magic ring` also work |
| `(24)`                  | Optional expected output count, checked against the instructions  |
| `[beige]`, `[#a9c6b5]`  | Named yarn color or three-/six-digit hex color                    |
| `// comment`            | Comment, including after instructions                             |
| `# My pattern`          | Comment; the first nonempty `#` line supplies the pattern title   |

Aliases include `ss`, `chain`, `increase`, `decrease`, and `R1:` / `Round 1:` round labels. Repeats also accept `repeat`, `x` or `*` instead of `rep`.

Each later round must consume exactly the previous round's available stitches. An ordinary stitch consumes one parent, an increase consumes one and produces two, a decrease consumes two and produces one, and a chain creates an output without consuming a parent. These explicit rules make the preview predictable; they do not cover every real crochet construction. To keep interactive work bounded, patterns are limited to 8,000 stitch outputs, 150 rounds, 120,000 characters and 12 nested repeat levels.

## Modeling scope

This first version targets **continuous-round crochet**. It preserves individual stitch IDs, construction order and parent attachments. A deterministic circular-profile approximation derives radii from round counts and estimates vertical rise from available stitch height and radial travel. Attachment placement adds local angular/radial variation; taller stitch types create more height.

The preview is **not a calibrated yarn, tension, stuffing or contact simulation**. Shaped beads and straight connectors show the construction graph, not the complete over-and-under yarn path. Bead proportions are visual stitch symbols. “Stitch size” changes display thickness, not pattern counts, physical dimensions or gauge.

Flat rows, turns, BLO/FLO, separate-component sewing, specialized hdc decreases and arbitrary mesh-to-pattern conversion are not implemented. A note such as `// BLO` remains a comment and does not change topology. Physical sample comparison is still needed before treating a preview as a size or shape prediction.

## Source map

- `src/lib/pattern.ts`: safe pattern tokenizer/parser, repeat expansion, count validation, attachment graph and examples.
- `src/lib/geometry.ts`: original deterministic profile-layout approximation and graph links.
- `src/components/PatternEditor.tsx`: CodeMirror editor and source-line selection.
- `src/components/ModelViewer.tsx`: Three.js rendering, camera controls, picking and PNG capture.
- `src/lib/stitchAppearance.ts` and `src/components/StitchLegend.tsx`: shared stitch-shape definitions and the visible-round shape key.
- `src/App.tsx`: workspace, rendering controls, playback, import/export and local persistence.
- `src/styles.css`: workspace layout and styling.
- `src/lib/*.test.ts`: parser and geometry regression checks.
- `docs/research/`: source-linked research and screenshot analysis that informed the prototype.

The application implementation is original to this repository. The research documents reference external projects; their implementation code has not been vendored into the app.
