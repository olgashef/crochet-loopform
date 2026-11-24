import { useEffect, useRef } from 'react';
import type { ParsedPattern } from '../lib/pattern';
import { StitchBrush, type PaintTool } from '../lib/stitchBrush';
interface Props {
  pattern:ParsedPattern; visibleRounds:number; selection:number[]; tool:PaintTool; color:string; canPaint:boolean;
  onSelect(id:number):void; onBrush(ids:number[],color:string):boolean; onSample(color:string):void;
}
export function StitchChart(props:Props){
  const root=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props;
  const brush=useRef<StitchBrush|null>(null);
  useEffect(()=>{
    const element=root.current!,original=new Map<HTMLButtonElement,string>();
    brush.current=new StitchBrush(element,{
      tool:()=>latest.current.tool,color:()=>latest.current.color,enabled:()=>latest.current.canPaint,
      hit:(x,y)=>{
        const button=document.elementFromPoint(x,y)?.closest<HTMLButtonElement>('button[data-stitch-id]');
        if(!button||!element.contains(button))return null;
        const stitch=latest.current.pattern.stitches.find(s=>s.id===Number(button.dataset.stitchId));return stitch??null;
      },
      begin:()=>original.clear(),
      preview:(ids,color)=>{for(const id of ids){const button=element.querySelector<HTMLButtonElement>(`button[data-stitch-id="${id}"]`);if(button){if(!original.has(button))original.set(button,button.style.background);button.style.background=color;}}},
      restore:()=>{original.forEach((color,button)=>button.style.background=color);original.clear();},
      commit:(ids,color)=>latest.current.onBrush(ids,color),sample:hit=>latest.current.onSample(hit.color),
    });
    return()=>{brush.current?.dispose();brush.current=null;};
  },[]);
  useEffect(()=>brush.current?.cancelStroke(),[props.pattern,props.visibleRounds,props.tool,props.color,props.canPaint]);
  const flat=props.pattern.construction==='rows';
  const label=flat?'Row':'Round';
  return <div ref={root} className={`stitch-chart ${props.tool!=='inspect'?'chart-painting':''}`} aria-label="Stitch chart canvas">
    <p>{props.tool==='brush'?'Drag across cells to paint whole stitches.':props.tool==='sample'?'Click a cell to copy its exact yarn color.':flat?'Click a stitch to select it. Rows alternate direction.':'Click a stitch to select it. Each row is one round.'}</p>
    {props.pattern.rounds.slice(0,props.visibleRounds).slice().reverse().map(r=><div className="chart-row" key={r.number}><span>{r.number}</span>{(flat&&r.number%2===0?r.stitches:r.stitches.slice().reverse()).map(s=><button key={s.id} data-stitch-id={s.id} className={props.selection.includes(s.id)?'selected':''} style={{background:s.color}} title={`${label} ${s.round}, stitch ${s.index+1}: ${s.type} · ${s.color.toUpperCase()}${s.patternColor ? ` · Painted; pattern ${s.patternColor.toUpperCase()} · paint line ${s.paintSourceLine}` : ''}`} aria-label={`${label} ${s.round}, stitch ${s.index+1}`} onClick={event=>{
      if(props.tool==='inspect')props.onSelect(s.id);
      else if(event.detail===0){if(props.tool==='sample')props.onSample(s.color);else if(props.canPaint)props.onBrush([s.id],props.color);}
    }}>{s.isIncrease?'∨':s.type==='dec'?'∧':'×'}</button>)}<small>{r.outputCount}</small></div>)}
  </div>;
}
