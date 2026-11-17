import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { buildGeometry, type ModelGeometry, type ModelPoint, type Position } from '../lib/geometry';
import { parsePattern } from '../lib/pattern';
import { offsetRows } from '../lib/rowOffsets';
import type { Piece } from '../lib/studio';
import { attachAtStitch, identityPlacement, piecePivot, placementPosition, stagedPlacement, type PiecePlacement } from '../lib/assembly';
import { createPieceMesh, disposePieceMesh } from '../lib/pieceMesh';
import type { ViewerHandle } from './ModelViewer';
import './ModelViewer.css';

export type AssemblyTool = 'select' | 'place' | 'translate' | 'rotate';
interface Props {
  pieces: Piece[];
  activeId: string;
  tool: AssemblyTool;
  thickness: number;
  onSelect(id: string): void;
  onPlace(id: string, placement: PiecePlacement): void;
  onTransform(id: string, placement: PiecePlacement): void;
  onDragStart(): void;
  onDragEnd(): void;
}
interface Entry { root: THREE.Group; content: THREE.Group; key: string; model: ModelGeometry; placement: PiecePlacement }
interface Runtime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbit: OrbitControls;
  transform: TransformControls;
  entries: Map<string, Entry>;
  marker: THREE.Mesh;
  outline: THREE.BoxHelper;
  reset(direction?: THREE.Vector3): void;
  refresh(props: Props): void;
}

