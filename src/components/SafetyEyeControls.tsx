import { useState } from "react";
import type { ParsedPattern, Stitch } from "../lib/pattern";
import { parseEyeDirective, validateEyePair, type SafetyEyePair } from "../lib/safetyEyes";
import "./SafetyEyeControls.css";

interface Props {
  source: string;
  pattern: ParsedPattern;
  selected: Stitch | null | undefined;
  onChange: (source: string) => void;
}

export function SafetyEyeControls({ source, pattern, selected, onChange }: Props) {
  const [lower, setLower] = useState("5");
  const [first, setFirst] = useState("10");
  const [second, setSecond] = useState("14");
  const [size, setSize] = useState("0.8");
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editingSource, setEditingSource] = useState("");
  const [message, setMessage] = useState("");
  function edit(pair: SafetyEyePair) {
    setLower(String(pair.lowerRound));
    setFirst(String(pair.stitches[0]));
    setSecond(String(pair.stitches[1]));
    setSize(String(pair.size));
    setEditingLine(pair.line);
    setEditingSource(source.split(/\r?\n/)[pair.line - 1]);
    setMessage("");
  }
  function save() {
    try {
      if (editingLine === null && pattern.eyes.length >= 16)
        throw new Error("Use at most 16 safety-eye pairs in a pattern.");
      const directive = `eyes between ${lower} and ${Number(lower) + 1} at ${first}, ${second} size ${size}`;
      const pair = parseEyeDirective(directive, 1);
      if (!pair) throw new Error("Enter the round and two stitch numbers.");
      const error = validateEyePair(pair, pattern.rounds);
      if (error) throw new Error(error);
      const lines = source.split(/\r?\n/);
      if (editingLine !== null) {
        if (lines[editingLine - 1] !== editingSource)
          throw new Error("The pattern changed. Select the eye pair to edit again.");
        lines[editingLine - 1] = directive;
      } else lines.push(directive);
      const next = lines.join("\n");
      if (next.length > 120000) throw new Error("Keep the pattern under 120,000 characters.");
      onChange(next);
      setEditingLine(null);
      setMessage("Eye placement saved in the pattern. Render if auto-render is off.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check the eye placement.");
    }
  }
  return (
    <details className="safety-eye-controls">
      <summary>Safety eyes <span>{pattern.eyes.length} {pattern.eyes.length === 1 ? "pair" : "pairs"}</span></summary>
      <p>Place eyes in the gaps after two stitches, between adjacent rounds. Gaps after stitches 10 and 14 leave four stitches between the eyes. Size is relative to stitch spacing.</p>
      {pattern.eyes.map((pair) => (
        <div className="eye-pair" key={pair.line}>
          <span>Rounds {pair.lowerRound}–{pair.upperRound} · after stitches {pair.stitches.join(" & ")}</span>
          <button onClick={() => edit(pair)}>Edit</button>
          <button aria-label={`Remove eyes on line ${pair.line}`} onClick={() => {
            onChange(source.split(/\r?\n/).filter((_, i) => i !== pair.line - 1).join("\n"));
            setEditingLine(null);
            setMessage("");
          }}>Remove</button>
        </div>
      ))}
      <div className="eye-fields">
        <label>Between round<input aria-label="Eyes lower round" type="number" min="1" max="149" value={lower} onChange={(e) => setLower(e.target.value)} /></label>
        <span>and {Number(lower) + 1 || "…"}</span>
        <label>After stitch<input aria-label="First eye after stitch" type="number" min="1" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
        <label>After stitch<input aria-label="Second eye after stitch" type="number" min="1" value={second} onChange={(e) => setSecond(e.target.value)} /></label>
        <label>Eye size<input aria-label="Safety eye size" type="number" min="0.15" max="2" step="0.05" value={size} onChange={(e) => setSize(e.target.value)} /></label>
      </div>
      <div className="eye-actions">
        {selected && !selected.branch && <button onClick={() => {
          setLower(String(selected.round));
          setFirst(String(selected.index + 1));
          const count = pattern.rounds.find((r) => r.number === selected.round)?.outputCount ?? 1;
          setSecond(String((selected.index + 4) % count + 1));
          setMessage("");
        }}>Use selected stitch</button>}
        <button onClick={save}>{editingLine === null ? "Add eye pair" : "Update eye pair"}</button>
        {editingLine !== null && <button onClick={() => setEditingLine(null)}>Cancel edit</button>}
      </div>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
