import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileJson,
  FileText,
  FolderOpen,
  Image,
  Layers3,
  Maximize2,
  Minus,
  MousePointer2,
  MoveVertical,
  Undo2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { PatternWorksheet } from "./components/PatternWorksheet";
import { csvPattern, writtenPattern } from "./lib/worksheet";
import { PatternEditor } from "./components/PatternEditor";
import { ModelViewer, type ViewerHandle } from "./components/ModelViewer";
import { StitchLegend } from "./components/StitchLegend";
import { sanitizeRowOffsets, type RowOffsets } from "./lib/rowOffsets";
import { buildGeometry } from "./lib/geometry";
import { EXAMPLES, parsePattern, YARN_COLORS } from "./lib/pattern";

function RowOffsetInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(Number(value.toFixed(3))));
  }, [value, focused]);
  return (
    <input
      aria-label="Row vertical offset"
      type="number"
      step="0.1"
      min="-1000"
      max="1000"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const next = Number(draft);
        if (draft.trim() && Number.isFinite(next)) onCommit(next);
        else setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

const STORAGE_KEY = "loopform.workspace.v1";
const STITCH_NAMES: Record<string, string> = {
  sc: "Single crochet",
  hdc: "Half double crochet",
  dc: "Double crochet",
  tr: "Treble crochet",
  ch: "Chain",
  slst: "Slip stitch",
  dec: "Decrease",
};

function readWorkspace(): {
  source: string;
  compiledSource: string;
  thickness: number;
  rowOffsets: RowOffsets;
  editorMode: "worksheet" | "code";
} {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (typeof value?.source === "string" && value.source.length <= 120_000) {
      const candidate =
        typeof value.compiledSource === "string" &&
        value.compiledSource.length <= 120_000
          ? value.compiledSource
          : value.source;
      const compiledSource = parsePattern(candidate).diagnostics.some(
        (item) => item.severity === "error",
      )
        ? EXAMPLES[0].source
        : candidate;
      return {
        source: value.source,
        editorMode: value.editorMode === "code" ? "code" : "worksheet",
        compiledSource,
        rowOffsets:
          compiledSource === candidate
            ? sanitizeRowOffsets(value.rowOffsets)
            : {},
        thickness: Number.isFinite(value.thickness)
          ? Math.min(1.65, Math.max(0.6, value.thickness))
          : 1,
      };
    }
  } catch {
    /* An unavailable local store should not prevent editing. */
  }
  return {
    source: EXAMPLES[0].source,
    compiledSource: EXAMPLES[0].source,
    thickness: 1,
    rowOffsets: {},
    editorMode: "worksheet",
  };
}

