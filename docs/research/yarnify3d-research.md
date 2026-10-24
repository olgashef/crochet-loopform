# Yarnify3D research and technical groundwork

Research date: 2026-10-24. Target: <https://yarnify3d.com/>.

## Status and evidence boundaries

**The primary Yarnify3D investigation is blocked by this environment's network policy. This is a partial research dossier, not a completed teardown of Yarnify.** Requests to both `yarnify3d.com` and `www.yarnify3d.com` received proxy-level HTTP 403 responses; the TLS CONNECT request was denied. This is not evidence that Yarnify itself is unavailable or returning 403.

During the initial web investigation, no Yarnify page, editor, JavaScript bundle, source map, example pattern, export file, screenshot, backend request, pricing page, or terms page was retrieved. Subsequently, the user supplied a screenshot showing a pattern beside Yarnify's rendered output. See [the screenshot analysis](yarnify3d-screenshot-analysis.md) for direct observations and implementation hypotheses based on that new evidence. Yarnify's source code and exact geometry algorithm remain unverified.

Public GitHub repository searches for `yarnify3d` and `"yarnify3d.com"` returned zero results. Issue searches for those terms also returned zero results. Searching `yarnify` returned unrelated projects; no ownership connection was established. These limited searches do **not** establish that Yarnify has no public source code. A broader combined search later encountered GitHub HTTP 429, so discovery coverage is incomplete.

Network additions for `yarnify3d.com`, `www.yarnify3d.com`, and `api.github.com` were saved in the environment configuration draft. The previously configured package-manager network presets were preserved. Draft persistence was confirmed, but activation and publication were not. User action in environment settings is required to activate access.

What follows is verified **independent prior art** and proposed design guidance for `crochet-modeler`. No connection between these projects and Yarnify has been established.

## What was actually collected

| Material | Result | Evidence strength |
| --- | --- | --- |
| Yarnify homepage and www variant | Blocked by environment proxy | Network observation only |
| Yarnify public GitHub discovery | No matching repository or issue found in the searches above | Limited negative search evidence |
| Tim Hutton's crochet simulator | README, GPL license, complete single-file JavaScript implementation inspected | Public source inspection; core algorithm exercised |
| CrochetPARADE GitHub project | README inspected; points to its current Codeberg repository | Public project documentation |
| Svetlin Tassev's CrochetPARADE GitHub checkout | Parser, graph solver, renderer, capability guide and mathematical documentation inspected selectively | Public source and documentation; app not executed |
| Reference simulator experiments | Three round-count sequences compiled into graphs and relaxed for 2,000 steps | Executed topology and numerical sanity checks; no physical-accuracy validation |

## 1. How a crochet pattern can become a 3D object

There are several distinct problems:

1. **Pattern interpretation:** determine stitch types, repeats, construction order and attachment targets.
2. **Topology:** determine which stitches connect to which other stitches, including increases, decreases, turns, joins and sewing.
3. **Geometry:** assign plausible positions and dimensions to this connected structure.
4. **Rendering:** draw a surface, stitch symbols, or yarn-like geometry at those positions.
5. **Pattern generation:** turn the same stitch operations into readable, consistent instructions and charts.

A visually convincing yarn texture addresses rendering. It does not, by itself, demonstrate that the modeled structure is crochetable or that a real object will have the predicted shape. Conversely, a useful stitch graph can be rendered simply while still supporting accurate counts, navigation and debugging.

## 2. Verified reference: Tim Hutton's crochet-simulator

Repository: <https://github.com/timhutton/crochet-simulator>.

Inspected commit: `b6e1ba1341f9258c7581ae1ebf02d5c56ff22c5b`.

### Pattern representation

The entire prototype lives in `index.html`. Its main arrays are:

- `verts`: one 3D point per stitch.
- `vel`: velocity of each point.
- `edges`: connected pairs of vertex indices.
- `neighbors`: adjacency lists.
- `faces`: triangles or quadrilaterals recognized from connections.
- `pending_commands`: expanded stitch operations waiting to be added.

