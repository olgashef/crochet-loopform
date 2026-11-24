import {setStitchMorph,CLUSTER_TYPES,StitchInstancedMesh} from '../lib/stitchMorph';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { flushSync } from 'react-dom';
import { StitchBrush, type PaintTool } from "../lib/stitchBrush";
import { createFabricGeometry } from "../lib/fabricGeometry";
import { createYarnGeometry } from "../lib/yarnGeometry";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ModelGeometry } from "../lib/geometry";
import { getStitchAppearance } from "../lib/stitchAppearance";
import { buildStitchFrames } from "../lib/stitchFrame";
import { createBobbleGeometry } from "../lib/bobbleGeometry";
import { buildSafetyEyes, type SafetyEyePair } from "../lib/safetyEyes";
import { frameModelBounds, initialModelView } from "../lib/viewFraming";
import "./ModelViewer.css";
import { RowManipulator } from "./RowManipulator";
import { offsetRows, type RowOffsets } from "../lib/rowOffsets";
import { THREADS, type EmbroideryAnchor, type EmbroiderySegment, type ThreadWeight } from '../lib/embroidery';
import { embroiderySurface } from '../lib/embroiderySurface';
import { createEmbroideryMesh } from '../lib/embroideryMesh';
import { createRoundHighlight } from '../lib/roundHighlight';
import { EmbroideryPointer } from '../lib/embroideryPointer';

export interface ViewerHandle {
  focusEyePair?(index:number): void;
  resetView(): void;
  frontView(): void;
  zoomIn(): void;
  zoomOut(): void;
  exportImage(): void;
}

export interface ViewerProps {
  model: ModelGeometry | null;
  safetyEyes: SafetyEyePair[];
  embroidery: EmbroiderySegment[];
  embroidering: boolean;
  embroideryAnchor: EmbroideryAnchor | null;
  threadWeight: ThreadWeight;
  threadColor: string;
  onEmbroideryPoint: (anchor: EmbroideryAnchor) => void;
  rowOffsets: RowOffsets;
  moveRows: boolean;
  selectedRow: number | null;
  onSelectRow: (row: number) => void;
  onRowMove: (row: number, value: number) => void;
  onRowDragStart: () => void;
  onRowDragEnd: (cancel: boolean) => void;
  visibleRounds: number;
  thickness: number;
  mode: "stitches" | "structure";
  selectedStitch: number | null;
  selectedStitches?: number[];
  highlightedRounds?: readonly number[];
  onSelect: (id: number | null) => void;
  paintTool?: PaintTool;
  brushColor?: string;
  canPaint?: boolean;
  onBrush?: (ids:number[],color:string) => boolean;
  onSample?: (color:string) => void;
}

type Point = ModelGeometry["points"][number];

interface ViewerRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group;
  nodes: THREE.InstancedMesh | null;
  bobbles: THREE.InstancedMesh | null;
  fabric: THREE.Mesh | null;
  bobblePoints: Point[];
  activePoints: Point[];
  marker: THREE.Mesh;
  selectionScale: THREE.Vector3;
  selectionRotation: THREE.Quaternion;
  reset: (direction?: THREE.Vector3) => void;
  rows: RowManipulator;
  brush: StitchBrush | null;
  previewColors: Map<number,string>;
  stitchInstances: Map<number,number>;
  bobbleInstances: Map<number,number>;
  fabricVertices: Map<number,number[]>;
  embroidery: THREE.Group;
  embroideryDraft: THREE.Group;
  roundHighlight: THREE.Group;
  embroideryPointer: EmbroideryPointer | null;
}

interface HoveredPoint {
  id: number;
  round: number;
  index: number;
  type: string;
  color: string;
  patternColor?: string;
  paintSourceLine?: number;
  auxiliary?: 'foundation' | 'turning';
  x: number;
  y: number;
}

function disposeGroup(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
    material.dispose();
  }
}

function createShadow(width: number, depth: number, floor: number) {
  const image = document.createElement("canvas");
  image.width = image.height = 128;
  const context = image.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(63,55,43,0.17)");
  gradient.addColorStop(0.55, "rgba(63,55,43,0.07)");
  gradient.addColorStop(1, "rgba(63,55,43,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(image);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(
      Math.max(width, 1) * 1.35,
      Math.max(depth, 1) * 1.35,
    ),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = floor;
  return shadow;
}

