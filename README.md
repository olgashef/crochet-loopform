# Loopform Studio

A local crochet pattern workspace with a live, individually editable stitch model. Built with React, TypeScript, CodeMirror, and Three.js.

## Run

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` creates the production bundle; `npm test` runs the parser, geometry, colorwork, assembly, persistence, and worksheet tests.

## Design a pattern

The three-panel workspace includes a searchable stitch library, a pattern editor (or editable rounds worksheet), and a 3D preview. Click library entries to insert notation at the code cursor. Add round continues the previous count. Validation identifies invalid counts and references; the preview retains the valid prefix of a pattern.

```text
Pattern name: "My first piece"
start: magic ring
Round 1 [#f3e8d6]: 6 sc in ring → 6
Round 2: inc x6 → 12
Round 3: (sc, inc) x6 → 18
Round 4-6: sc around → 18
Round 7: (sc, dec) x6 → 12
Round 8: dec x6 → 6
fasten off
```

Both `Round 3: (sc, inc) x6 → 18` and the older `Rnd 3: [sc, inc] rep 6 times (18)` work. Supports sc, hdc, dc, tr, ch, slst/ss, inc, dec, bobble/bbl, nested repeats, round ranges, same-stitch groups, chain branches, and safety eyes. Named color directives such as `[cream]` set the working yarn. Round-header colors and immediate suffixes such as `2 sc[#ff8800]` and `inc[,#ffffff]` are supported; suffix colors apply to their stitch operation without changing the following yarn.

`orientation top-down` places the first round at the crown. `orientation bottom-up` places it at the bottom. Choose **Safety eyes** under **Accessories** in the stitch library. Select two adjacent rounds, the gap after each eye’s stitch, and the diameter in millimeters, then confirm. The code updates in one undoable edit and the 3D view turns toward the new eyes. Cancel leaves the pattern unchanged. You can edit or remove pairs under **Piece settings & accessories → Safety eyes**.

The generated instruction is `eyes between 8 and 9 at 15, 22 size 8mm stitch 5mm`. Rounds and stitch positions start at one. Eye diameter supports 1–40 mm. **Preview scale** lets you set an approximate stitch width (1–20 mm; default 5 mm) for sizing relative to your yarn. Both measurements are saved in the pattern. Older unitless eye sizes, such as `size 0.8`, still render at their original relative size; editing them in the dialog converts them to millimeters using the default stitch width.

## Colorwork

Choose **Color → Brush**, choose a yarn, then drag over the 3D model or stitch chart. Each touched stitch is colored in full; the cursor path is sampled between pointer events so fast strokes stay continuous. The preview updates while dragging and commits once on release, making each stroke one undo step. Escape, losing pointer capture, or leaving the window cancels an unfinished stroke. Right-drag rotates the model in brush mode; Explore restores normal navigation.

Use **Eyedropper** (or Alt-click a stitch) to copy its exact stored yarn value, then continue brushing. Sampling never reads shaded screen pixels or changes the sampled stitch. **In this piece** swatches reuse exact existing shades; the **Active yarn** hex field accepts six-digit or shorthand hex values. Hovering a stitch also shows its yarn code.

**Select** retains selection-based colorwork. Choose a scope, select stitches, choose a yarn, and click Apply yarn. Selection scopes:

- Stitch: one output stitch, including one child of an increase.
- Multi: toggle individual stitches into a selection.
- Patch: the connected region of the same yarn, following course and parent links.
- Round: every body stitch in the clicked round.
- Whole piece: all stitches, including external chain branches.

Choose a color under “In this piece”, then **Select matching** to select every use of that exact shade. Choose a replacement and click **Apply yarn**. Undo and redo cover color, source, and project edits. Selection is highlighted on the 3D model and chart.

Painting preserves the original construction instructions and adds portable, editable directives:

```text
paint 4: 1=#ff8800, 2=#ff8800
```

The first number is the round, followed by one-based body stitch numbers. External branch stitches use `paint stitch 24: #ff8800`, where 24 is the one-based construction ID. Invalid paint references are reported, never silently remapped.

## Preview

Finished fabric combines an instanced continuous yarn loop with subtle helical ply ridges and a color-matched fabric backing. The backing prevents see-through gaps and blocks accidental picking of stitches on the far side. Closed amigurumi profiles have relaxed shoulders, and the foundation loops lie on the crown surface. The separate structure view exposes the construction graph.

Orbit, zoom, recenter, switch front view, choose a light/dark backdrop, or expand the preview. Use playback to build the piece round by round. Move individual rounds with the height handle or a numeric offset. Yarn size changes the visual yarn thickness without changing the pattern counts.

This is a geometric approximation, not a yarn/tension/stuffing physics simulation. It does not promise an exact real-world finished shape. Openwork, flat turning rows, complex freeform construction, sewing deformation, and embroidery are not simulated. Assembly positions pieces without physically sewing or deforming their fabric.

## Assemble multiple pieces

Switch from **Piece** to **Assembly** to view the whole project. The first tab is the main piece. Every other piece retains its own editable pattern, stitch colors, accessories, and row offsets.

1. Use **Add ear**, the **+** piece tab, or duplicate a piece. New pieces appear beside the main piece.
2. Select **Place on main piece**, then click the stitch where the piece should join. Rotate the view to reach the back. The joining edge (first or last round) snaps to that stitch and the piece points outward.
3. Use **Move** arrows/planes and **Rotate** rings, or enter XYZ position/offset, rotation in degrees, and size below the preview. Attached offsets are relative to the attachment stitch, in the main piece's coordinates.
4. Duplicate for a matching ear, then choose its new placement. **Detach** preserves the world pose. The visibility button hides a piece in Assembly; hiding the main piece also hides its attachments.

Attachments follow their stitch as the main pattern or row heights change, and move/rotate/scale with the main piece. If a pattern edit removes an attachment stitch, the previous anchor position remains available and a warning asks you to place it again. The first tab remains the assembly base and cannot be removed. Undo/redo includes attachments and treats each handle drag as one edit.

Assembly uses the same stitch geometry, fabric backing, yarn colors, and safety eyes as the individual preview. It caches piece geometry during placement so dragging only updates transforms. Project JSON preserves the full assembly; PNG export captures it without editing handles. Pattern TXT contains piece instructions, while placement is stored in project JSON.

## Projects & files

Projects have up to 30 independent pieces. Add, rename, duplicate, and remove them in the piece controls. Duplicating preserves colors, accessories, row offsets, and attachment settings. All edits autosave locally. Open tabs synchronize project edits while keeping their own selected piece; receiving another tab’s edit clears outdated undo history. Legacy `loopform.workspace.v1` data migrates into the new workspace without deleting the old save.

- Save project downloads all pieces, offsets, and assembly placements as `.loopform.json`.
- Export offers project JSON, all-piece pattern text, and a PNG of the current 3D view.
- Open accepts project JSON, older single-source JSON, and `.txt` / `.crochet` patterns.

Use project JSON for a complete round trip. All-piece TXT is a readable document with piece separators; import separate pieces individually. There is no account, server persistence, public gallery, or automatic upload. Keep downloaded project backups: browser storage may be cleared or unavailable.

## Implementation

- `src/lib/pattern.ts`: bounded parser and construction graph; never evaluates input.
- `src/lib/geometry.ts`: stitch placement and closed-form profile relaxation.
- `src/lib/yarnGeometry.ts`: shared plied-yarn geometry.
- `src/lib/fabricGeometry.ts`: colored inset backing for finished fabric.
- `src/lib/colorwork.ts`: connected selection, exact hex normalization, and lossless paint directives.
- `src/lib/stitchBrush.ts`: shared pointer capture, continuous strokes, sampling, and cancellation for 3D and chart views.
- `src/lib/studio.ts`: project validation, persistence, and starter patterns.
- `src/lib/assembly.ts`: stitch anchors, joining pivots, transforms, and attachment validation.
- `src/components/AssemblyViewer.tsx`: multiple-piece scene, surface picking, and transform handles.
- `src/lib/pieceMesh.ts`: colored yarn and accessory meshes for assembly.

The interaction model was researched from Crochet3D’s public guide and signed-in planner. Loopform uses its own local implementation and assets.

Brush edits take precedence over the colors written in rounds. The editor shows a **Painted colors active** notice, and painted stitch tooltips show both the effective and written yarn colors. **Manage painted colors → Restore pattern colors** removes brush overrides for one round or the whole piece; Undo restores them. Existing projects keep their paint until this action is used.
