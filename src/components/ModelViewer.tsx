import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ModelGeometry } from "../lib/geometry";
import { getStitchAppearance } from "../lib/stitchAppearance";
import { buildStitchFrames } from "../lib/stitchFrame";
import { frameModelBounds } from "../lib/viewFraming";
import "./ModelViewer.css";
import { RowManipulator } from "./RowManipulator";
import { offsetRows, type RowOffsets } from "../lib/rowOffsets";

export interface ViewerHandle {
  resetView(): void;
  frontView(): void;
  zoomIn(): void;
  zoomOut(): void;
  exportImage(): void;
}

export interface ViewerProps {
  model: ModelGeometry | null;
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
  onSelect: (id: number | null) => void;
}

type Point = ModelGeometry["points"][number];

interface ViewerRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  group: THREE.Group;
  nodes: THREE.InstancedMesh | null;
  activePoints: Point[];
  marker: THREE.Mesh;
  selectionScale: THREE.Vector3;
  selectionRotation: THREE.Quaternion;
  reset: (direction?: THREE.Vector3) => void;
  rows: RowManipulator;
}

interface HoveredPoint {
  id: number;
  round: number;
  index: number;
  type: string;
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
      visibleRounds,
      thickness,
      mode,
      selectedStitch,
      onSelect,
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
    const frames = useMemo(
      () =>
        buildStitchFrames(
          model?.points ?? [],
          (mode === "structure" ? 0.062 : 0.25) * thickness,
          mode === "stitches",
        ),
      [model, mode, thickness],
    );
    const framesRef = useRef(frames);
    framesRef.current = frames;
    const displayRef = useRef({ mode, thickness });
    const selectCallback = useRef(onSelect);
    const lastModel = useRef<ModelGeometry | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [hover, setHover] = useState<HoveredPoint | null>(null);

    modelRef.current = model;
    displayRef.current = { mode, thickness };
    selectCallback.current = onSelect;

    useImperativeHandle(
      ref,
      () => ({
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
          current.scene.background = new THREE.Color("#f6f5f0");
          current.marker.visible = false;
          current.rows.setHidden(true);
          current.renderer.render(current.scene, current.camera);
          const anchor = document.createElement("a");
          anchor.href = current.renderer.domElement.toDataURL("image/png");
          anchor.download = "loopform-model.png";
          anchor.click();
          current.scene.background = previousBackground;
          current.marker.visible = previousMarker;
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

      scene.add(new THREE.HemisphereLight(0xfffbef, 0xb7b2a6, 1.8));
      const key = new THREE.DirectionalLight(0xfff2df, 2.5);
      key.position.set(-10, 16, 10);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xe2eeff, 1.1);
      fill.position.set(10, 5, -8);
      scene.add(fill);

      const group = new THREE.Group();
      scene.add(group);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.31, 0.35, 48),
        new THREE.MeshBasicMaterial({
          color: "#315d4c",
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
        return bounds.isEmpty()
          ? new THREE.Box3(
              new THREE.Vector3(-2, -2, -2),
              new THREE.Vector3(2, 2, 2),
            )
          : bounds;
      };

      const reset = (
        direction = new THREE.Vector3(0.95, 0.36, 1.55).normalize(),
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
          .addScaledVector(direction, frame.distance);
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
        activePoints: [],
        marker,
        selectionScale: new THREE.Vector3(1, 1, 1),
        selectionRotation: new THREE.Quaternion(),
        reset,
        rows: null! as RowManipulator,
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
      const hitTest = (event: PointerEvent) => {
        if (!current.nodes) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(current.nodes, false)[0];
        return hit?.instanceId === undefined
          ? null
          : current.activePoints[hit.instanceId];
      };

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
        if (event.buttons) return;
        const point = hitTest(event);
        renderer.domElement.style.cursor = point ? "pointer" : "grab";
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
        controls.update();
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
        current.rows.dispose();
        controls.dispose();
        renderer.domElement.removeEventListener("pointerdown", pointerDown);
        renderer.domElement.removeEventListener("pointerup", pointerUp);
        renderer.domElement.removeEventListener("pointermove", pointerMove);
        renderer.domElement.removeEventListener("pointerleave", pointerLeave);
        disposeGroup(group);
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
      disposeGroup(current.group);
      current.group.clear();
      current.nodes = null;
      current.activePoints = [];
      current.marker.visible = false;
      setHover(null);
      if (!model || model.points.length === 0) return;

      const active = model.points.filter(
        (point) => point.round <= visibleRounds,
      );
      const pointMap = new Map(active.map((point) => [point.id, point]));
      current.activePoints = active;
      const nodeRadius = (mode === "structure" ? 0.062 : 0.25) * thickness;
      const sphere = new THREE.SphereGeometry(
        nodeRadius,
        mode === "structure" ? 8 : 16,
        mode === "structure" ? 6 : 12,
      );
      const nodeMaterial = new THREE.MeshStandardMaterial({
        roughness: 0.57,
        metalness: 0.025,
      });
      const nodes = new THREE.InstancedMesh(
        sphere,
        nodeMaterial,
        active.length,
      );
      const transform = new THREE.Object3D();
      const color = new THREE.Color();
      active.forEach((point, index) => {
        const frame = frames.get(point.id)!;
        transform.position.copy(frame.position);
        transform.scale.copy(frame.scale);
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

      const links = model.links.filter(
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
      const edges = new THREE.InstancedMesh(
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

      if (lastModel.current !== baseModel) {
        current.reset();
        lastModel.current = baseModel;
      }
    }, [model, baseModel, frames, visibleRounds, thickness, mode]);

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
      current.marker.visible = Boolean(point);
      if (point) {
        current.marker.position.copy(frames.get(point.id)!.position);
        current.selectionRotation.copy(frames.get(point.id)!.rotation);
        current.selectionScale
          .fromArray(getStitchAppearance(point.type).scale)
          .multiplyScalar(thickness * (mode === "structure" ? 0.35 : 1));
      }
    }, [selectedStitch, visibleRounds, thickness, mode, model, frames]);

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
              Round {hover.round} <span>·</span> Stitch {hover.index + 1}
            </strong>
            <span>
              {getStitchAppearance(hover.type).label} ·{" "}
              {getStitchAppearance(hover.type).abbreviation}
            </span>
            <span className="stitch-tooltip-action">Click to inspect</span>
          </div>
        )}
      </div>
    );
  },
);
