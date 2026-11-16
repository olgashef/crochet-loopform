import { useEffect, useState } from 'react';
import { Check, Paintbrush, Pipette, Plus } from 'lucide-react';
import { normalizeYarnColor } from '../lib/colorwork';
export type ColorTool = 'brush' | 'select' | 'sample';
interface Props {
  color:string; palette:string[]; usedColors:string[]; painting:boolean; tool:ColorTool; selectionLabel:string; selectionCount:number; canPaint:boolean;
  onColor(color:string):void; onTool(tool:ColorTool):void; onApply():void; onMatch():void;
}
export function YarnPalette({color,palette,usedColors,painting,tool,selectionLabel,selectionCount,canPaint,onColor,onTool,onApply,onMatch}:Props){
  const [hex,setHex]=useState(color.toUpperCase()),[invalid,setInvalid]=useState(false);
  useEffect(()=>{setHex(color.toUpperCase());setInvalid(false);},[color]);
  function commitHex(){const value=normalizeYarnColor(hex);setInvalid(!value);if(value){onColor(value);setHex(value.toUpperCase());}}
  return <div className="yarn-panel">
    <div className="yarn-title"><span><span className="dot mauve"/>YARN PALETTE</span><span>{usedColors.length} colors in your piece</span></div>
    {painting&&<div className="paint-tools" aria-label="Color tools"><button aria-pressed={tool==='brush'} disabled={!canPaint} onClick={()=>onTool('brush')}><Paintbrush size={13}/>Brush</button><button aria-pressed={tool==='select'} onClick={()=>onTool('select')}>Select</button><button aria-pressed={tool==='sample'} onClick={()=>onTool('sample')} title="Copy a stitch’s stored yarn color, unaffected by shadows"><Pipette size={13}/>Eyedropper</button></div>}
    <div className="palette-row">{palette.map(c=><button key={c} className={`swatch ${c.toLowerCase()===color.toLowerCase()?'active':''}`} style={{background:c}} aria-label={`Use yarn ${c}`} aria-pressed={c.toLowerCase()===color.toLowerCase()} title={c.toUpperCase()} onClick={()=>onColor(c)}>{c.toLowerCase()===color.toLowerCase()&&<Check size={15}/>}</button>)}<label className="custom-color" title="Choose custom yarn color"><Plus size={16}/><input aria-label="Custom yarn color" type="color" value={color} onChange={e=>onColor(e.target.value)}/></label></div>
    <div className="exact-yarn"><span className="yarn-preview" style={{background:color}}/><label>Active yarn<input aria-label="Yarn hex color" aria-invalid={invalid} value={hex} maxLength={7} spellCheck={false} onChange={e=>{const value=e.target.value;setHex(value);setInvalid(false);if(/^#?[\da-f]{6}$/i.test(value))onColor(normalizeYarnColor(value)!);}} onBlur={commitHex} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setHex(color.toUpperCase());setInvalid(false);}}}/></label><button className={painting&&tool==='sample'?'active':''} aria-label="Pick exact yarn from a stitch" title="Eyedropper · Alt-click a stitch" onClick={()=>onTool('sample')}><Pipette size={15}/></button><button disabled={!usedColors.some(c=>c.toLowerCase()===color.toLowerCase())} onClick={onMatch}>Select matching</button></div>
    {invalid&&<p className="yarn-error" role="alert">Use a hex color such as #CBA477.</p>}
    <div className="used-colors"><span>In this piece</span>{usedColors.map(c=><button key={c} aria-label={`Reuse exact yarn ${c}`} aria-pressed={c.toLowerCase()===color.toLowerCase()} title={`Use exact yarn ${c.toUpperCase()}`} style={{background:c}} onClick={()=>onColor(c)}/>)}</div>
    {painting&&<div className="color-selection"><span>{!canPaint?'Fix pattern errors before painting.':tool==='brush'?'Drag to paint · Alt-click to sample · Esc cancels a stroke':tool==='sample'?'Click a stitch to copy its exact yarn, then brush.':selectionLabel}</span>{tool==='select'&&<button disabled={!selectionCount||!canPaint} onClick={onApply}><Paintbrush size={12}/>Apply yarn</button>}</div>}
  </div>;
}