Its compact notation uses `c` for a chain, `sc-n` for a single crochet attached to an earlier stitch, and `sc-n-m` for a single crochet attached to two earlier stitches. The latter represents an invisible-decrease-style connection. `(expression)N` repeats a sequence. These are this prototype's symbols, not a universal crochet notation or verified Yarnify syntax.

`single_crochet_with()` creates a new point and connects it to both the previous stitch in the working sequence and the specified older stitch. The two-target version connects to another older stitch and adds an extra edge pulling the two attachment points together. This makes increases/decreases changes to connectivity, rather than only a change to a displayed row total.

### Geometry and relaxation

Connected points attract or repel toward a common target distance `d`. The force on point `a` from point `b` is:

```text
x = position[a] - position[b]
force = 0.3 × (d - |x|) × x / |x|
```

Each relaxation step:

1. Multiplies velocities by `0.97` for damping.
2. Applies the connection forces along graph edges.
3. Optionally adds a small outward force from the origin when inflation is enabled.
4. Adds weak repulsion between second-neighbor points.
5. Caps movement speed at `0.2` and updates positions.
6. Recenters the object.

An animation loop adds another stitch when the maximum pre-cap speed falls below `0.1`. Newly placed points receive small random offsets to break symmetry. The code is a geometric heuristic; the inspected routine does not implement yarn contact, calibrated material behavior, stuffing pressure or full self-collision resolution. Its inflation term is an outward positional force, not a volumetric pressure model.

### Round counts → stitch instructions

`makePatternFromRowLengths()` starts with a chained ring, then computes relative attachment offsets for each subsequent round. An arithmetic distribution spreads increases/decreases around the previous round. Repeated identical operations are compressed into repeat syntax.

Important distinction: the row-count sequence is a convenient generator input. The generated attachment sequence is the information actually used by the simulator.

### Rendering and inverse modeling

This prototype projects 3D points onto a 2D canvas and draws mesh faces and edges. It does not depend on Three.js for that view.

There is also an experimental mesh-to-pattern route: accept a triangular, manifold Wavefront OBJ mesh with approximately equal face sizes; assign one stitch per face; construct a traversal through neighboring faces; turn prior-face relationships into stitch attachments. The documented input excludes normals and texture coordinates. This restricted experiment is not evidence of general conversion from arbitrary models into usable crochet patterns.

### Executed checks

The original JavaScript was evaluated in Node with an inert `window` object and deterministic random seed. The row-count generator, command expansion, stitch creation and relaxation routines were executed without altering the reference repository.

| Input round counts | Stitch points | Edges | Faces | References in range | Coordinates finite after 2,000 relaxation steps |
| --- | ---: | ---: | ---: | --- | --- |
| `6, 6, 6` | 18 | 30 | 12 | Yes | Yes |
| `6, 12, 18` | 36 | 66 | 30 | Yes | Yes |
| `6, 12, 18, 18, 12, 6` | 72 | 158 | 85 | Yes | Yes |

These checks establish that these examples generate usable graph data and numerically finite positions. They do not establish convergence, correct decrease placement for every input, visual shape quality, a valid manifold surface, or agreement with crocheted samples. Raw results are in [reference-experiments.json](reference-experiments.json).

Source map at the inspected commit:

