import { useState } from 'react';
import { Paintbrush, RotateCcw } from 'lucide-react';
import type { ParsedPattern, Stitch } from '../lib/pattern';

interface Props {
  pattern: ParsedPattern;
  selected?: Stitch;
  onRestore(ids?: number[]): void;
}

export function PaintedColorsNotice({ pattern, selected, onRestore }: Props) {
  const [scope, setScope] = useState('all');
  const painted = pattern.stitches.filter(stitch => stitch.paintSourceLine !== undefined);
  if (!painted.length) return null;
  const rounds = [...new Set(painted.map(stitch => stitch.round))];
  const activeScope = scope === 'all' || rounds.includes(Number(scope)) ? scope : 'all';
  return <aside className="painted-colors-notice" aria-label="Painted color overrides">
    <strong><Paintbrush size={13}/>Painted colors active · {painted.length} stitches</strong>
    <p>Brush colors override the written yarn colors in this piece.</p>
    {selected?.patternColor && <div className="painted-color-comparison">
      <span>Round {selected.round}, stitch {selected.index + 1}</span>
      <span><i style={{ background: selected.patternColor }}/>Pattern {selected.patternColor.toUpperCase()}</span>
      <span><i style={{ background: selected.color }}/>Painted {selected.color.toUpperCase()}</span>
    </div>}
    <details>
      <summary>Manage painted colors</summary>
      <p>Restore removes brush edits and uses the colors written in your rounds. Undo brings the brush edits back.</p>
      <div className="paint-restore-controls">
        <label>Restore in<select aria-label="Restore pattern colors in" value={activeScope} onChange={event => setScope(event.target.value)}>
          <option value="all">Whole piece</option>
          {rounds.map(round => <option key={round} value={round}>Round {round}</option>)}
        </select></label>
        <button disabled={pattern.diagnostics.some(d => d.severity === 'error')} onClick={() => onRestore(activeScope === 'all' ? undefined : painted.filter(s => s.round === Number(activeScope)).map(s => s.id))}><RotateCcw size={12}/>Restore pattern colors</button>
      </div>
    </details>
  </aside>;
}
