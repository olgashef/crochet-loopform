import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { ParsedPattern, Stitch } from '../lib/pattern';
import type { SafetyEyePair } from '../lib/safetyEyes';
import { safetyEyeCode, saveSafetyEyeTemplate } from '../lib/safetyEyeTemplate';
import { DEFAULT_STITCH_WIDTH_MM, PREVIEW_STITCH_WIDTH } from '../lib/stitchScale';
import './SafetyEyesDialog.css';

interface Props {
  source:string;
  pattern:ParsedPattern;
  pieceName:string;
  selected?:Stitch;
  pair?:SafetyEyePair;
  onSave(source:string,pairIndex:number):void;
  onClose():void;
}
export function SafetyEyesDialog({source,pattern,pieceName,selected,pair,onSave,onClose}:Props){
  const dialog=useRef<HTMLDialogElement>(null);
  const rounds=pattern.rounds.filter(round=>round.outputCount>=2&&pattern.rounds.some(next=>next.number===round.number+1));
  const selectedRound=selected&&!selected.branch?rounds.find(r=>r.number===selected.round):undefined;
  const initialRound=rounds.find(r=>r.number===pair?.lowerRound)??selectedRound??rounds.find(r=>r.number===5)??rounds[0];
  const defaultPositions=(count:number):[number,number]=>[Math.max(1,Math.floor(count*.4)),Math.min(count,Math.max(2,Math.floor(count*.4)+Math.min(4,count-1)))];
  const initialPositions=pair?.stitches??(selectedRound&&selected?[selected.index+1,(selected.index+Math.min(4,selectedRound.outputCount-1))%selectedRound.outputCount+1]:defaultPositions(initialRound?.outputCount??6));
  const [lower,setLower]=useState(String(pair?.lowerRound??initialRound?.number??1));
  const [first,setFirst]=useState(String(initialPositions[0])),[second,setSecond]=useState(String(initialPositions[1]));
  const [size,setSize]=useState(String(pair?.sizeMm??(pair?Number((pair.size*DEFAULT_STITCH_WIDTH_MM/PREVIEW_STITCH_WIDTH).toFixed(4)):8)));
  const [stitchWidth,setStitchWidth]=useState(String(pair?.stitchWidthMm??DEFAULT_STITCH_WIDTH_MM));
  const [error,setError]=useState('');
  const editing=useRef(pair?{line:pair.line,text:source.split(/\r?\n/)[pair.line-1]}:undefined);
  const count=pattern.rounds.find(r=>r.number===Number(lower))?.outputCount??0;
  const blocked=!rounds.length?'Add at least two completed rounds before placing eyes.':pattern.diagnostics.some(d=>d.severity==='error')?'Fix the pattern errors before adding safety eyes.':!pair&&pattern.eyes.length>=16?'This piece already has 16 eye pairs. Edit or remove a pair to add another.':'';
  const draft={lowerRound:Number(lower),stitches:[Number(first),Number(second)] as [number,number],sizeMm:Number(size),stitchWidthMm:Number(stitchWidth)};
  useEffect(()=>{const element=dialog.current!;element.showModal();element.querySelector('select')?.focus({preventScroll:true});return()=>element.close();},[]);
  function save(event:FormEvent){
    event.preventDefault();setError('');
    try{onSave(saveSafetyEyeTemplate(source,draft,editing.current),pair?pattern.eyes.findIndex(p=>p.line===pair.line):pattern.eyes.length);}
    catch(cause){setError(cause instanceof Error?cause.message:'Check the eye placement.');}
  }
  return <dialog ref={dialog} className="modal safety-eyes-dialog" aria-labelledby="safety-eyes-title" onCancel={event=>{event.preventDefault();onClose();}}>
    <button className="modal-close icon" aria-label="Close safety eyes" onClick={onClose}><X size={18}/></button>
    <span className="eyebrow">ACCESSORIES · {pieceName}</span>
    <h2 id="safety-eyes-title">{pair?'Edit safety eyes':'Add safety eyes'}</h2>
    <p>Choose the round gap and the stitch gap for each eye. Both eyes use the same diameter.</p>
    <form onSubmit={save}>
      <div className="safety-dialog-fields">
        <label className="safety-round-field">Between rounds<select autoFocus aria-label="Safety eyes between rounds" value={lower} onChange={event=>{setLower(event.target.value);const positions=defaultPositions(pattern.rounds.find(r=>r.number===Number(event.target.value))?.outputCount??6);setFirst(String(positions[0]));setSecond(String(positions[1]));setError('');}}>
          {rounds.map(round=><option key={round.number} value={round.number}>{round.number} and {round.number+1} · {round.outputCount} stitch gaps</option>)}
        </select></label>
        <label>First eye after stitch<input aria-label="First eye after stitch" type="number" required min="1" max={count} step="1" value={first} onChange={e=>setFirst(e.target.value)}/></label>
        <label>Second eye after stitch<input aria-label="Second eye after stitch" type="number" required min="1" max={count} step="1" value={second} onChange={e=>setSecond(e.target.value)}/></label>
        <label className="safety-round-field">Eye diameter (mm)<input aria-label="Eye diameter in mm" type="number" required min="1" max="40" step="any" value={size} onChange={e=>setSize(e.target.value)}/></label>
      </div>
      <p className="safety-position-hint">Positions count from 1 around the round. Each eye sits in the gap immediately after its chosen stitch.</p>
      {selectedRound&&selected&&<button type="button" className="safety-use-selected" onClick={()=>{setLower(String(selected.round));setFirst(String(selected.index+1));setSecond(String((selected.index+Math.min(4,selectedRound.outputCount-1))%selectedRound.outputCount+1));setError('');}}>Use selected stitch · Round {selected.round}, stitch {selected.index+1}</button>}
      <details className="safety-scale"><summary>Preview scale · {stitchWidth || '…'} mm per stitch</summary><p>Set your approximate stitch width so the eye diameter looks right for your yarn. The default is 5 mm per stitch.</p><label>Stitch width (mm)<input aria-label="Stitch width in mm" type="number" required min="1" max="20" step="any" value={stitchWidth} onChange={e=>setStitchWidth(e.target.value)}/></label></details>
      <div className="safety-code-preview"><span>Pattern instruction</span><code>{safetyEyeCode(draft)}</code></div>
      {(error||blocked)&&<p className="safety-dialog-error" role="alert">{error||blocked}</p>}
      <div className="safety-dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={!!blocked}>{pair?'Update eyes':'Add eyes to pattern'}</button></div>
    </form>
  </dialog>;
}
