import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Link2, Plus, Unlink } from 'lucide-react';
import type { Piece } from '../lib/studio';
import type { PiecePlacement } from '../lib/assembly';
import type { Position } from '../lib/geometry';
import type { AssemblyTool } from './AssemblyViewer';

function NumberField({label,value,step=.1,min=-10000,max=10000,onCommit}:{label:string;value:number;step?:number;min?:number;max?:number;onCommit(value:number):void}) {
  const [draft,setDraft]=useState(String(Math.round(value*100)/100));
  useEffect(()=>setDraft(String(Math.round(value*100)/100)),[value]);
  function commit() {const n=Number(draft);if(draft.trim()&&Number.isFinite(n)){const next=Math.max(min,Math.min(max,n));if(Math.abs(next-value)>.00001)onCommit(next);setDraft(String(Math.round(next*100)/100));}else setDraft(String(Math.round(value*100)/100));}
  return <input aria-label={label} type="number" step={step} min={min} max={max} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={e=>{if(e.currentTarget.dataset.cancel){delete e.currentTarget.dataset.cancel;return;}commit();}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.dataset.cancel='true';setDraft(String(Math.round(value*100)/100));e.currentTarget.blur();}}}/>;
}
interface Props {
  pieces:Piece[]; active:Piece; placement:PiecePlacement; tool:AssemblyTool; anchorMissing:boolean;
  onSelect(id:string):void; onChange(value:PiecePlacement):void; onAttach():void; onDetach():void;
  onAddEar():void; onDuplicate():void; onVisibility():void;
}
export function AssemblyControls({pieces,active,placement,tool,anchorMissing,onSelect,onChange,onAttach,onDetach,onAddEar,onDuplicate,onVisibility}:Props) {
  const main=pieces[0],isMain=active.id===main.id,attached=!!placement.parentId;
  function coordinate(property:'position'|'rotation',axis:number,value:number){const next=[...placement[property]] as Position;next[axis]=value;onChange({...placement,[property]:next});}
  return <div className="assembly-controls">
    <div className="assembly-heading"><label>PIECE<select aria-label="Assembly piece" value={active.id} onChange={e=>onSelect(e.target.value)}>{pieces.map((p,i)=><option key={p.id} value={p.id}>{p.name}{i===0?' · Main':''}{p.hidden?' · Hidden':''}</option>)}</select></label><button title={active.hidden?'Show selected piece':'Hide selected piece'} onClick={onVisibility}>{active.hidden?<EyeOff size={15}/>:<Eye size={15}/>}</button><button disabled={pieces.length>=30} onClick={onAddEar}><Plus size={14}/>Add ear</button><button title="Duplicate selected piece" disabled={pieces.length>=30} onClick={onDuplicate}><Copy size={14}/></button></div>
    <div className={`attachment-status ${anchorMissing?'warning':''}`}><span className="dot"/>{isMain?'Main piece · attached pieces move with it':attached?(anchorMissing?'Attachment stitch changed. Choose a new placement.':`Attached to ${main.name}${placement.anchor?` · Round ${placement.anchor.round}, stitch ${placement.anchor.index+1}`:''}`):'Separate piece · choose where it joins the main piece'}</div>
    {!isMain&&<div className="attachment-actions"><button className={`attach-button ${tool==='place'?'active':''}`} onClick={onAttach}><Link2 size={14}/>{tool==='place'?'Cancel placement':attached?'Choose new placement':'Place on main piece'}</button>{attached&&<button onClick={onDetach}><Unlink size={13}/>Detach</button>}<label>Joining edge<select aria-label="Joining edge" value={placement.edge} onChange={e=>onChange({...placement,edge:e.target.value as PiecePlacement['edge']})}><option value="last">Last round</option><option value="first">First round</option></select></label></div>}
    <div className="transform-fields">
      <div className="transform-row"><span>{attached?'Offset':'Position'}</span>{['X','Y','Z'].map((axis,i)=><label key={axis}><span className={`axis-${axis.toLowerCase()}`}>{axis}</span><NumberField label={`Piece position ${axis}`} value={placement.position[i]} onCommit={value=>coordinate('position',i,value)}/></label>)}</div>
      <div className="transform-row"><span>Rotation °</span>{['X','Y','Z'].map((axis,i)=><label key={axis}><span className={`axis-${axis.toLowerCase()}`}>{axis}</span><NumberField label={`Piece rotation ${axis}`} value={placement.rotation[i]} step={5} min={-36000} max={36000} onCommit={value=>coordinate('rotation',i,value)}/></label>)}</div>
      <div className="assembly-scale"><label>Size <NumberField label="Piece scale" value={placement.scale} min={(isMain||attached) ? .1 : .01} max={(isMain||attached) ? 5 : 25} onCommit={scale=>onChange({...placement,scale})}/><span>×</span></label><span>{attached?'Offsets are relative to the attachment stitch.':'Drag the handles or enter precise values.'}</span></div>
    </div>
  </div>;
}
