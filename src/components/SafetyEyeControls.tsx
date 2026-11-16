import type { ParsedPattern } from "../lib/pattern";
import type { SafetyEyePair } from "../lib/safetyEyes";
import "./SafetyEyeControls.css";

interface Props {
  source: string;
  pattern: ParsedPattern;
  onChange: (source: string) => void;
  onAdd: () => void;
  onEdit: (pair: SafetyEyePair) => void;
}

export function SafetyEyeControls({ source, pattern, onChange, onAdd, onEdit }: Props) {
  return <details className="safety-eye-controls">
    <summary>Safety eyes <span>{pattern.eyes.length} {pattern.eyes.length === 1 ? "pair" : "pairs"}</span></summary>
    <p>Place a pair between rounds and choose its diameter in millimeters.</p>
    {pattern.eyes.map(pair => <div className="eye-pair" key={pair.line}>
      <span>Rounds {pair.lowerRound}–{pair.upperRound} · after stitches {pair.stitches.join(" & ")} · {pair.sizeMm !== undefined ? `${pair.sizeMm} mm` : `${pair.size} relative size`}</span>
      <button aria-label={`Edit eyes on line ${pair.line}`} onClick={() => onEdit(pair)}>Edit</button>
      <button aria-label={`Remove eyes on line ${pair.line}`} onClick={() => onChange(source.split(/\r?\n/).filter((_, i) => i !== pair.line - 1).join("\n"))}>Remove</button>
    </div>)}
    <div className="eye-actions"><button onClick={onAdd}>Add safety eyes</button></div>
  </details>;
}