export const AssemblyViewer = forwardRef<ViewerHandle, Props>(function AssemblyViewer(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const current = useRef(props); current.current = props;
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string>('');
  useImperativeHandle(ref, () => ({
    resetView: () => runtime.current?.reset(),
    frontView: () => runtime.current?.reset(new THREE.Vector3(0,0,1)),
    zoomIn: () => { const r=runtime.current;if(r)r.camera.position.sub(r.orbit.target).multiplyScalar(.8).add(r.orbit.target); },
    zoomOut: () => { const r=runtime.current;if(r)r.camera.position.sub(r.orbit.target).multiplyScalar(1.25).add(r.orbit.target); },
    exportImage: () => {
      const r=runtime.current; if(!r)return;
      const helpers=[r.transform.getHelper(),r.marker,r.outline], visibility=helpers.map(h=>h.visible);
      helpers.forEach(h=>h.visible=false);r.renderer.render(r.scene,r.camera);
      const a=document.createElement('a');a.download='loopform-assembly.png';a.href=r.renderer.domElement.toDataURL('image/png');a.click();
      helpers.forEach((h,i)=>h.visible=visibility[i]);
    },
  }), []);
  useEffect(() => {
    const element=host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true}); }
    catch { setFailed(true);return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
    const canvas=renderer.domElement;canvas.setAttribute('aria-label','3D assembly: select a piece or click the main piece to attach');canvas.tabIndex=0;
    element.appendChild(canvas);
    const scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fffbf5','#887a86',1.4));
    const key=new THREE.DirectionalLight('#fff6ed',2.1);key.position.set(-10,16,10);scene.add(key);
    const fill=new THREE.DirectionalLight('#e2e6ff',.55);fill.position.set(10,5,-8);scene.add(fill);
    const camera=new THREE.PerspectiveCamera(35,1,.1,2000);camera.position.set(10,6,24);
    const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;orbit.minDistance=2;orbit.maxDistance=1500;
    const transform=new TransformControls(camera,canvas);transform.setSize(.85);scene.add(transform.getHelper());
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),new THREE.MeshBasicMaterial({color:'#df9cff',depthTest:false}));
    marker.renderOrder=10;marker.visible=false;scene.add(marker);
    const outline=new THREE.BoxHelper(new THREE.Object3D(),'#c79cdd');outline.visible=false;scene.add(outline);
    const entries=new Map<string,Entry>();
    let pieceIds='';
    const reset=(direction?:THREE.Vector3)=>{
      const box=new THREE.Box3();scene.updateMatrixWorld(true);
      for(const entry of entries.values())if(entry.root.visible&&(!entry.placement.parentId||entries.get(entry.placement.parentId)?.root.visible))box.union(new THREE.Box3().setFromObject(entry.content));
      if(box.isEmpty())box.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(8,8,8));
      const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
      const verticalFov=THREE.MathUtils.degToRad(camera.fov),horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*camera.aspect);
      const distance=Math.max(size.y/(2*Math.tan(verticalFov/2)),Math.max(size.x,size.z)/(2*Math.tan(horizontalFov/2)))+Math.max(size.x,size.z)*.6;
      const axis=direction??camera.position.clone().sub(orbit.target);
      if(axis.lengthSq()<.001)axis.set(.15,.18,1);
      orbit.target.copy(center);camera.position.copy(center).add(axis.normalize().multiplyScalar(Math.max(6,distance)*1.2));
      camera.lookAt(center);orbit.update();
    };
    const refresh=(next:Props)=>{
      for(const [id,entry] of entries)if(!next.pieces.some(p=>p.id===id)) {entry.root.removeFromParent();disposePieceMesh(entry.content);entries.delete(id);}
      // Content stays cached during handle dragging; only its group transform changes.
      for(const piece of next.pieces) {
        const meshKey=JSON.stringify([piece.source,piece.rowOffsets,next.thickness]);
        let entry=entries.get(piece.id);
        if(!entry || entry.key!==meshKey) {
          const pattern=parsePattern(piece.source),model=offsetRows(buildGeometry(pattern),piece.rowOffsets);
          const content=createPieceMesh(model,pattern,next.thickness);content.traverse(o=>o.userData.pieceId=piece.id);
          if(entry){entry.root.remove(entry.content);disposePieceMesh(entry.content);entry.content=content;entry.model=model;entry.key=meshKey;}
          else {entry={root:new THREE.Group(),content,key:meshKey,model,placement:identityPlacement()};entries.set(piece.id,entry);}
          entry.root.add(content);
        }
      }
      const main=entries.get(next.pieces[0].id)!;
      next.pieces.forEach((piece,index)=>{
        const entry=entries.get(piece.id)!;
        const p=piece.placement??(index===0?identityPlacement():stagedPlacement(index,main.model,entry.model));entry.placement=p;
        const parent=p.parentId?main.root:scene;
        if(entry.root.parent!==parent)parent.add(entry.root);
        entry.content.position.copy(index===0?new THREE.Vector3():piecePivot(entry.model,p.edge).negate());
        if(!transform.dragging || transform.object!==entry.root){
          entry.root.position.copy(placementPosition(p,main.model));
          entry.root.rotation.set(...p.rotation.map(THREE.MathUtils.degToRad) as Position);
          entry.root.scale.setScalar(p.scale);
        }
        entry.root.visible=!piece.hidden;
      });
      const active=entries.get(next.activeId);
      const handles=next.tool==='translate'||next.tool==='rotate';
      if(active && handles && active.root.visible && (!active.placement.parentId||main.root.visible)){
        transform.setMode(next.tool as 'translate'|'rotate');transform.setSpace(next.tool==='rotate'?'local':'world');
        if(transform.object!==active.root)transform.attach(active.root);
        transform.enabled=true;
      }else {if(transform.dragging){transform.reset();transform.dragging=false;orbit.enabled=true;current.current.onDragEnd();}transform.detach();transform.enabled=false;}
      outline.visible=!!active&&handles&&active.root.visible;
      if(active&&outline.visible)outline.setFromObject(active.content);
      marker.visible=false;
      const ids=next.pieces.map(p=>p.id).join(',');if(ids!==pieceIds){pieceIds=ids;reset();}
      canvas.style.cursor=next.tool==='place'?'crosshair':'grab';
    };
    const r:Runtime={scene,camera,renderer,orbit,transform,entries,marker,outline,reset,refresh};runtime.current=r;
    transform.addEventListener('dragging-changed',event=>{orbit.enabled=!event.value;});
    transform.addEventListener('mouseDown',()=>current.current.onDragStart());
    transform.addEventListener('mouseUp',()=>current.current.onDragEnd());
    transform.addEventListener('objectChange',()=>{
      if(!transform.dragging)return;
      const p=current.current,entry=entries.get(p.activeId),main=entries.get(p.pieces[0].id);if(!entry||!main)return;
      const offset=placementPosition({...entry.placement,position:[0,0,0]},main.model);
      current.current.onTransform(p.activeId,{...entry.placement,
        position:entry.root.position.clone().sub(offset).toArray().map(n=>THREE.MathUtils.clamp(n,-10000,10000)) as Position,
        rotation:[entry.root.rotation.x,entry.root.rotation.y,entry.root.rotation.z].map(THREE.MathUtils.radToDeg) as Position});
      if(outline.visible)outline.setFromObject(entry.content);
    });
    const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
    const hit=(event:PointerEvent,onlyMain=false)=>{
      const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
      scene.updateMatrixWorld(true);ray.setFromCamera(pointer,camera);
      const mainId=current.current.pieces[0].id;
      const objects=[...entries].filter(([id,e])=>(!onlyMain||id===mainId)&&e.root.visible&&(!e.placement.parentId||entries.get(mainId)?.root.visible)).map(([,e])=>e.content);
      return ray.intersectObjects(objects,true)[0];
    };
    const anchorAt=(event:PointerEvent):ModelPoint|undefined=>{
      const main=entries.get(current.current.pieces[0].id),intersection=hit(event,true);if(!main||!intersection)return;
      const local=main.root.worldToLocal(intersection.point.clone());let point:ModelPoint|undefined,distance=Infinity;
      for(const p of main.model.points)if(!p.branch){const d=local.distanceToSquared(new THREE.Vector3().fromArray(p.position));if(d<distance){distance=d;point=p;}}
      return point;
    };
    let down={x:0,y:0,handle:false};
    const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY,handle:transform.enabled&&transform.axis!==null};};
    const pointerMove=(e:PointerEvent)=>{
      if(current.current.tool!=='place'){marker.visible=false;setHover('');return;}
      const point=anchorAt(e),main=entries.get(current.current.pieces[0].id);
      marker.visible=!!point;
      if(point&&main){marker.position.copy(main.root.localToWorld(new THREE.Vector3().fromArray(point.position)));setHover(`Round ${point.round} · Stitch ${point.index+1}`);}
      else setHover('');
    };
    const pointerUp=(event:PointerEvent)=>{
      if(down.handle||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
      const p=current.current;
      if(p.tool==='place'&&p.activeId!==p.pieces[0].id){
        const point=anchorAt(event),main=entries.get(p.pieces[0].id),child=entries.get(p.activeId);
        if(point&&main&&child){p.onPlace(p.activeId,attachAtStitch(p.pieces[0].id,main.model,child.model,point,child.placement));marker.visible=false;setHover('');}
      }else {const intersection=hit(event),id=intersection?.object.userData.pieceId;if(id)p.onSelect(id);}
    };
    const leave=()=>{marker.visible=false;setHover('');};
    canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointerleave',leave);
    const resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}});resize.observe(element);
    camera.aspect=element.clientWidth/Math.max(1,element.clientHeight);camera.updateProjectionMatrix();renderer.setSize(element.clientWidth,element.clientHeight);
    refresh(current.current);
    renderer.setAnimationLoop(()=>{if(orbit.enabled)orbit.update();renderer.render(scene,camera);});
    return()=>{
      renderer.setAnimationLoop(null);resize.disconnect();
      canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointerleave',leave);
      transform.dispose();orbit.dispose();entries.forEach(e=>disposePieceMesh(e.content));marker.geometry.dispose();(marker.material as THREE.Material).dispose();outline.geometry.dispose();(outline.material as THREE.Material).dispose();renderer.dispose();canvas.remove();runtime.current=null;
    };
  }, []);
  useEffect(()=>{runtime.current?.refresh(props);},[props.pieces,props.activeId,props.tool,props.thickness]);
  return <div ref={host} className={`model-viewer assembly-viewer ${props.tool==='place'?'placing':''}`}>
    {failed&&<div className="viewer-message"><strong>3D is unavailable</strong><span>Enable WebGL to assemble your pieces.</span></div>}
    {props.tool==='place'&&<div className="assembly-prompt"><strong>Click a stitch on {props.pieces[0].name}</strong><span>{hover||'Drag the background to rotate and reach any side.'}</span></div>}
  </div>;
});
