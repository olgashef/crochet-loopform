import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { BrushStroke, StitchBrush, strokeSamples, type BrushOptions } from './stitchBrush';
import { normalizeYarnColor, paintStitches } from './colorwork';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { createFabricGeometry } from './fabricGeometry';
import { STARTER } from './studio';

class Surface extends EventTarget {
  captures=new Set<number>();
  setPointerCapture(id:number){this.captures.add(id);}
  hasPointerCapture(id:number){return this.captures.has(id);}
  releasePointerCapture(id:number){this.captures.delete(id);this.dispatchEvent(new Event('lostpointercapture'));}
  pointer(type:string,x:number,y=0,extra={}){
    this.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{pointerId:1,button:0,clientX:x,clientY:y,altKey:false,...extra}));
  }
}
function fixture(t:TestContext,overrides:Partial<BrushOptions>={}){
  const original=Object.getOwnPropertyDescriptor(globalThis,'window'),win=new EventTarget();
  Object.defineProperty(globalThis,'window',{configurable:true,value:win});
  const surface=new Surface(),commits:{ids:number[];color:string}[]=[],previews:number[]=[],samples:string[]=[];
  let restored=0;
  const brush=new StitchBrush(surface as unknown as HTMLElement,{
    tool:()=>'brush',color:()=>'#123456',enabled:()=>true,
    hit:(x)=>x<0?null:{id:Math.floor(x/10),color:'#cba477'},
    preview:ids=>previews.push(...ids),restore:()=>{restored++;},
    commit:(ids,color)=>{commits.push({ids,color});return true;},sample:hit=>samples.push(hit.color),...overrides,
  });
  t.after(()=>{brush.dispose();if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');});
  return {surface,brush,win,commits,previews,samples,restored:()=>restored};
}

test('fast brush motion fills intermediate stitches and commits once on release',t=>{
  const f=fixture(t);
  f.surface.pointer('pointerdown',1);f.surface.pointer('pointermove',35);f.surface.pointer('pointermove',15);f.surface.pointer('pointerup',45);
  assert.deepEqual(f.commits,[{ids:[0,1,2,3,4],color:'#123456'}]);
  assert.equal(new Set(f.previews).size,f.previews.length);
  assert.equal(f.restored(),0);assert.equal(f.brush.active,false);assert.equal(f.surface.captures.size,0);
});
test('cancel, lost capture, Escape, blur and disposal never commit a partial stroke',t=>{
  const f=fixture(t);
  const stops=[()=>f.surface.pointer('pointercancel',20),()=>f.surface.releasePointerCapture(1),()=>f.win.dispatchEvent(Object.assign(new Event('keydown'),{key:'Escape'})),()=>f.win.dispatchEvent(new Event('blur')),()=>f.brush.cancelStroke(),()=>f.brush.dispose()];
  for(const stop of stops){f.surface.pointer('pointerdown',1);f.surface.pointer('pointermove',30);stop();assert.equal(f.brush.active,false);}
  assert.equal(f.commits.length,0);assert.equal(f.restored(),stops.length);
});
test('eyedropper and Alt-click sample the source shade without starting a stroke',t=>{
  const f=fixture(t,{tool:()=>'sample',hit:()=>({id:4,color:'#FFF1EA'})});
  f.surface.pointer('pointerdown',1);f.surface.pointer('pointermove',40);f.surface.pointer('pointerup',40);
  assert.deepEqual(f.samples,['#FFF1EA']);assert.deepEqual(f.commits,[]);assert.deepEqual(f.previews,[]);
});
test('Alt-click samples while brushing; right-drag and disabled brush do not paint',t=>{
  let enabled=true;const f=fixture(t,{enabled:()=>enabled});
  f.surface.pointer('pointerdown',1,0,{altKey:true});f.surface.pointer('pointerup',1);
  f.surface.pointer('pointerdown',1,0,{button:2});f.surface.pointer('pointermove',20);f.surface.pointer('pointerup',20,0,{button:2});
  enabled=false;f.surface.pointer('pointerdown',1);f.surface.pointer('pointerup',20);
  assert.deepEqual(f.samples,['#cba477']);assert.equal(f.commits.length,0);
});
test('a failed paint commit restores the live preview',t=>{
  const f=fixture(t,{commit:()=>false});f.surface.pointer('pointerdown',1);f.surface.pointer('pointerup',20);
  assert.equal(f.restored(),1);
});
test('strokes skip unchanged yarn and never toggle an already painted stitch',()=>{
  const brush=new BrushStroke('#aBcDeF');
  assert.equal(brush.add({id:0,color:'#abcdef'}),false);assert.equal(brush.add(null),false);
  assert.equal(brush.add({id:1,color:'#fff1ea'}),true);assert.equal(brush.add({id:1,color:'#fff1ea'}),false);
  assert.deepEqual([...brush.ids],[1]);assert.deepEqual(strokeSamples([0,0],[0,0]),[[0,0]]);
});
test('painting whole outputs preserves neighboring stitches, increase siblings, and construction',()=>{
  const source='Round 1: 6 sc in mr\nRound 2: 6 inc\nRound 3: 12 sc',before=parsePattern(source);
  const after=parsePattern(paintStitches(source,[6,8,15],'#fff1ea'));
  assert.deepEqual(after.diagnostics,[]);
  assert.deepEqual(after.stitches.map(s=>[s.id,s.parents,s.type]),before.stitches.map(s=>[s.id,s.parents,s.type]));
  for(const s of after.stitches)assert.equal(s.color,[6,8,15].includes(s.id)?'#fff1ea':before.stitches[s.id].color);
});
test('fabric triangles retain exact stitch ownership and unlit yarn colors for picking and previews',()=>{
  const model=buildGeometry(parsePattern(STARTER)),geometry=createFabricGeometry(model);
  const ids=geometry.getAttribute('stitchId'),colors=geometry.getAttribute('color'),positions=geometry.getAttribute('position');
  assert.equal(ids.count,positions.count);assert.equal(colors.count,positions.count);
  for(let i=0;i<ids.count;i+=3){
    const id=ids.getX(i),point=model.points.find(p=>p.id===id)!;assert.ok(point);
    assert.equal(ids.getX(i+1),id);assert.equal(ids.getX(i+2),id);
    const shade=new Color(point.color);assert.ok(Math.abs(colors.getX(i)-shade.r)<1e-6&&Math.abs(colors.getY(i)-shade.g)<1e-6&&Math.abs(colors.getZ(i)-shade.b)<1e-6);
  }
  geometry.dispose();
});
test('exact hex entry normalizes case and shorthand without approximate shade matching',()=>{
  assert.equal(normalizeYarnColor(' #FFF1EA '),'#fff1ea');assert.equal(normalizeYarnColor('cba477'),'#cba477');assert.equal(normalizeYarnColor('#AbC'),'#aabbcc');
  for(const bad of ['red','#ffff','##ffff00','#aabbccdd','12345g'])assert.equal(normalizeYarnColor(bad),null);
});
