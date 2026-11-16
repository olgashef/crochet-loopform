export type PaintTool = 'inspect' | 'brush' | 'sample';
export interface BrushHit { id:number; color:string }
export interface BrushOptions {
  tool():PaintTool;
  color():string;
  enabled():boolean;
  hit(x:number,y:number):BrushHit|null;
  begin?():void;
  preview(ids:number[],color:string):void;
  restore():void;
  commit(ids:number[],color:string):boolean;
  sample(hit:BrushHit):void;
}

/** Sample the whole cursor path, including fast moves between browser events. */
export function strokeSamples(from:[number,number],to:[number,number]):[number,number][] {
  const count=Math.max(1,Math.min(512,Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/3)));
  return Array.from({length:count},(_,i)=>[from[0]+(to[0]-from[0])*(i+1)/count,from[1]+(to[1]-from[1])*(i+1)/count]);
}
export class BrushStroke {
  readonly ids=new Set<number>();
  constructor(readonly color:string){}
  add(hit:BrushHit|null):boolean {
    if(!hit || hit.color.toLowerCase()===this.color.toLowerCase() || this.ids.has(hit.id))return false;
    this.ids.add(hit.id);return true;
  }
}

/** Shared pointer transaction for the 3D model and stitch chart. */
export class StitchBrush {
  private stroke:{pointer:number;last:[number,number];paint:BrushStroke}|null=null;
  private sampling:number|null=null;
  constructor(private element:HTMLElement,private options:BrushOptions){
    element.addEventListener('pointerdown',this.down,true);
    element.addEventListener('pointermove',this.move,true);
    element.addEventListener('pointerup',this.up,true);
    element.addEventListener('pointercancel',this.cancel,true);
    element.addEventListener('lostpointercapture',this.cancel);
    window.addEventListener('blur',this.cancel);
    window.addEventListener('keydown',this.key);
  }
  get active(){return !!this.stroke;}
  private stop(event:PointerEvent){event.preventDefault();event.stopImmediatePropagation();}
  private down=(event:PointerEvent)=>{
    if(this.stroke){this.stop(event);return;}
    if(event.button!==0)return;
    const tool=this.options.tool();
    if(tool==='sample'||event.altKey){
      this.stop(event);this.sampling=event.pointerId;this.element.setPointerCapture(event.pointerId);
      const hit=this.options.hit(event.clientX,event.clientY);if(hit)this.options.sample(hit);
      return;
    }
    if(tool!=='brush'||!this.options.enabled())return;
    this.stop(event);
    this.options.begin?.();
    this.element.setPointerCapture(event.pointerId);
    this.stroke={pointer:event.pointerId,last:[event.clientX,event.clientY],paint:new BrushStroke(this.options.color())};
    this.paintAt([[event.clientX,event.clientY]]);
  };
  private paintAt(positions:[number,number][]){
    if(!this.stroke)return;
    const ids:number[]=[];
    for(const [x,y] of positions){const hit=this.options.hit(x,y);if(this.stroke.paint.add(hit))ids.push(hit!.id);}
    if(ids.length)this.options.preview(ids,this.stroke.paint.color);
  }
  private move=(event:PointerEvent)=>{
    if(this.sampling===event.pointerId){this.stop(event);return;}
    if(!this.stroke||this.stroke.pointer!==event.pointerId)return;
    this.stop(event);
    const to:[number,number]=[event.clientX,event.clientY];
    this.paintAt(strokeSamples(this.stroke.last,to));this.stroke.last=to;
  };
  private up=(event:PointerEvent)=>{
    if(this.sampling===event.pointerId){this.stop(event);this.releaseSample();return;}
    if(!this.stroke||this.stroke.pointer!==event.pointerId)return;
    this.move(event);this.finish(false);
  };
  private releaseSample(){const pointer=this.sampling;this.sampling=null;if(pointer!==null&&this.element.hasPointerCapture(pointer))this.element.releasePointerCapture(pointer);}
  private cancel=()=>{this.finish(true);this.releaseSample();};
  private key=(event:KeyboardEvent)=>{if(event.key==='Escape')this.cancel();};
  private finish(cancel:boolean){
    const stroke=this.stroke;if(!stroke)return;this.stroke=null;
    if(this.element.hasPointerCapture(stroke.pointer))this.element.releasePointerCapture(stroke.pointer);
    if(cancel||!stroke.paint.ids.size||!this.options.commit([...stroke.paint.ids],stroke.paint.color))this.options.restore();
  }
  cancelStroke(){this.finish(true);}
  dispose(){
    this.cancel();
    this.element.removeEventListener('pointerdown',this.down,true);this.element.removeEventListener('pointermove',this.move,true);this.element.removeEventListener('pointerup',this.up,true);
    this.element.removeEventListener('pointercancel',this.cancel,true);this.element.removeEventListener('lostpointercapture',this.cancel);
    window.removeEventListener('blur',this.cancel);window.removeEventListener('keydown',this.key);
  }
}