function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [initial] = useState(readWorkspace);
  const [rowOffsets, setRowOffsets] = useState<RowOffsets>(initial.rowOffsets);
  const rowOffsetsRef = useRef(rowOffsets);
  rowOffsetsRef.current = rowOffsets;
  const [moveRows, setMoveRows] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [rowHistory, setRowHistory] = useState<RowOffsets[]>([]);
  const rowHistoryRef = useRef(rowHistory);
  rowHistoryRef.current = rowHistory;
  const pendingMove = useRef<RowOffsets | null>(null);
  const applyRowOffsets = useCallback((next: RowOffsets) => {
    rowOffsetsRef.current = next;
    setRowOffsets(next);
  }, []);
  const moveRow = useCallback(
    (row: number, value: number) => {
      if (!Number.isFinite(value)) return;
      const next = {
        ...rowOffsetsRef.current,
        [row]: Math.max(-1000, Math.min(1000, value)),
      };
      if (Math.abs(next[row]) < 0.00001) delete next[row];
      applyRowOffsets(next);
    },
    [applyRowOffsets],
  );
  const startRowMove = useCallback(() => {
    pendingMove.current = { ...rowOffsetsRef.current };
  }, []);
  const endRowMove = useCallback((cancel = false) => {
    const previous = pendingMove.current;
    pendingMove.current = null;
    if (
      !cancel &&
      previous &&
      JSON.stringify(previous) !== JSON.stringify(rowOffsetsRef.current)
    )
      setRowHistory((h) => [...h.slice(-49), previous]);
  }, []);
  const undoRowMove = useCallback(() => {
    const history = rowHistoryRef.current;
    if (!history.length) return;
    applyRowOffsets(history[history.length - 1]);
    const next = history.slice(0, -1);
    rowHistoryRef.current = next;
    setRowHistory(next);
  }, [applyRowOffsets]);
  function stepRow(row: number, value: number) {
    startRowMove();
    moveRow(row, value);
    endRowMove();
  }
  const [worksheetEditingLine, setWorksheetEditingLine] = useState<
    number | null
  >(null);
  const [editorMode, setEditorMode] = useState<"worksheet" | "code">(
    initial.editorMode,
  );
  const [source, setSource] = useState(initial.source);
  const [compiledSource, setCompiledSource] = useState(initial.compiledSource);
  const [thickness, setThickness] = useState(initial.thickness);
  const [autoRender, setAutoRender] = useState(true);
  const [visibleRounds, setVisibleRounds] = useState(150);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"stitches" | "structure">("stitches");
  const [selectedStitch, setSelectedStitch] = useState<number | null>(null);
  const [menu, setMenu] = useState<"examples" | "export" | null>(null);
  const [help, setHelp] = useState<"syntax" | "model" | null>(null);
  const [toast, setToast] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "unavailable">("saved");
  const [rendering, setRendering] = useState(false);
  const viewer = useRef<ViewerHandle>(null);
  const previewPanel = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const draft = useMemo(() => parsePattern(source), [source]);
  const compiled = useMemo(
    () => parsePattern(compiledSource),
    [compiledSource],
  );
  const geometry = useMemo(() => buildGeometry(compiled), [compiled]);
  const errors = draft.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  const pendingWorksheet =
    editorMode === "worksheet" &&
    errors.length > 0 &&
    errors[0].line === worksheetEditingLine;
  const warning = draft.diagnostics.find(
    (diagnostic) => diagnostic.severity === "warning",
  );
  const roundCount = compiled.rounds.length;
  const currentRound = Math.max(1, Math.min(visibleRounds, roundCount || 1));
  const visibleStitchTypes = useMemo(
    () => [
      ...new Set(
        compiled.stitches
          .filter((stitch) => stitch.round <= currentRound)
          .map((stitch) => stitch.type),
      ),
    ],
    [compiled, currentRound],
  );
  const dirty = compiledSource !== source;
  const selected =
    selectedStitch === null
      ? null
      : compiled.stitches.find((stitch) => stitch.id === selectedStitch);
  const colors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stitch of compiled.stitches)
      counts.set(stitch.color, (counts.get(stitch.color) || 0) + 1);
    return [...counts].map(([color, count]) => ({
      color,
      count,
      name:
        Object.entries(YARN_COLORS).find(([, value]) => value === color)?.[0] ||
        color,
    }));
  }, [compiled]);

  const renderPattern = useCallback(() => {
    if (
      draft.diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ) {
      setToast("Check the highlighted line before rendering.");
      return;
    }
    if (source !== compiledSource) {
      applyRowOffsets({});
      setRowHistory([]);
      setSelectedRow(null);
    }
    setCompiledSource(source);
    setSelectedStitch(null);
    setVisibleRounds(draft.rounds.length || 1);
    setPlaying(false);
    setRendering(true);
    window.setTimeout(() => setRendering(false), 400);
  }, [source, compiledSource, draft, applyRowOffsets]);

  useEffect(() => {
    if (!autoRender || !dirty || errors.length) return;
    const timeout = window.setTimeout(renderPattern, 450);
    return () => window.clearTimeout(timeout);
  }, [autoRender, dirty, source, errors.length, renderPattern]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          source,
          compiledSource,
          thickness,
          rowOffsets,
          editorMode,
        }),
      );
      setSaveState("saved");
    } catch {
      setSaveState("unavailable");
    }
  }, [source, compiledSource, thickness, rowOffsets, editorMode]);

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => {
      setVisibleRounds((round) => Math.min(round + 1, roundCount));
    }, 700);
    return () => window.clearInterval(interval);
  }, [playing, roundCount]);

  useEffect(() => {
    if (playing && visibleRounds >= roundCount) setPlaying(false);
  }, [playing, visibleRounds, roundCount]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHelp(null);
        setMenu(null);
        setSelectedStitch(null);
      }
    };
    const click = (event: MouseEvent) => {
      if (!(event.target as Element).closest("[data-dropdown]")) setMenu(null);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("click", click);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", click);
    };
  }, []);

  useEffect(() => {
    if (selectedRow !== null && selectedRow > currentRound)
      setSelectedRow(null);
  }, [selectedRow, currentRound]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !moveRows ||
        (e.target instanceof Element &&
          e.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      if (e.key === "Escape") {
        setSelectedRow(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoRowMove();
        return;
      }
      if (selectedRow !== null && ["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        startRowMove();
        moveRow(
          selectedRow,
          (rowOffsetsRef.current[selectedRow] || 0) +
            (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 0.5 : 0.1),
        );
        endRowMove();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [moveRows, selectedRow, undoRowMove, startRowMove, moveRow, endRowMove]);

  function loadSource(value: string) {
    setWorksheetEditingLine(null);
    if (value.length > 120_000) {
      setToast("This pattern is too large. Use at most 120,000 characters.");
      return;
    }
    applyRowOffsets({});
    setRowHistory([]);
    setSelectedRow(null);
    setSource(value);
    setSelectedStitch(null);
    setPlaying(false);
    const result = parsePattern(value);
    if (
      !result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ) {
      setCompiledSource(value);
      setVisibleRounds(result.rounds.length || 1);
      setSelectedStitch(null);
      setPlaying(false);
    }
    setMenu(null);
  }

  const filename = (compiled.name || "my-pattern")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Loopform home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40">
              <ellipse
                cx="20"
                cy="20"
                rx="7"
                ry="13"
                transform="rotate(-35 20 20)"
              />
              <ellipse
                cx="20"
                cy="20"
                rx="7"
                ry="13"
                transform="rotate(35 20 20)"
              />
            </svg>
          </span>
          <span>
            loopform<span className="brand-period">.</span>
          </span>
          <span className="beta-badge">BETA</span>
        </a>
        <nav className="header-nav" aria-label="Main navigation">
          <span className="nav-workspace">
            <Box size={15} /> Workspace
          </span>
          <button onClick={() => setHelp("syntax")}>
            <BookOpen size={15} /> Syntax guide{" "}
            <ArrowUpRight className="nav-arrow" size={12} />
          </button>
        </nav>
        <div className="header-right">
          <span className="local-save">
            <span className="status-dot" />{" "}
            {saveState === "saved"
              ? "Saved on this device"
              : "Local saving unavailable"}
          </span>
          <button
            className="button subtle open-button"
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen size={15} /> Open
          </button>
          <div className="dropdown-container" data-dropdown>
            <button
              className="button export-button"
              aria-expanded={menu === "export"}
              onClick={() => setMenu(menu === "export" ? null : "export")}
            >
              <ArrowDownToLine size={15} /> Export <ChevronDown size={13} />
            </button>
            {menu === "export" && (
              <div className="dropdown export-menu">
                <span className="dropdown-heading">
                  TAKE YOUR WORK WITH YOU
                </span>
                <button
                  onClick={() => {
                    saveFile(
                      `${filename}.crochet`,
                      writtenPattern(source),
                      "text/plain",
                    );
                    setMenu(null);
                  }}
                >
                  <FileText size={17} />
                  <span>
                    Pattern text
                    <small>Written rounds with automatic totals</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    saveFile(`${filename}.csv`, csvPattern(source), "text/csv;charset=utf-8");
                    setMenu(null);
                  }}
                >
                  <FileText size={17} />
                  <span>
                    Pattern CSV
                    <small>Rounds, instructions, totals and yarn for spreadsheets</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    saveFile(
                      `${filename}.json`,
                      JSON.stringify(
                        {
                          version: 1,
                          application: "loopform",
                          rowOffsets: dirty ? {} : rowOffsets,
                          source,
                          thickness,
                        },
                        null,
                        2,
                      ),
                      "application/json",
                    );
                    setMenu(null);
                  }}
                >
                  <FileJson size={17} />
                  <span>
                    Loopform project
                    <small>Pattern, shape edits and display settings</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    viewer.current?.exportImage();
                    setMenu(null);
                  }}
                >
                  <Image size={17} />
                  <span>
                    Model image<small>Save the current view as PNG</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="workspace">
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              <span /> A LITTLE CODE. A WORLD OF STITCHES.
            </div>
            <h1>Your next idea, in the making.</h1>
            <p>Write a crochet pattern. Watch it take shape.</p>
          </div>
          <div className="workspace-actions">
            <button
              className="button new-button"
              onClick={() =>
                loadSource(
                  "# Untitled pattern\n# Start something handmade\n\n[sage]\n1: 6 sc in mc (6)\n2: 6 inc (12)\n3: 12 sc (12)",
                )
              }
            >
              <Plus size={15} /> New pattern
            </button>
            <div className="dropdown-container" data-dropdown>
              <button
                className="button examples-button"
                aria-expanded={menu === "examples"}
                onClick={() => setMenu(menu === "examples" ? null : "examples")}
              >
                <Layers3 size={15} />
                <span>Explore examples</span>
                <ChevronDown size={14} />
              </button>
              {menu === "examples" && (
                <div className="dropdown examples-menu">
                  <span className="dropdown-heading">
                    A FEW PLACES TO START
                  </span>
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.id}
                      onClick={() => {
                        loadSource(example.source);
                        setToast(
                          `Loaded ${example.name.toLowerCase()}. Make it your own.`,
                        );
                      }}
                    >
                      <span className={`example-icon ${example.id}`}>
                        <Layers3 size={19} />
                      </span>
                      <span>
                        {example.name}
                        <small>{example.description}</small>
                      </span>
                      {compiled.name === example.name && (
                        <Check size={15} className="example-check" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="workbench">
          <section className="editor-panel panel" aria-label="Pattern editor">
            <div className="panel-heading">
              <div className="panel-label">
                <Braces size={17} />
                <h2>Pattern editor</h2>
              </div>
              <div
                className="editor-format-toggle"
                aria-label="Pattern editing format"
              >
                <button
                  className={editorMode === "worksheet" ? "active" : ""}
                  aria-pressed={editorMode === "worksheet"}
                  onClick={() => {
                    setWorksheetEditingLine(null);
                    setEditorMode("worksheet");
                  }}
                >
                  Worksheet
                </button>
                <button
                  className={editorMode === "code" ? "active" : ""}
                  aria-pressed={editorMode === "code"}
                  onClick={() => {
                    setWorksheetEditingLine(null);
                    setEditorMode("code");
                  }}
                >
                  Code
                </button>
              </div>
              <button
                className="icon-button help-button"
                aria-label="Open syntax guide"
                title="Syntax guide"
                onClick={() => setHelp("syntax")}
              >
                <CircleHelp size={16} />
              </button>
            </div>
            <div className="file-tab">
              <FileText size={13} />
              <span>pattern.crochet</span>
              <span
                className={`file-dot ${dirty ? "dirty" : ""}`}
                title={dirty ? "Unrendered changes" : "Up to date"}
              />
              <span className="file-language">
                {editorMode === "worksheet" ? "AUTOMATIC COUNTS" : "CROCHET"}
              </span>
            </div>
            <div className="editor-content">
              {editorMode === "worksheet" ? (
                <PatternWorksheet
                  onEditingChange={setWorksheetEditingLine}
                  value={source}
                  onChange={(value) => {
                    setSource(value);
                    setSelectedStitch(null);
                  }}
                  diagnostics={draft.diagnostics}
                  onRender={renderPattern}
                  selectedLine={!dirty ? (selected?.sourceLine ?? null) : null}
                />
              ) : (
                <PatternEditor
                  value={source}
                  onChange={(value) => {
                    setSource(value);
                    setSelectedStitch(null);
                  }}
                  diagnostics={draft.diagnostics}
                  onRender={renderPattern}
                  selectedLine={!dirty ? (selected?.sourceLine ?? null) : null}
                />
              )}
            </div>
            <div
              className={`validation-strip ${errors.length && !pendingWorksheet ? "has-error" : warning && draft.rounds.length ? "has-warning" : ""}`}
              aria-live="polite"
            >
              {pendingWorksheet ? (
                <>
                  <span className="validation-icon">
                    <Braces size={10} />
                  </span>
                  <span>Finish this instruction to update the preview.</span>
                </>
              ) : errors.length ? (
                <>
                  <AlertCircle size={15} />
                  <div>
                    <strong>
                      Line {errors[0].line} needs a little attention
                    </strong>
                    <span>{errors[0].message}</span>
                  </div>
                </>
              ) : warning && draft.rounds.length ? (
                <>
                  <AlertCircle size={14} />
                  <span>{warning.message}</span>
                </>
              ) : (
                <>
                  <span className="validation-icon">
                    <Check size={11} strokeWidth={2.5} />
                  </span>
                  <span>
                    {draft.rounds.length
                      ? "All stitch counts add up"
                      : "Your canvas is ready. Add a first round."}
                  </span>
                  {!!draft.rounds.length && (
                    <span className="valid-rounds">
                      {draft.rounds.length} rounds
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="editor-actions">
              <label className="auto-render">
                <input
                  type="checkbox"
                  checked={autoRender}
                  onChange={(event) => setAutoRender(event.target.checked)}
                />
                <span className="switch" />
                <span>Auto-render</span>
              </label>
              <button
                className="button render-button"
                aria-label="Render pattern"
                aria-keyshortcuts="Control+Enter Meta+Enter"
                onClick={renderPattern}
                disabled={!!errors.length}
              >
                <Play size={13} fill="currentColor" />
                {rendering ? "Rendered" : "Render pattern"}
                <kbd>⌘ ↵</kbd>
              </button>
            </div>
          </section>

          <section
            className="preview-panel panel"
            ref={previewPanel}
            aria-label="3D model preview"
          >
            <div className="panel-heading preview-heading">
              <div className="panel-label">
                <Box size={17} />
                <h2>3D preview</h2>
              </div>
              <div className="preview-tools">
                <div className="view-toggle" aria-label="Model display mode">
                  <button
                    className={mode === "stitches" ? "active" : ""}
                    aria-pressed={mode === "stitches"}
                    onClick={() => setMode("stitches")}
                  >
                    <span className="stitch-view-icon" />
                    Stitches
                  </button>
                  <button
                    className={mode === "structure" ? "active" : ""}
                    aria-pressed={mode === "structure"}
                    onClick={() => setMode("structure")}
                  >
                    <Box size={13} />
                    Structure
                  </button>
                </div>
                <button
                  className={`icon-button row-mode-button ${moveRows ? "active" : ""}`}
                  aria-label="Move rows"
                  title="Select and move rows"
                  aria-pressed={moveRows}
                  onClick={() => {
                    setMoveRows(!moveRows);
                    setSelectedStitch(null);
                    setPlaying(false);
                  }}
                >
                  <MoveVertical size={17} />
                  <span className="row-mode-label">Move rows</span>
                </button>
                <span className="toolbar-divider" />
                <button
                  className="icon-button"
                  aria-label="Reset camera"
                  title="Reset view"
                  onClick={() => viewer.current?.resetView()}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  className="icon-button fullscreen-button"
                  aria-label="Toggle fullscreen"
                  title="Full screen"
                  onClick={() => {
                    if (document.fullscreenElement)
                      void document.exitFullscreen();
                    else
                      void previewPanel.current
                        ?.requestFullscreen()
                        .catch(() =>
                          setToast(
                            "Full screen is unavailable in this browser.",
                          ),
                        );
                  }}
                >
                  <Maximize2 size={15} />
                </button>
              </div>
            </div>
            <div className="canvas-area">
              <div className="model-meta">
                <span className="model-tag">
                  <span
                    className={`status-dot ${errors.length ? "error" : ""}`}
                  />
                  {errors.length
                    ? "LAST VALID PREVIEW"
                    : dirty
                      ? "CHANGES PENDING"
                      : "LIVE PREVIEW"}
                </span>
                <h3>{compiled.name || "Untitled pattern"}</h3>
                <span className="model-subtitle">
                  {compiled.stitches.length.toLocaleString()} stitches{" "}
                  <span>·</span> {roundCount} rounds <span>·</span>{" "}
                  {colors.length} {colors.length === 1 ? "color" : "colors"}
                </span>
              </div>
              <ModelViewer
                ref={viewer}
                model={geometry.points.length ? geometry : null}
                visibleRounds={currentRound}
                thickness={thickness}
                mode={mode}
                selectedStitch={selectedStitch}
                onSelect={setSelectedStitch}
                rowOffsets={rowOffsets}
                moveRows={moveRows}
                selectedRow={selectedRow}
                onSelectRow={(row) => {
                  setSelectedRow(row);
                  setSelectedStitch(null);
                  setPlaying(false);
                }}
                onRowMove={moveRow}
                onRowDragStart={startRowMove}
                onRowDragEnd={endRowMove}
              />
              {moveRows && (
                <div
                  className="row-edit-card"
                  aria-label="Row movement controls"
                >
                  <div className="row-edit-title">
                    <MoveVertical size={14} />
                    <strong>Move a row</strong>
                    <button
                      className="icon-button"
                      aria-label="Exit row movement"
                      onClick={() => setMoveRows(false)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <select
                    aria-label="Selected row"
                    value={selectedRow ?? ""}
                    onChange={(e) =>
                      setSelectedRow(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  >
                    <option value="">Click a row line…</option>
                    {compiled.rounds
                      .filter((r) => r.number <= currentRound)
                      .map((r) => (
                        <option value={r.number} key={r.number}>
                          Round {r.number} · {r.outputCount} stitches
                        </option>
                      ))}
                  </select>
                  {selectedRow !== null ? (
                    <>
                      <label className="row-offset-label">
                        Vertical offset
                        <RowOffsetInput
                          value={rowOffsets[selectedRow] || 0}
                          onCommit={(value) => stepRow(selectedRow, value)}
                        />
                      </label>
                      <div className="row-step-buttons">
                        <button
                          onClick={() =>
                            stepRow(
                              selectedRow,
                              (rowOffsets[selectedRow] || 0) + 0.25,
                            )
                          }
                          aria-label="Move selected row up"
                        >
                          ↑ Up
                        </button>
                        <button
                          onClick={() =>
                            stepRow(
                              selectedRow,
                              (rowOffsets[selectedRow] || 0) - 0.25,
                            )
                          }
                          aria-label="Move selected row down"
                        >
                          ↓ Down
                        </button>
                        <button
                          onClick={() => stepRow(selectedRow, 0)}
                          disabled={!rowOffsets[selectedRow]}
                        >
                          Reset row
                        </button>
                      </div>
                      <p>
                        Drag the green arrow or the highlighted line. ↑ / ↓
                        nudge; Shift moves faster.
                      </p>
                    </>
                  ) : (
                    <p>
                      Grab a row line, then drag up or down. Only that row
                      moves.
                    </p>
                  )}
                  <div className="row-edit-footer">
                    <button onClick={() => viewer.current?.frontView()}>
                      Front view
                    </button>
                    <button
                      aria-label="Undo row move"
                      disabled={!rowHistory.length}
                      onClick={undoRowMove}
                    >
                      <Undo2 size={11} /> Undo
                    </button>
                    <button
                      disabled={!Object.keys(rowOffsets).length}
                      onClick={() => {
                        startRowMove();
                        applyRowOffsets({});
                        endRowMove();
                      }}
                    >
                      Reset all
                    </button>
                  </div>
                  <small>Shape adjustment · pattern counts stay the same</small>
                </div>
              )}
              <div className="view-corner">
                <svg
                  className="axis-gizmo"
                  width="52"
                  height="52"
                  viewBox="0 0 52 52"
                  aria-label="3D axes"
                >
                  <path d="M26 29V8" stroke="#6d8e7a" />
                  <path d="m26 29 18 9" stroke="#bc796a" />
                  <path d="m26 29-17 9" stroke="#8a98ab" />
                  <circle cx="26" cy="29" r="2.5" fill="#9aa39b" />
                  <text x="23" y="7" fill="#6d8e7a">
                    Y
                  </text>
                  <text x="44" y="43" fill="#bc796a">
                    X
                  </text>
                  <text x="3" y="43" fill="#8a98ab">
                    Z
                  </text>
                </svg>
                <span>Perspective</span>
              </div>
              <div className="zoom-controls">
                <button
                  className="icon-button"
                  aria-label="Zoom in"
                  title="Zoom in"
                  onClick={() => viewer.current?.zoomIn()}
                >
                  <Plus size={16} />
                </button>
                <span />
                <button
                  className="icon-button"
                  aria-label="Zoom out"
                  title="Zoom out"
                  onClick={() => viewer.current?.zoomOut()}
                >
                  <Minus size={16} />
                </button>
              </div>
              {selected && selected.round <= currentRound && (
                <div className="stitch-inspector">
                  <div>
                    <span className="eyebrow">A CLOSER LOOK</span>
                    <button
                      className="icon-button"
                      aria-label="Close stitch details"
                      onClick={() => setSelectedStitch(null)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <strong>
                    <span style={{ background: selected.color }} />
                    {selected.isIncrease
                      ? "Increase stitch"
                      : STITCH_NAMES[selected.type]}
                  </strong>
                  <p>
                    Round {selected.round}
                    <span>·</span>Stitch {selected.index + 1}
                    <span>·</span>Line {selected.sourceLine}
                  </p>
                  <small>
                    {selected.parents.length === 2
                      ? "Joined to two stitches below"
                      : selected.isIncrease
                        ? "Shares its parent with another stitch"
                        : selected.parents.length
                          ? "Worked into one stitch below"
                          : "Worked into the magic ring"}
                  </small>
                </div>
              )}
              <span className="canvas-hint">
                <MousePointer2 size={12} />
                {moveRows ? (
                  "Grab a row line · Drag vertically · Esc to cancel"
                ) : (
                  <>
                    Drag to rotate<span>·</span>Scroll to zoom<span>·</span>
                    Click a stitch
                  </>
                )}
              </span>
            </div>
            <StitchLegend types={visibleStitchTypes} />
            <div className="playback-bar">
              <button
                className={`play-button ${playing ? "playing" : ""}`}
                aria-label={
                  playing ? "Pause round playback" : "Play round playback"
                }
                disabled={!roundCount}
                onClick={() => {
                  if (!playing && currentRound >= roundCount)
                    setVisibleRounds(1);
                  setPlaying(!playing);
                }}
              >
                {playing ? (
                  <Pause size={14} fill="currentColor" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
              </button>
              <div className="playback-label">
                <span>BUILD IT ROUND BY ROUND</span>
                <strong>
                  {roundCount ? (
                    <>
                      Round {currentRound} <span>/ {roundCount}</span>
                    </>
                  ) : (
                    "No rounds yet"
                  )}
                </strong>
              </div>
              <button
                className="icon-button round-step"
                aria-label="Previous round"
                disabled={currentRound <= 1}
                onClick={() => {
                  setPlaying(false);
                  setVisibleRounds(currentRound - 1);
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <input
                className="round-slider"
                aria-label="Visible rounds"
                type="range"
                min="1"
                max={roundCount || 1}
                value={currentRound}
                style={
                  {
                    "--progress": `${((currentRound - 1) / Math.max(1, roundCount - 1)) * 100}%`,
                  } as React.CSSProperties
                }
                onChange={(event) => {
                  setPlaying(false);
                  setVisibleRounds(Number(event.target.value));
                  setSelectedStitch(null);
                }}
              />
              <button
                className="icon-button round-step"
                aria-label="Next round"
                disabled={currentRound >= roundCount}
                onClick={() => {
                  setPlaying(false);
                  setVisibleRounds(currentRound + 1);
                }}
              >
                <ChevronRight size={15} />
              </button>
              <button
                className="show-all"
                disabled={!roundCount}
                onClick={() => {
                  setPlaying(false);
                  setVisibleRounds(roundCount);
                }}
              >
                Show all <ArrowRight size={12} />
              </button>
            </div>
            <div className="display-bar">
              <div className="yarn-colors">
                <span className="display-label">YOUR YARN</span>
                {colors.slice(0, 4).map((color) => (
                  <span
                    className="yarn-color"
                    key={color.color}
                    title={`${color.name}: ${color.count} stitches`}
                  >
                    <span style={{ background: color.color }} />
                    {color.name}
                    <small>{color.count}</small>
                  </span>
                ))}
                {colors.length > 4 && <small>+{colors.length - 4}</small>}
              </div>
              <label className="thickness-control">
                <span>Stitch size</span>
                <input
                  type="range"
                  aria-label="Stitch size"
                  min="0.6"
                  max="1.65"
                  step="0.05"
                  value={thickness}
                  onChange={(event) => setThickness(Number(event.target.value))}
                />
                <span>{Math.round(thickness * 100)}%</span>
              </label>
            </div>
          </section>
        </div>
        <div className="workspace-footnote">
          <span>
            <Sparkles size={13} /> Made for the ideas you haven’t crocheted yet.
          </span>
          <button onClick={() => setHelp("model")}>
            <span className="tiny-info">i</span> How this preview works
          </button>
        </div>
      </main>
      <footer className="status-bar">
        <span>
          <span className="status-dot" />
          All the making happens in your browser.
        </span>
        <span>
          US crochet terms
          <span className="status-separator" />
          {source.split("\n").length} lines
          <span className="status-separator" />
          Loopform v0.1
        </span>
      </footer>

      <input
        ref={fileInput}
        type="file"
        accept=".crochet,.txt,.json"
        className="visually-hidden"
        aria-label="Open pattern file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 500_000) {
            setToast(
              "This file is too large. Open a pattern or project under 500 KB.",
            );
            event.target.value = "";
            return;
          }
          try {
            const text = await file.text();
            if (file.name.endsWith(".json")) {
              const project = JSON.parse(text);
              if (project.version !== 1 || typeof project.source !== "string")
                throw new Error(
                  "Use a version 1 Loopform project or a plain pattern file.",
                );
              loadSource(project.source);
              if (
                !parsePattern(project.source).diagnostics.some(
                  (d) => d.severity === "error",
                )
              )
                applyRowOffsets(sanitizeRowOffsets(project.rowOffsets));
              if (typeof project.thickness === "number")
                setThickness(Math.min(1.65, Math.max(0.6, project.thickness)));
            } else loadSource(text);
            setToast(`Opened ${file.name}.`);
          } catch (error) {
            setToast(
              error instanceof Error
                ? error.message
                : "This file could not be opened.",
            );
          }
          event.target.value = "";
        }}
      />

      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {help && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHelp(null);
          }}
        >
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="modal-close icon-button"
              autoFocus
              aria-label="Close guide"
              onClick={() => setHelp(null)}
            >
              <X size={19} />
            </button>
            <div className="modal-icon">
              {help === "syntax" ? <Braces size={25} /> : <Box size={25} />}
            </div>
            <span className="eyebrow">A SMALL GUIDE TO MAKING</span>
            <h2 id="help-title">
              {help === "syntax"
                ? "Your stitches, in a few words."
                : "From stitches to shapes."}
            </h2>
            {help === "syntax" ? (
              <>
                <p>
                  Write one round per line using US crochet terms. Counts in
                  parentheses are checked against your instructions.
                </p>
                <pre>
                  <span># My first little shape</span>
                  {
                    "\n[sage]\n1: 6 sc in mc (6)\n2: 6 inc (12)\n3: [1 sc, 1 inc] rep 6 times (18)"
                  }
                </pre>
                <div className="syntax-grid">
                  {[
                    ["sc", "Single crochet"],
                    ["hdc", "Half double crochet"],
                    ["dc / tr", "Double / treble crochet"],
                    ["inc", "2 sc into one stitch"],
                    ["dec", "Join 2 stitches into one"],
                    ["in mc", "Magic-ring foundation"],
                  ].map(([code, name]) => (
                    <div key={code}>
                      <code>{code}</code>
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
                <p className="guide-note">
                  Use <code>[beige]</code> or <code>[#a9c6b5]</code> to change
                  yarn color. Repeats can be nested. Start comments with{" "}
                  <code>//</code> or <code>#</code>.
                </p>
                <div className="guide-shortcut">
                  <kbd>⌘ / Ctrl</kbd>
                  <kbd>Enter</kbd>
                  <span>Render your pattern at any time</span>
                </div>
              </>
            ) : (
              <>
                <p>
                  Every instruction becomes a stitch with an exact connection to
                  the stitches below it. Increases share a parent; decreases
                  join two parents.
                </p>
                <div className="model-explainer">
                  <span>Pattern</span>
                  <ArrowRight size={16} />
                  <span>Connections</span>
                  <ArrowRight size={16} />
                  <span>3D shape</span>
                </div>
                <p>
                  The preview arranges stitches around a circular profile using
                  round counts, attachment locations and stitch heights. Half
                  double and taller stitches create more height than single
                  crochet. Round bubbles mark single crochet; elongated beads
                  mark half double, double and treble crochet in increasing
                  lengths. The shape key identifies the stitches in view while
                  yarn colors follow your pattern.
                </p>
                <p className="guide-note">
                  This first version is an approximate preview for patterns
                  worked in continuous rounds. It isn’t a calibrated yarn or
                  stuffing simulation. Flat rows, turns, BLO/FLO, sewing and
                  special decrease types are not supported yet. Changing “Stitch
                  size” changes the display, not your pattern or gauge.
                </p>
              </>
            )}
            <button className="button modal-done" onClick={() => setHelp(null)}>
              Let’s make something <ArrowRight size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
