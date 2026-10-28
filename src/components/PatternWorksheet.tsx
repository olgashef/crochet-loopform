import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Palette } from "lucide-react";
import {
  analyzeInstruction,
  readRoundLine,
  YARN_COLORS,
  type Diagnostic,
} from "../lib/pattern";
import {
  deleteWorksheetRow,
  editWorksheetRow,
  insertWorksheetRow,
  pasteWorksheetRows,
  worksheetInstruction,
} from "../lib/worksheet";
import "./PatternWorksheet.css";
interface Props {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  selectedLine: number | null;
  onRender: () => void;
  onEditingChange: (line: number | null) => void;
}
export function PatternWorksheet({
  value,
  onChange: writeSource,
  diagnostics,
  selectedLine,
  onRender,
  onEditingChange,
}: Props) {
  const [feedback, setFeedback] = useState("");
  function onChange(next: string) {
    if (next.length > 120000) {
      setFeedback("Keep your pattern under 120,000 characters.");
      return;
    }
    setFeedback("");
    writeSource(next);
  }
  const lines = useMemo(() => value.split(/\r?\n/), [value]);
  const fields = useRef(new Map<number, HTMLTextAreaElement>());
  const pendingFocus = useRef<number | null>(null);
  const lastActive = useRef<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const rows = lines.flatMap((text, index) => {
    const header = readRoundLine(text);
    return header
      ? [{ ...header, line: index + 1, body: worksheetInstruction(text) }]
      : [];
  });
  const titleIndex = lines.findIndex((l) => /^#/.test(l));
  const last = rows.at(-1);
  let next = 1;
  if (last) {
    try {
      next = last.start + (analyzeInstruction(last.body).repeatRounds ?? 1);
    } catch {
      next = (last.end ?? last.start) + 1;
    }
  }
  useLayoutEffect(() => {
    fields.current.forEach((field) => {
      field.style.height = "0px";
      field.style.height = Math.max(27, field.scrollHeight) + "px";
    });
    if (pendingFocus.current !== null) {
      const field = fields.current.get(pendingFocus.current);
      if (field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
        pendingFocus.current = null;
      }
    }
  }, [value]);
  useEffect(() => {
    if (selectedLine !== null) {
      fields.current
        .get(selectedLine)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedLine]);
  function add(after = last?.line ?? lines.length) {
    pendingFocus.current = after + 1;
    onChange(insertWorksheetRow(value, after));
  }
  function changeLine(line: number, text: string) {
    const copy = [...lines];
    copy[line - 1] = text;
    onChange(copy.join("\n"));
  }
  const roundLabels = new Map(rows.map((row) => [row.line, row]));
  return (
    <div className="pattern-worksheet">
      <div className="worksheet-title">
        <span>PATTERN NAME</span>
        <input
          aria-label="Pattern name"
          value={titleIndex >= 0 ? lines[titleIndex].replace(/^#+\s*/, "") : ""}
          placeholder="Untitled pattern"
          onChange={(e) => {
            if (titleIndex >= 0)
              changeLine(titleIndex + 1, "# " + e.target.value);
            else onChange("# " + e.target.value + "\n" + value);
          }}
        />
      </div>
      <div className="worksheet-columns" aria-hidden="true">
        <span>ROUND</span>
        <span>INSTRUCTIONS</span>
        <span>TOTAL</span>
        <span />
      </div>
      <div className="worksheet-rows">
        {lines.map((text, index) => {
          const line = index + 1;
          const row = roundLabels.get(line);
          if (row) {
            let count: number | null = null;
            let hold = 1;
            let message = "";
            try {
              const summary = analyzeInstruction(row.body);
              count = summary.outputCount;
              hold = summary.repeatRounds ?? 1;
            } catch (error) {
              message =
                error instanceof Error
                  ? error.message
                  : "Finish this instruction.";
            }
            const diagnostic = diagnostics.find(
              (d) => d.line === line && d.severity === "error",
            );
            const showError = !!diagnostic && active !== line;
            return (
              <div
                className={`worksheet-row ${active === line ? "editing" : ""} ${selectedLine === line ? "selected" : ""} ${showError ? "invalid" : ""}`}
                key={line}
              >
                <span className="worksheet-round">
                  Rnd {row.start}
                  {hold > 1
                    ? "–" + (row.start + hold - 1)
                    : row.end !== null
                      ? "–" + row.end
                      : ""}
                </span>
                <div className="worksheet-instruction">
                  <textarea
                    ref={(node) => {
                      if (node) fields.current.set(line, node);
                      else fields.current.delete(line);
                    }}
                    aria-label={`Instructions for round ${row.start}`}
                    aria-invalid={showError}
                    value={row.body}
                    rows={1}
                    placeholder={
                      row.start === 1 ? "7 sc in mr" : "[sc, inc] × 7"
                    }
                    spellCheck={false}
                    onFocus={() => {
                      setActive(line);
                      onEditingChange(line);
                      lastActive.current = line;
                    }}
                    onBlur={() => {
                      setActive(null);
                      onEditingChange(null);
                    }}
                    onChange={(e) =>
                      onChange(editWorksheetRow(value, line, e.target.value))
                    }
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        onRender();
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const nextRow = rows.find((r) => r.line > line);
                        if (nextRow && !e.shiftKey)
                          fields.current.get(nextRow.line)?.focus();
                        else add(line);
                      }
                      if (
                        e.key === "Backspace" &&
                        !row.body &&
                        rows.length > 1
                      ) {
                        e.preventDefault();
                        pendingFocus.current =
                          rows.filter((r) => r.line < line).at(-1)?.line ??
                          line;
                        onChange(deleteWorksheetRow(value, line));
                      }
                      if (e.key === "Escape") e.currentTarget.blur();
                    }}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (text.includes("\n") || text.includes("\t")) {
                        e.preventDefault();
                        try {
                          onChange(pasteWorksheetRows(value, line, text));
                        } catch (error) {
                          setFeedback(
                            error instanceof Error
                              ? error.message
                              : "Could not paste these rows.",
                          );
                        }
                      }
                    }}
                  />
                  {showError && (
                    <span className="worksheet-row-error">
                      {diagnostic.message}
                    </span>
                  )}
                </div>
                <output
                  className={`worksheet-count ${count === null ? "pending" : ""}`}
                  aria-label={`Stitch count for round ${row.start}`}
                  title={
                    count !== null
                      ? `${count} stitches${hold > 1 ? " in each round" : ""}`
                      : message
                  }
                  aria-live="polite"
                >
                  {count !== null ? `(${count})` : "—"}
                  {hold > 1 && <small>each</small>}
                </output>
                <div className="worksheet-row-tools">
                  <button
                    tabIndex={-1}
                    title="Insert a round below"
                    aria-label={`Insert after round ${row.start}`}
                    disabled={next > 150}
                    onClick={() => add(line)}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    tabIndex={-1}
                    title="Delete round"
                    aria-label={`Delete round ${row.start}`}
                    onClick={() => onChange(deleteWorksheetRow(value, line))}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          }
          if (index === titleIndex || !text.trim()) return null;
          const color = /^\[([^\[\]]+)\]\s*$/.exec(text.trim());
          if (color) {
            const name = color[1].trim();
            const raw = Object.hasOwn(YARN_COLORS, name.toLowerCase())
              ? YARN_COLORS[name.toLowerCase()]
              : /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(name)
                ? name
                : "#c63e36";
            const hex =
              raw.length === 4
                ? "#" + [...raw.slice(1)].map((c) => c + c).join("")
                : raw;
            return (
              <div className="worksheet-yarn" key={line}>
                <label title="Change yarn color">
                  <input
                    type="color"
                    aria-label={`Yarn color on line ${line}`}
                    value={hex}
                    onChange={(e) => changeLine(line, `[${e.target.value}]`)}
                  />
                  <span style={{ background: hex }} />
                </label>
                <Palette size={11} />
                <span>{name.startsWith("#") ? "Custom yarn" : name} yarn</span>
              </div>
            );
          }
          return (
            <div
              className={`worksheet-note ${diagnostics.some((d) => d.line === line && d.severity === "error") ? "invalid" : ""}`}
              key={line}
            >
              {text.replace(/^\s*(?:#+|\/\/)\s*/, "")}
            </div>
          );
        })}
        <div className="worksheet-add">
          <button disabled={next > 150} onClick={() => add()}>
            <Plus size={13} />
            {rows.length ? "Add round" : "Write your first round"}
          </button>
          <span>Enter → next round</span>
        </div>
      </div>
      <div className="worksheet-footer">
        {feedback && (
          <span role="alert" className="worksheet-paste-error">
            {feedback}
          </span>
        )}
        <span>Counts are calculated for you.</span>
        <small>
          <strong>Tip</strong> Write <code>49 sc for 8 rounds</code> to group
          rounds.
        </small>
        <small>
          Change color within a round: <code>[red] 4 sc, [beige] 4 sc</code>.
        </small>
        <button
          onClick={() => {
            const after = lastActive.current
              ? lastActive.current - 1
              : lines.length;
            const copy = [...lines];
            copy.splice(after, 0, "[sage]");
            onChange(copy.join("\n"));
          }}
        >
          <Palette size={11} />
          Add yarn change
        </button>
      </div>
    </div>
  );
}