- [Graph and stitch construction, lines 115–203](https://github.com/timhutton/crochet-simulator/blob/b6e1ba1341f9258c7581ae1ebf02d5c56ff22c5b/index.html#L115-L203).
- [Forces and relaxation, lines 227–304](https://github.com/timhutton/crochet-simulator/blob/b6e1ba1341f9258c7581ae1ebf02d5c56ff22c5b/index.html#L227-L304).
- [Pattern expansion, lines 306–325](https://github.com/timhutton/crochet-simulator/blob/b6e1ba1341f9258c7581ae1ebf02d5c56ff22c5b/index.html#L306-L325).
- [Round-count generator, lines 557–595](https://github.com/timhutton/crochet-simulator/blob/b6e1ba1341f9258c7581ae1ebf02d5c56ff22c5b/index.html#L557-L595).
- [Mesh traversal → instructions, lines 989–1029](https://github.com/timhutton/crochet-simulator/blob/b6e1ba1341f9258c7581ae1ebf02d5c56ff22c5b/index.html#L989-L1029).

## 3. Verified reference: CrochetPARADE

Project pointer: <https://github.com/crochetparade/CrochetPARADE>, inspected at `4a7c46f5907d5718688e5ee5fb0b4e3580ec55f9`. Its README points to <https://codeberg.org/crochetparade/CrochetPARADE> as the current source host. Codeberg was not inspected.

Source checkout inspected here: <https://github.com/stassev/CrochetPARADE>, commit `06e987b13ccfc94cfdfcebc1fe4664d37d2c6687`. Findings below describe this snapshot; it was not established that it matches the currently deployed app.

### Richer stitch topology

The documentation describes nodes as stitch top-V points plus internal points for complex stitches. Edges carry target lengths derived from stitch type and size. Unlike the simple prototype, a stitch can contain several material points and connections.

`parse64.js` contains a stitch dictionary, increase/together transformations, attachment resolution, row counting, label handling and export into a DOT-like graph representation. `parse_StitchCode()` separates a stitch definition into top nodes, bottom nodes, attachments, hidden nodes and connections. `export_to_dot()` writes graph nodes and edges with lengths and metadata.

The guide documents:

- Basic and taller stitches, loop-only and post variants, and user-defined stitch geometry.
- Repeats, variables, counters, labels and attachment references.
- Explicit references to chain spaces and other named targets.
- Multiple components and connections between separately made objects.
- Source context for a hovered stitch, including context before and after variable evaluation.

These features matter because “attach to the next stitch” is insufficient for many real patterns. Chain spaces, posts, loops, joins, turns and repeated sections require more precise semantics.

### Geometry solver

The inspected `graph.cpp` and its mathematical documentation use a weighted graph to reconstruct approximate rest geometry:

1. Parse target edge lengths and layout controls.
2. Run Dijkstra from every node to derive shortest-path distances across the graph; direct-edge distances retain their prescribed lengths.
3. Initialize node positions from a seed or supplied positions.
4. Iteratively adjust positions with weighted pair interactions. Edge lengths provide local constraints; non-edge interactions help prevent collapse, with influence changed over the iteration schedule.
5. Apply a final damped spring relaxation along graph edges.

The main pair-gradient term has the form:

```text
delta = position[i] - position[j]
r2 = dot(delta, delta)
target2 = targetDistance[i,j]²
gradient contribution = 0.5 × (r2 - target2) / (r2 + 0.001) × delta
```

This term is weighted differently for direct and non-direct neighbors. Shortest-path distance is a proxy for distance along the fabric, not the exact 3D straight-line distance. The optimization balances approximate constraints; it does not prove a unique physical embedding.

The source uses dense pair-distance data and pairwise loops. This motivates evaluating memory and runtime before adopting this approach for large projects; no performance benchmark was run here. The documentation also acknowledges that changing the initial seed can change an inside-out result. Handedness and orientation therefore deserve explicit treatment in a new implementation.

### Rendering, interaction and exports

`mesh64.js` imports Three.js, creates sphere/cylinder geometry for graph points and connections, and uses raycasting for selection. The inspected compilation instructions build the C++ graph engine with Emscripten and exported layout functions; the browser files include a `.wasm` artifact.

The capability guide documents 2D/3D views, stitch hover information, row/stitch/label highlighting, hiding later stitches, construction animation, color and thickness adjustments, stretch diagnostics and experimental incremental recalculation. It also documents SVG charts, GLTF model export, graph export, instruction text export and surface export workflows.

Generators include spheres and axially symmetric forms edited using a profile curve. The guide describes an STL remeshing workflow for approximate pattern generation and says turns are not implemented in that remesher's output. These are documented capabilities, not workflows executed in this investigation.

Source map:

- [Capabilities and authoring workflow](https://github.com/stassev/CrochetPARADE/blob/06e987b13ccfc94cfdfcebc1fe4664d37d2c6687/capabilities.md).
- [Stitch definitions and parsing](https://github.com/stassev/CrochetPARADE/blob/06e987b13ccfc94cfdfcebc1fe4664d37d2c6687/parse64.js).
- [Geometry solver](https://github.com/stassev/CrochetPARADE/blob/06e987b13ccfc94cfdfcebc1fe4664d37d2c6687/graph.cpp).
- [Mathematical explanation](https://github.com/stassev/CrochetPARADE/blob/06e987b13ccfc94cfdfcebc1fe4664d37d2c6687/docs/node_layout_documentation_v2.md).
- [Renderer, selection and chart generation](https://github.com/stassev/CrochetPARADE/blob/06e987b13ccfc94cfdfcebc1fe4664d37d2c6687/mesh64.js).
- [Compilation commands](https://github.com/stassev/CrochetPARADE/blob/06e987b13ccfc94cfdfcebc1fe4664d37d2c6687/compilation_instructions.txt).

The inspected Hutton repository contains a GPLv3 license. CrochetPARADE source headers specify GPLv3-or-later. No third-party implementation code was copied into this project; the dossier records algorithms, references and experiment output. Yarnify's licensing remains unknown.

## 4. Proposed design for crochet-modeler

**These are recommendations, not observations about Yarnify or confirmed gaps in its product.**

### Make stitch operations the shared source of truth

Use a structured pattern representation from which the model, chart, counts and prose are derived. Suggested conceptual pipeline:

```text
Pattern text / structured editor / shape design
                    ↓
Validated pattern operations, repeats and source locations
                    ↓
Resolved stitch graph with stable IDs and attachment targets
                    ↓
Approximate geometry + diagnostics
                    ↓
3D view / 2D chart / written pattern / project export
```

Keep compact repeated instructions alongside their expanded stitch instances. Every instance should be traceable to its source instruction and repeat iteration. Clicking a stitch can then highlight the instruction that created it, and selecting a repeated instruction can highlight all corresponding stitches.

Store topology separately from calculated positions so that changing camera settings or yarn appearance does not change the actual pattern. A project format should version the pattern semantics, gauge profile and geometry settings. Cached positions should be replaceable without losing the pattern.

Conceptual data to preserve:

| Entity | Useful fields |
| --- | --- |
| Project | format version, units, notation convention, components, yarn/gauge profiles |
| Component | ID, construction mode, foundation, rows/rounds, local orientation |
| Instruction | ID, stitch operation, repeat structure, source span, comments |
| Stitch instance | stable ID, parent instruction, repeat path, order, round/row, type, color |
| Attachment | target stitch/space/loop/post, attachment slot, direction |
| Assembly operation | sewing or join endpoints, orientation, sequence |
| Geometry cache | positions, solver version, seed, residual errors, input fingerprint |

### Validate stitch consumption and production

For a simple closed round containing only single crochet, two-stitch increases and two-together decreases, let `a`, `b`, `c` be their respective counts:

```text
previous stitches consumed = a + b + 2c
new stitches produced      = a + 2b + c
round count change         = b - c
```

For example, 12 → 18 can use six single crochets and six increases, written as `(sc, inc) × 6`. An 18 → 12 round can use `(sc, dec) × 6`. These examples assume standard single-crochet shaping and no additional joins, chains or skipped stitches.

Validate actual attachment coverage as well as totals. Correct arithmetic can still hide a duplicate attachment, an unintended skipped stitch or the wrong increase placement. Chains, turning chains, joins, magic rings and short rows need explicit semantics; they must not be forced into the simple round formula.

### Offer a fast preview and a more detailed model

A useful starting point for mostly rotational amigurumi is a profile preview. Under the assumption of circular, nearly horizontal rounds and effective stitch width `w`, a rough radius is:

```text
radius[k] ≈ roundStitchCount[k] × w / (2π)
```

This is a geometric approximation, not a general prediction. Stitch height constrains travel along the fabric, so using a fixed vertical height for every round becomes inaccurate on steeply changing profiles. A circle-profile preview also loses asymmetric increase placement, short rows, attachment geometry and noncircular cross-sections.

A more detailed mode can solve a stitch graph with stitch-specific dimensions, bending preferences, orientation constraints and optional assembly/stuffing approximations. Keep preview quality and simulation assumptions visible. Material calibration should use measured swatches and real crocheted reference shapes rather than only plausible-looking renders.

### Candidate improvements to evaluate against Yarnify later

1. **Bidirectional navigation:** text ↔ stitches ↔ chart with stable selection through edits.
2. **Count and attachment diagnostics:** show both consumed and produced stitches, unmatched targets and ambiguous repeats.
3. **Controlled shaping:** choose exact, evenly spaced, staggered or symmetric increase/decrease placement.
4. **Gauge-aware size:** distinguish stitch width, height and visual yarn radius; support measured gauge and intended dimensions.
5. **Pattern-writing support:** configurable US/UK terminology, repeat compression, round totals, color-change instructions, materials and assembly notes.
6. **Construction playback:** inspect the next attachment target and isolate a row/round or component.
7. **Assembly modeling:** separately made limbs, ears and other parts with explicit sewing references and placement guides.
8. **Responsive editing:** background geometry work, cancellation of outdated calculations, incremental updates and cached layouts.
9. **Portable files:** versioned editable project data plus readable text and chart exports; model export is a separate output.
10. **Reproducible validation:** fixed solver seeds, clearly identified approximations and a reference set of patterns with photographed, measured physical samples.

For an initial scope, continuous-round single-crochet amigurumi is much smaller than general crochet. Start with a magic ring, `sc`, `inc`, `dec`, color changes, explicit round totals and simple components. Lace, complex post stitches, arbitrary surface-to-pattern conversion and calibrated yarn physics require additional semantics and validation.

## 5. Exact Yarnify investigation to resume when access works

### Public pages and distribution

- Read the homepage, help/tutorials, examples, changelog, terms and any source/license links.
- Record routes and the unauthenticated workflow. Distinguish advertised features from features actually exercised.
- Inspect the HTML, publicly delivered CSS/JavaScript, worker scripts, WebAssembly files and explicitly linked source maps. Identify third-party libraries from concrete bundle evidence.
- Follow a publicly linked repository if one exists; record commit/version and license. Browser-delivered assets alone do not establish access to private source or backend implementation.

### Controlled editor experiments

Use only disposable local examples and record inputs, screenshots, export data and observed behavior:

| Experiment | What it can distinguish |
| --- | --- |
| Constant round counts | Cylinder/profile approximation versus additional geometry effects |
| Increasing then decreasing counts | Shaping rules, closure and increase/decrease distribution |
| Same totals, different increase locations | Whether positions affect the model or only round totals matter |
| Same pattern, different gauge | Actual dimension scaling versus purely visual yarn thickness |
| Single, half-double and double crochet | Whether stitch height/type changes geometry or appearance only |
| Chains, joins, turns, BLO/FLO and spaces | Supported topology and attachment semantics |
| Invalid count or malformed repeat | Error detection, recovery and source location quality |
| Color changes | Color per stitch, per round or separate render layer |
| Multiple parts and sewing | Assembly support and storage representation |
| Small versus large patterns | Recalculation behavior, workers, cancellation and approximate performance |
| Export → import round trip | Preservation of operations, stable IDs, gauge, colors and assembly |

### Code and data tracing

Trace one tiny example through editor state, parsed operations, graph/profile generation, coordinate calculation, mesh generation and export. Inspect browser storage and network activity only for that disposable example. Separate observed requests from assumptions about server behavior. Do not upload the user's own designs or exercise publishing/purchase flows for this research.

The decisive questions are whether Yarnify stores exact attachment topology, whether its geometry is a lathed profile or graph/physical model, and whether its written instructions and model come from the same underlying representation. These remain unanswered.

## Next action

Activate the saved domain additions through environment settings and publish the environment, then verify access and continue the primary-site investigation. Additional asset hosts may be identifiable only after retrieving Yarnify's HTML. Until that succeeds, there is no verified Yarnify-specific feature comparison or code analysis.
