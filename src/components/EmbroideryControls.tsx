import { Check, Plus, Scissors } from 'lucide-react';
import { THREADS, type ThreadWeight } from '../lib/embroidery';

export function EmbroideryControls({weight, color, hasAnchor, count, onWeight, onColor, onNewLine, onFinish}: {
  weight: ThreadWeight; color: string; hasAnchor: boolean; count: number;
  onWeight(weight: ThreadWeight): void; onColor(color: string): void;
  onNewLine(): void; onFinish(): void;
}) {
  return <div className="embroidery-controls" aria-label="Embroidery tools">
    <div className="embroidery-heading"><strong><Scissors size={14}/>Embroidery</strong><span>{count} {count === 1 ? 'line' : 'lines'}</span><button className="primary" onClick={onFinish}><Check size={14}/>Done <kbd>Enter</kbd></button></div>
    <div className="embroidery-options"><label>Thread width<select aria-label="Embroidery thread width" value={weight} onChange={e=>onWeight(e.target.value as ThreadWeight)}>{Object.entries(THREADS).map(([key, thread])=><option key={key} value={key}>{thread.label}</option>)}</select></label><label>Color<input type="color" aria-label="Embroidery thread color" value={color} onChange={e=>onColor(e.target.value)}/></label><button onClick={onNewLine} disabled={!hasAnchor}><Plus size={14}/>New line</button></div>
    <p role="status">{hasAnchor ? 'Click another point to sew a line. Continue clicking to connect more points.' : 'Click a point on the piece to start an eye, nose, or other detail.'}</p>
    <small>Right-drag to rotate · Enter to finish · New line starts a separate detail</small>
  </div>;
}