export const ModelViewer = forwardRef<ViewerHandle, ViewerProps>(
  function ModelViewer(
    {
      model: baseModel,
      safetyEyes,
      embroidery, embroidering, embroideryAnchor, threadWeight, threadColor, onEmbroideryPoint,
      visibleRounds,
      thickness,
      mode,
      selectedStitch,
      selectedStitches = [],
      highlightedRounds = [],
      onSelect,
      paintTool = "inspect", brushColor = "#f3e8d6", canPaint = true, onBrush, onSample,
      rowOffsets,
      moveRows,
      selectedRow,
      onSelectRow,
      onRowMove,
      onRowDragStart,
      onRowDragEnd,
    },
    ref,
  ) {
    const model = useMemo(
      () => (baseModel ? offsetRows(baseModel, rowOffsets) : null),
      [baseModel, rowOffsets],
    );
    const eyePlacements = useMemo(
      () => model ? buildSafetyEyes(model, safetyEyes) : [],
      [model, safetyEyes],
    );
    const eyesRef = useRef(eyePlacements);
    eyesRef.current = eyePlacements;
    const rowCallbacks = useRef({
      onSelectRow,
      onRowMove,
      onRowDragStart,
      onRowDragEnd,
    });
    rowCallbacks.current = {
      onSelectRow,
      onRowMove,
      onRowDragStart,
      onRowDragEnd,
    };
    const host = useRef<HTMLDivElement>(null);
    const runtime = useRef<ViewerRuntime | null>(null);
    const modelRef = useRef(model);
    const surface = useMemo(() => model ? embroiderySurface(model) : null, [model]);
    const embroideryRef = useRef({embroidering, embroideryAnchor, threadWeight, threadColor, onEmbroideryPoint, surface});
    embroideryRef.current = {embroidering, embroideryAnchor, threadWeight, threadColor, onEmbroideryPoint, surface};
    const frames = useMemo(
      () =>
        buildStitchFrames(
          model?.points ?? [],
          (mode === "structure" ? 0.062 : 0.25) * thickness,
          mode === "stitches",
          model?.roundCenters,
        ),
      [model, mode, thickness],
    );
    const framesRef = useRef(frames);
    framesRef.current = frames;
    const displayRef = useRef({ mode, thickness });
    const selectCallback = useRef(onSelect);
    const paintRef = useRef({paintTool,brushColor,canPaint,onBrush,onSample});
    paintRef.current = {paintTool,brushColor,canPaint,onBrush,onSample};
    const lastModel = useRef<ModelGeometry | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [hover, setHover] = useState<HoveredPoint | null>(null);

    modelRef.current = model;
    displayRef.current = { mode, thickness };
    selectCallback.current = onSelect;

    useImperativeHandle(
      ref,
      () => ({
        focusEyePair(index:number) {
          const pair=eyesRef.current.slice(index*2,index*2+2);
          if(!pair.length)return;
          const direction=new THREE.Vector3();
          for(const eye of pair)direction.add(new THREE.Vector3().fromArray(eye.normal));
          if(direction.lengthSq()<1e-8)direction.fromArray(pair[0].normal);
          direction.normalize();direction.y=0.2;
          runtime.current?.reset(direction.normalize());
        },
        frontView() {
          runtime.current?.reset(new THREE.Vector3(0, 0, 1));
        },
        resetView() {
          runtime.current?.reset();
        },
        zoomIn() {
          const current = runtime.current;
          if (!current) return;
          current.camera.position
            .sub(current.controls.target)
            .multiplyScalar(0.8)
            .add(current.controls.target);
          current.controls.update();
        },
        zoomOut() {
          const current = runtime.current;
          if (!current) return;
          current.camera.position
            .sub(current.controls.target)
            .multiplyScalar(1.25)
            .add(current.controls.target);
          current.controls.update();
        },
        exportImage() {
          const current = runtime.current;
          if (!current) return;
          const previousBackground = current.scene.background;
          const previousMarker = current.marker.visible;
          current.roundHighlight.visible = false;
          const anchor = current.embroidery.getObjectByName('embroidery-anchor');
          const previousAnchor = anchor?.visible;
          current.embroideryDraft.visible = false;
          if (anchor) anchor.visible = false;
          current.scene.background = new THREE.Color("#f6f5f0");
          current.marker.visible = false;
          current.rows.setHidden(true);
          current.renderer.render(current.scene, current.camera);
          const download = document.createElement("a");
          download.href = current.renderer.domElement.toDataURL("image/png");
          download.download = "loopform-model.png";
          download.click();
          current.scene.background = previousBackground;
          current.marker.visible = previousMarker;
          current.roundHighlight.visible = true;
          current.embroideryDraft.visible = true;
          if (anchor) anchor.visible = previousAnchor!;
          current.rows.setHidden(false);
          current.renderer.render(current.scene, current.camera);
        },
      }),
      [],
    );

    useEffect(() => {
      const container = host.current;
      if (!container) return;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        });
      } catch {
        setFailure(
          "The 3D view needs WebGL. Try enabling hardware acceleration or opening this page in another browser.",
        );
        return;
      }

      setFailure(null);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.domElement.setAttribute(
        "aria-label",
        "Interactive crochet model. Drag to rotate, scroll to zoom, or click a stitch to inspect it.",
      );
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("tabindex", "0");
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 3000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.rotateSpeed = 0.65;
      controls.zoomSpeed = 0.8;
      controls.panSpeed = 0.7;
      controls.screenSpacePanning = true;
      controls.minDistance = 0.4;
      controls.maxDistance = 800;
      controls.maxPolarAngle = Math.PI * 0.91;

      scene.add(new THREE.HemisphereLight(0xfffbf5, 0x887a86, 1.4));
      const key = new THREE.DirectionalLight(0xfff6ed, 2.1);
      key.position.set(-10, 16, 10);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xe2e6ff, 0.55);
      fill.position.set(10, 5, -8);
      scene.add(fill);

      const group = new THREE.Group();
      scene.add(group);
      const embroideryGroup = new THREE.Group(), embroideryDraft = new THREE.Group();
      scene.add(embroideryGroup, embroideryDraft);
      const roundHighlight = new THREE.Group();
      scene.add(roundHighlight);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.31, 0.35, 48),
        new THREE.MeshBasicMaterial({
          color: "#a169b8",
          side: THREE.DoubleSide,
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      marker.renderOrder = 10;
      marker.visible = false;
      scene.add(marker);

      const renderedBounds = () => {
        const bounds = new THREE.Box3();
        const display = displayRef.current;
        const radius =
          (display.mode === "structure" ? 0.062 : 0.25) * display.thickness;
        for (const point of modelRef.current?.points ?? []) {
          const center = framesRef.current.get(point.id)!.position.clone();
          const extent = framesRef.current
            .get(point.id)!
            .extent.clone()
            .multiplyScalar(radius);
          bounds.expandByPoint(center.clone().sub(extent));
          bounds.expandByPoint(center.add(extent));
        }
        for (const eye of eyesRef.current) {
          const center = new THREE.Vector3().fromArray(eye.position);
          const extent = new THREE.Vector3().setScalar(eye.size / 2);
          bounds.expandByPoint(center.clone().sub(extent));
          bounds.expandByPoint(center.add(extent));
        }
        return bounds.isEmpty()
          ? new THREE.Box3(
              new THREE.Vector3(-2, -2, -2),
              new THREE.Vector3(2, 2, 2),
            )
          : bounds;
      };

      const reset = (
        direction = initialModelView(modelRef.current, eyesRef.current.map((eye) => eye.normal)),
      ) => {
        const frame = frameModelBounds(
          renderedBounds(),
          container.clientWidth,
          container.clientHeight,
          direction,
          camera.fov,
        );
        controls.target.copy(frame.target);
        camera.position
          .copy(frame.target)
          .addScaledVector(direction, frame.distance * ((modelRef.current?.construction==='rows'||modelRef.current?.planarFoundation) ? 1 : modelRef.current?.points.some(p => p.branch) ? 0.84 : 0.69));
        controls.maxDistance = Math.max(800, frame.distance * 4);
        camera.near = Math.max(frame.distance / 1000, 0.01);
        camera.far = Math.max(frame.distance * 100, 1000);
        camera.updateProjectionMatrix();
        controls.update();
      };

      const current: ViewerRuntime = {
        scene,
        camera,
        renderer,
        controls,
        group,
        nodes: null,
        bobbles: null,
        fabric: null,
        bobblePoints: [],
        activePoints: [],
        marker,
        selectionScale: new THREE.Vector3(1, 1, 1),
        selectionRotation: new THREE.Quaternion(),
        reset,
        rows: null! as RowManipulator,
        brush: null, previewColors:new Map(), stitchInstances:new Map(), bobbleInstances:new Map(), fabricVertices:new Map(),
        embroidery: embroideryGroup, embroideryDraft, embroideryPointer: null,
        roundHighlight,
      };
      current.rows = new RowManipulator(
        scene,
        camera,
        controls,
        renderer.domElement,
        {
          select: (row) => rowCallbacks.current.onSelectRow(row),
          start: () => rowCallbacks.current.onRowDragStart(),
          change: (row, value) => rowCallbacks.current.onRowMove(row, value),
          end: (cancel) => rowCallbacks.current.onRowDragEnd(cancel),
        },
        () => ({ mesh: current.nodes, points: current.activePoints }),
      );
      runtime.current = current;

      let previousSize: { width: number; height: number } | null = null;
      const resize = () => {
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (!previousSize) {
          reset();
        } else if (
          previousSize.width !== width ||
          previousSize.height !== height
        ) {
          // Compare fits at the user's current orbit. Carry their relative zoom
          // and pan into the new viewport rather than resetting the camera.
          const offset = camera.position.clone().sub(controls.target);
          const direction = offset.clone().normalize();
          const bounds = renderedBounds();
          const oldFrame = frameModelBounds(
            bounds,
            previousSize.width,
            previousSize.height,
            direction,
            camera.fov,
          );
          const newFrame = frameModelBounds(
            bounds,
            width,
            height,
            direction,
            camera.fov,
          );
          controls.target.add(newFrame.target.clone().sub(oldFrame.target));
          camera.position
            .copy(controls.target)
            .add(offset.multiplyScalar(newFrame.distance / oldFrame.distance));
          controls.update();
        }
        previousSize = { width, height };
      };

      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const hitTest = (event: {clientX:number;clientY:number}) => {
        if (!current.nodes) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return null;
        camera.updateMatrixWorld();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(
          [current.nodes, ...(current.bobbles ? [current.bobbles] : []), ...(current.fabric ? [current.fabric] : [])],
          false,
        )[0];
        if (hit && hit.object === current.fabric) {
          const ownership=current.fabric?.geometry.getAttribute('stitchId');
          if(ownership && hit.faceIndex!==undefined && hit.faceIndex!==null) {
            const id=ownership.getX(hit.faceIndex*3);
            return current.activePoints[current.stitchInstances.get(id)??-1]??null;
          }
          // The backing blocks rays through tiny yarn gaps. Pick the nearest
          // front-surface stitch instead of accidentally painting its back.
          let closest: Point | null = null;
          let distance = Infinity;
          for (const point of current.activePoints) {
            if (point.branch) continue;
            const d = new THREE.Vector3().fromArray(point.position).distanceToSquared(hit.point);
            if (d < distance) { distance = d; closest = point; }
          }
          return closest;
        }
        return hit?.instanceId === undefined
          ? null
          : (hit.object === current.bobbles ? current.bobblePoints : current.activePoints)[hit.instanceId];
      };

      function previewColor(id:number,hex:string) {
        const shade=new THREE.Color(hex),index=current.stitchInstances.get(id),bobble=current.bobbleInstances.get(id);
        if(index!==undefined)current.nodes?.setColorAt(index,shade);
        if(bobble!==undefined)current.bobbles?.setColorAt(bobble,shade);
        const colors=current.fabric?.geometry.getAttribute('color');
        for(const vertex of current.fabricVertices.get(id)??[])colors?.setXYZ(vertex,shade.r,shade.g,shade.b);
        if(colors)colors.needsUpdate=true;
        if(current.nodes?.instanceColor)current.nodes.instanceColor.needsUpdate=true;
        if(current.bobbles?.instanceColor)current.bobbles.instanceColor.needsUpdate=true;
      }
      const embroideryHit = (x: number, y: number) => {
        if (!current.fabric) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
        camera.updateMatrixWorld();
        pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(current.fabric, false)[0];
        return hit ? embroideryRef.current.surface?.pick(hit.point) ?? null : null;
      };
      const clearDraft = () => { disposeGroup(current.embroideryDraft); current.embroideryDraft.clear(); };
      // Register before the color brush so embroidery owns left clicks, including Alt-clicks.
      current.embroideryPointer = new EmbroideryPointer(renderer.domElement, {
        enabled: () => embroideryRef.current.embroidering,
        click: (x, y) => {
          const anchor = embroideryHit(x, y);
          // Native canvas events must commit before the next point is clicked.
          if (anchor) flushSync(() => embroideryRef.current.onEmbroideryPoint(anchor));
        },
        hover: (x, y) => {
          clearDraft(); setHover(null);
          const options = embroideryRef.current, hit = embroideryHit(x, y);
          if (!hit || !modelRef.current) return;
          if (options.embroideryAnchor) {
            current.embroideryDraft.add(createEmbroideryMesh(modelRef.current, [{from: options.embroideryAnchor, to: hit, weight: options.threadWeight, color: options.threadColor, line: 0}], displayRef.current.thickness, Infinity, true));
          }
        },
        leave: clearDraft,
      });
      current.brush=new StitchBrush(renderer.domElement,{
        tool:()=>paintRef.current.paintTool,color:()=>paintRef.current.brushColor,enabled:()=>paintRef.current.canPaint,
        hit:(x,y)=>hitTest({clientX:x,clientY:y}),
        begin:()=>{setHover(null);current.previewColors.clear();},
        preview:(ids,color)=>{for(const id of ids){current.previewColors.set(id,color);previewColor(id,color);}},
        restore:()=>{for(const id of current.previewColors.keys()){const point=current.activePoints[current.stitchInstances.get(id)??-1];if(point)previewColor(id,point.color);}current.previewColors.clear();},
        commit:(ids,color)=>paintRef.current.onBrush?.(ids,color)??false,
        sample:hit=>{setHover(null);paintRef.current.onSample?.(hit.color);},
      });

      let down: [number, number] | null = null;
      const pointerDown = (event: PointerEvent) => {
        if (event.button === 0) down = [event.clientX, event.clientY];
        setHover(null);
      };
      const pointerUp = (event: PointerEvent) => {
        if (
          event.button === 0 &&
          down &&
          Math.hypot(event.clientX - down[0], event.clientY - down[1]) < 5
        ) {
          selectCallback.current(hitTest(event)?.id ?? null);
        }
        down = null;
      };
      const pointerMove = (event: PointerEvent) => {
        if (embroideryRef.current.embroidering) { setHover(null); renderer.domElement.style.cursor = 'crosshair'; return; }
        if (event.buttons) return;
        const point = hitTest(event);
        renderer.domElement.style.cursor = paintRef.current.paintTool!=="inspect" ? "crosshair" : point ? "pointer" : "grab";
        if (!point) {
          setHover(null);
          return;
        }
        const rect = container.getBoundingClientRect();
        setHover({
          id: point.id,
          round: point.round,
          index: point.index,
          type: point.type,
          color: point.color,
          patternColor: point.patternColor,
          paintSourceLine: point.paintSourceLine,
          auxiliary: point.auxiliary?.kind,
          x: Math.max(
            8,
            Math.min(event.clientX - rect.left + 14, rect.width - 210),
          ),
          y: Math.max(event.clientY - rect.top - 76, 12),
        });
      };
      const pointerLeave = () => {
        setHover(null);
        down = null;
      };
      renderer.domElement.addEventListener("pointerdown", pointerDown);
      renderer.domElement.addEventListener("pointerup", pointerUp);
      renderer.domElement.addEventListener("pointermove", pointerMove);
      renderer.domElement.addEventListener("pointerleave", pointerLeave);

      let frame = 0;
      const screenRight = new THREE.Vector3();
      const screenUp = new THREE.Vector3();
      const inverseRotation = new THREE.Quaternion();
      const animate = () => {
        if(!current.brush?.active)controls.update();
        marker.quaternion.copy(camera.quaternion);
        if (marker.visible) {
          // Project the oriented ellipsoid into the camera plane, including
          // its tilt, so selection follows the bead as the camera orbits.
          camera.updateMatrixWorld();
          const matrix = camera.matrixWorld.elements;
          inverseRotation.copy(current.selectionRotation).invert();
          screenRight
            .set(matrix[0], matrix[1], matrix[2])
            .applyQuaternion(inverseRotation)
            .multiply(current.selectionScale);
          screenUp
            .set(matrix[4], matrix[5], matrix[6])
            .applyQuaternion(inverseRotation)
            .multiply(current.selectionScale);
          const a = screenRight.lengthSq(),
            c = screenUp.lengthSq(),
            b = screenRight.dot(screenUp);
          const spread = Math.hypot(a - c, 2 * b);
          marker.rotateZ(0.5 * Math.atan2(2 * b, a - c));
          marker.scale.set(
            Math.sqrt((a + c + spread) / 2),
            Math.sqrt(Math.max(0, (a + c - spread) / 2)),
            1,
          );
        }
        current.rows.render();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      animate();

      return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        current.brush?.dispose();
        current.embroideryPointer?.dispose();
        current.rows.dispose();
        controls.dispose();
        renderer.domElement.removeEventListener("pointerdown", pointerDown);
        renderer.domElement.removeEventListener("pointerup", pointerUp);
        renderer.domElement.removeEventListener("pointermove", pointerMove);
        renderer.domElement.removeEventListener("pointerleave", pointerLeave);
        disposeGroup(group);
        disposeGroup(embroideryGroup);
        disposeGroup(embroideryDraft);
        disposeGroup(roundHighlight);
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        if (runtime.current === current) runtime.current = null;
        lastModel.current = null;
      };
    }, []);

    useEffect(() => {
      const current = runtime.current;
      if (!current) return;
      current.brush?.cancelStroke();
      current.previewColors.clear();
      current.stitchInstances.clear();current.bobbleInstances.clear();current.fabricVertices.clear();
      disposeGroup(current.group);
      current.group.clear();
      current.nodes = null;
      current.bobbles = null;
      current.fabric = null;
      current.bobblePoints = [];
      current.activePoints = [];
      current.marker.visible = false;
      setHover(null);
      if (!model || model.points.length === 0) return;

      const active = model.points.filter(
        (point) => point.round <= visibleRounds,
      );
      const pointMap = new Map(active.map((point) => [point.id, point]));
      current.activePoints = active;
      active.forEach((point,index)=>current.stitchInstances.set(point.id,index));
      const nodeRadius = (mode === "structure" ? 0.062 : 0.25) * thickness;
      const sphere = mode === "stitches" ? createYarnGeometry(nodeRadius) : new THREE.SphereGeometry(
        nodeRadius,
        mode === "structure" ? 8 : 16,
        mode === "structure" ? 6 : 12,
      );
      if (mode === "stitches") {
        const fabric = new THREE.Mesh(
          createFabricGeometry(model, visibleRounds, 0.15),
          new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
        );
        current.group.add(fabric);
        current.fabric = fabric;
        const ownership=fabric.geometry.getAttribute('stitchId');
        for(let vertex=0;vertex<ownership.count;vertex++){
          const id=ownership.getX(vertex),vertices=current.fabricVertices.get(id)??[];vertices.push(vertex);current.fabricVertices.set(id,vertices);
        }
      }
      const nodeMaterial = new THREE.MeshStandardMaterial({
        roughness: 0.94,
        metalness: 0,
      });
      const nodes = new StitchInstancedMesh(
        sphere,
        nodeMaterial,
        active.length,
      );
      const transform = new THREE.Object3D();
      const color = new THREE.Color();
      active.forEach((point, index) => {
        if(mode === "stitches")setStitchMorph(nodes,index,point.countedChain?point.countedChain-1:undefined);
        const frame = frames.get(point.id)!;
        transform.position.copy(frame.position);
        transform.scale.copy(frame.scale);
        if (['bobble','bobble2','bobble3','bobble4','trbo','puff','popcorn'].includes(point.type) && mode === "stitches") transform.scale.multiplyScalar(0.5);
        transform.quaternion.copy(frame.rotation);
        transform.updateMatrix();
        nodes.setMatrixAt(index, transform.matrix);
        nodes.setColorAt(index, color.set(point.color));
      });
      nodes.instanceMatrix.needsUpdate = true;
      if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true;
      nodes.computeBoundingSphere();
      current.nodes = nodes;
      current.group.add(nodes);

      if (mode === "stitches") {
        const bobblePoints = active.filter((point) => ['bobble','bobble2','bobble3','bobble4','trbo','puff','popcorn'].includes(point.type));
        if (bobblePoints.length) {
          const bobbles = new StitchInstancedMesh(
            createBobbleGeometry(nodeRadius),
            nodeMaterial,
            bobblePoints.length,
          );
          bobblePoints.forEach((point, index) => {
            setStitchMorph(bobbles,index,CLUSTER_TYPES.indexOf(point.type));
            const frame = frames.get(point.id)!;
            transform.position.copy(frame.position);
            transform.scale.copy(frame.scale);
            transform.quaternion.copy(frame.rotation);
            transform.updateMatrix();
            bobbles.setMatrixAt(index, transform.matrix);
            bobbles.setColorAt(index, color.set(point.color));
          });
          bobbles.instanceMatrix.needsUpdate = true;
          if (bobbles.instanceColor) bobbles.instanceColor.needsUpdate = true;
          bobbles.computeBoundingSphere();
          current.bobbles = bobbles;
          current.bobblePoints = bobblePoints;
          bobblePoints.forEach((point,index)=>current.bobbleInstances.set(point.id,index));
          current.group.add(bobbles);
        }
      }

      const visibleEyes = eyePlacements.filter((eye) => eye.upperRound <= visibleRounds);
      if (visibleEyes.length) {
        const eyeGeometry = new THREE.SphereGeometry(1, 24, 16);
        const eyeMaterial = new THREE.MeshPhysicalMaterial({
          color: "#080a09", roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.08,
        });
        const highlightGeometry = new THREE.SphereGeometry(1, 10, 8);
        const highlightMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff" });
        for (const eye of visibleEyes) {
          const pupil = new THREE.Mesh(eyeGeometry, eyeMaterial);
          pupil.position.fromArray(eye.position);
          pupil.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1), new THREE.Vector3().fromArray(eye.normal),
          );
          pupil.scale.set(eye.size / 2, eye.size / 2, eye.size * 0.28);
          const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
          highlight.position.set(-0.24, 0.28, 0.9);
          highlight.scale.setScalar(0.12);
          pupil.add(highlight);
          current.group.add(pupil);
        }
      }
      current.renderer.domElement.setAttribute(
        "aria-label",
        `Interactive crochet model. ${active.filter((p) => ['bobble','bobble2','bobble3','bobble4','trbo','puff','popcorn'].includes(p.type)).length} bobble stitches, ${active.filter((p) => p.branch).length} branch stitches, ${visibleEyes.length} safety eyes. Drag to rotate, scroll to zoom, or click a stitch to inspect it.`,
      );

      const links = (mode === "structure" ? model.links : []).filter(
        (link) => pointMap.has(link.from) && pointMap.has(link.to),
      );
      const edgeRadius = (mode === "structure" ? 0.018 : 0.045) * thickness;
      const cylinder = new THREE.CylinderGeometry(
        1,
        1,
        1,
        mode === "structure" ? 5 : 8,
      );
      const edgeMaterial = new THREE.MeshStandardMaterial({
        roughness: 0.8,
        metalness: 0,
      });
      const edges = new StitchInstancedMesh(
        cylinder,
        edgeMaterial,
        links.length,
      );
      const start = new THREE.Vector3();
      const end = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const vertical = new THREE.Vector3(0, 1, 0);
      links.forEach((link, index) => {
        start.fromArray(pointMap.get(link.from)!.position);
        end.fromArray(pointMap.get(link.to)!.position);
        direction.subVectors(end, start);
        transform.position.copy(start).add(end).multiplyScalar(0.5);
        transform.quaternion.setFromUnitVectors(
          vertical,
          direction.clone().normalize(),
        );
        const radius = edgeRadius * (link.kind === "course" ? 1.15 : 0.88);
        transform.scale.set(radius, direction.length(), radius);
        transform.updateMatrix();
        edges.setMatrixAt(index, transform.matrix);
        color.set(link.color);
        if (mode === "structure") color.lerp(new THREE.Color("#a9b4a8"), 0.35);
        edges.setColorAt(index, color);
      });
      edges.instanceMatrix.needsUpdate = true;
      if (edges.instanceColor) edges.instanceColor.needsUpdate = true;
      edges.computeBoundingSphere();
      current.group.add(edges);

      const floor =
        Math.min(
          ...model.points.map(
            (point) =>
              frames.get(point.id)!.position.y -
              nodeRadius * frames.get(point.id)!.extent.y,
          ),
        ) - 0.05;
      const shadow = createShadow(
        model.bounds.width,
        model.bounds.depth,
        floor,
      );
      if (shadow) current.group.add(shadow);

      if (!lastModel.current || lastModel.current.construction !== baseModel?.construction || lastModel.current.points.length !== baseModel?.points.length) {
        current.reset();
        lastModel.current = baseModel;
      }
    }, [model, baseModel, frames, eyePlacements, visibleRounds, thickness, mode]);

    useEffect(() => {
      const current = runtime.current;
      if (!current) return;
      disposeGroup(current.roundHighlight); current.roundHighlight.clear();
      const visible = highlightedRounds.filter(round => round <= visibleRounds);
      current.roundHighlight.add(createRoundHighlight(visible, [
        {mesh: current.nodes, points: current.activePoints},
        {mesh: current.bobbles, points: current.bobblePoints},
      ]));
      current.renderer.domElement.setAttribute('aria-description', visible.length ? `Highlighted rounds: ${visible.join(', ')}` : 'No round highlighted');
    }, [highlightedRounds, model, visibleRounds, thickness, mode, frames]);

    useEffect(() => {
      const current = runtime.current;
      if (!current) return;
      disposeGroup(current.embroidery); current.embroidery.clear();
      disposeGroup(current.embroideryDraft); current.embroideryDraft.clear();
      if (model) {
        current.embroidery.add(createEmbroideryMesh(model, embroidery, thickness, visibleRounds));
        if (embroidering && embroideryAnchor) {
          const point = surface?.sample(embroideryAnchor, 0.30 * thickness + THREADS[threadWeight].radius);
          if (point) {
            const pin = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({color: '#b987d0'}));
            pin.name = 'embroidery-anchor';
            pin.position.copy(point.position); current.embroidery.add(pin);
          }
        }
      }
      current.renderer.domElement.setAttribute('data-embroidery-lines', String(current.embroidery.children[0]?.children.length ?? 0));
      const canvas = current.renderer.domElement;
      const label = (canvas.getAttribute('aria-label') ?? '').replace(/ \d+ embroidery lines\./, '');
      canvas.setAttribute('aria-label', `${label} ${current.embroidery.children[0]?.children.length ?? 0} embroidery lines.`);
    }, [model, embroidery, thickness, visibleRounds, embroidering, embroideryAnchor, threadWeight, threadColor, surface]);

    useEffect(() => {
      setHover(null);
      runtime.current?.rows.update(
        model,
        visibleRounds,
        selectedRow,
        rowOffsets,
        moveRows,
      );
    }, [model, visibleRounds, selectedRow, rowOffsets, moveRows]);

    useEffect(() => {
      const current = runtime.current;
      if (!current) return;
      const point = current.activePoints.find(
        (candidate) => candidate.id === selectedStitch,
      );
      const selectedIds = new Set(selectedStitches);
      const shade = new THREE.Color();
      const tint = new THREE.Color("#b97bd7");
      current.activePoints.forEach((p,i) => {
        shade.set(current.previewColors.get(p.id)??p.color);
        if (selectedIds.has(p.id)) shade.lerp(tint, 0.45);
        current.nodes?.setColorAt(i, shade);
      });
      if (current.nodes?.instanceColor) current.nodes.instanceColor.needsUpdate = true;
      current.marker.visible = Boolean(point);
      if (point) {
        current.marker.position.copy(frames.get(point.id)!.position);
        current.selectionRotation.copy(frames.get(point.id)!.rotation);
        current.selectionScale
          .fromArray(getStitchAppearance(point.type).scale)
          .multiplyScalar(thickness * (mode === "structure" ? 0.35 : 1));
      }
    }, [selectedStitch, selectedStitches, visibleRounds, thickness, mode, model, frames]);

    useEffect(()=>{
      const current=runtime.current;if(!current)return;
      current.brush?.cancelStroke();
      current.embroideryPointer?.cancel();
      current.controls.mouseButtons.RIGHT=paintTool==='inspect'&&!embroidering?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
      current.renderer.domElement.style.cursor=paintTool==='inspect'&&!embroidering?'grab':'crosshair';
      if (embroidering) current.renderer.domElement.focus({preventScroll:true});
      setHover(null);
    },[paintTool,brushColor,canPaint,embroidering]);

    return (
      <div className="model-viewer" ref={host}>
        {failure && (
          <div className="viewer-message" role="alert">
            <strong>3D view unavailable</strong>
            <span>{failure}</span>
          </div>
        )}
        {!failure && (!model || !model.points.length) && (
          <div className="viewer-message">
            <strong>Your next idea starts here</strong>
            <span>
              Write a pattern and render it to see your stitches take shape.
            </span>
          </div>
        )}
        {hover && !failure && (
          <div
            className="stitch-tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            <strong>
              {hover.auxiliary==='foundation'?'Foundation':`${model?.construction==='rows'?'Row':'Round'} ${hover.round}`} <span>·</span> {hover.auxiliary==='turning'?'Turning chain':'Stitch'} {hover.index + 1}
            </strong>
            <span>
              {getStitchAppearance(hover.type).label} ·{" "}
              {getStitchAppearance(hover.type).abbreviation}
            </span>
            <span className="tooltip-yarn"><i style={{background:hover.color}}/>{hover.color.toUpperCase()}{hover.paintSourceLine ? ' · Painted' : ''}</span>
            {hover.patternColor&&<><span className="tooltip-yarn"><i style={{background:hover.patternColor}}/>Pattern: {hover.patternColor.toUpperCase()}</span><span className="stitch-tooltip-action">Paint on line {hover.paintSourceLine} overrides the written yarn.</span></>}
            <span className="stitch-tooltip-action">{paintTool==='sample'?'Click to sample exact yarn':paintTool==='brush'?'Drag to paint · Alt-click to sample':'Click to inspect · Alt-click to sample'}</span>
          </div>
        )}
      </div>
    );
  },
);
