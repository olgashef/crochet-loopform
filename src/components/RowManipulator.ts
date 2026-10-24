import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ModelGeometry, ModelPoint } from "../lib/geometry";
import type { RowOffsets } from "../lib/rowOffsets";

interface Callbacks {
  select: (row: number) => void;
  start: () => void;
  change: (row: number, value: number) => void;
  end: (cancel: boolean) => void;
}
function dispose(object: THREE.Object3D) {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        m.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    }
  });
}
/** Vertical-only row transform. Capture-phase events keep orbiting out of a row drag. */
export class RowManipulator {
  private enabled = false;
  private row: number | null = null;
  private offsets: RowOffsets = {};
  private points: ModelPoint[] = [];
  private picker: THREE.InstancedMesh | null = null;
  private pickRows: number[] = [];
  private ray = new THREE.Raycaster();
  private arrow = new THREE.Group();
  private highlight = new THREE.Group();
  private arrowHit: THREE.Mesh;
  private selection: THREE.Group;
  private dragging: {
    id: number;
    row: number;
    offset: number;
    y: number;
    plane: THREE.Plane;
  } | null = null;
  private hidden = false;
  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private controls: OrbitControls,
    private canvas: HTMLCanvasElement,
    private callbacks: Callbacks,
    private nodes: () => {
      mesh: THREE.InstancedMesh | null;
      points: ModelPoint[];
    },
  ) {
    for (const sign of [-1, 1]) {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8),
        new THREE.MeshBasicMaterial({ color: "#4c986b", depthTest: false }),
      );
      shaft.position.y = sign * 0.525;
      this.arrow.add(shaft);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.13, 0.33, 12),
        new THREE.MeshBasicMaterial({ color: "#4c986b", depthTest: false }),
      );
      tip.position.y = sign * 1.2;
      if (sign < 0) tip.rotation.z = Math.PI;
      this.arrow.add(tip);
    }
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshBasicMaterial({ color: "#f3fff6", depthTest: false }),
    );
    this.arrow.add(center);
    this.arrowHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 2.9, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.arrow.add(this.arrowHit);
    this.arrow.traverse((o) => (o.renderOrder = 100));
    this.selection = new THREE.Group();
    this.selection.add(this.arrow, this.highlight);
    this.scene.add(this.selection);
    this.selection.visible = false;
    canvas.addEventListener("pointerdown", this.down, true);
    canvas.addEventListener("pointermove", this.move, true);
    canvas.addEventListener("pointerup", this.up, true);
    canvas.addEventListener("pointercancel", this.cancel, true);
    canvas.addEventListener("lostpointercapture", this.lostCapture);
    window.addEventListener("blur", this.lostCapture);
    window.addEventListener("keydown", this.key);
  }
  update(
    model: ModelGeometry | null,
    visible: number,
    row: number | null,
    offsets: RowOffsets,
    enabled: boolean,
  ) {
    this.enabled = enabled;
    this.row = row;
    this.offsets = offsets;
    this.points = model?.points.filter((p) => p.round <= visible) ?? [];
    if (
      this.dragging &&
      (!enabled || !this.points.some((p) => p.round === this.dragging!.row))
    )
      this.finish(true);
    if (this.picker) {
      dispose(this.picker);
      this.scene.remove(this.picker);
      this.picker = null;
    }
    dispose(this.highlight);
    this.highlight.clear();
    this.pickRows = [];
    this.selection.visible =
      enabled &&
      row !== null &&
      this.points.some((p) => p.round === row) &&
      !this.hidden;
    if (!enabled || !model) return;
    const byId = new Map(this.points.map((p) => [p.id, p]));
    const links = model.links.filter(
      (l) =>
        l.kind === "course" &&
        byId.has(l.from) &&
        byId.has(l.to) &&
        byId.get(l.from)!.round === byId.get(l.to)!.round,
    );
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
      links.length,
    );
    const object = new THREE.Object3D(),
      up = new THREE.Vector3(0, 1, 0);
    links.forEach((l, i) => {
      const a = new THREE.Vector3().fromArray(byId.get(l.from)!.position),
        b = new THREE.Vector3().fromArray(byId.get(l.to)!.position);
      const d = b.clone().sub(a);
      object.position.copy(a).add(b).multiplyScalar(0.5);
      object.quaternion.setFromUnitVectors(up, d.clone().normalize());
      object.scale.set(0.13, d.length(), 0.13);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      this.pickRows.push(byId.get(l.from)!.round);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.picker = mesh;
    this.scene.add(mesh);
    const selected = this.points.filter((p) => p.round === row);
    if (selected.length) {
      const curve = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          selected.map((p) => new THREE.Vector3().fromArray(p.position)),
        ),
        new THREE.LineBasicMaterial({
          color: "#da913d",
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      curve.renderOrder = 90;
      this.highlight.add(curve);
      const mean = selected
        .reduce(
          (v, p) => v.add(new THREE.Vector3().fromArray(p.position)),
          new THREE.Vector3(),
        )
        .divideScalar(selected.length);
      this.arrow.position.copy(mean);
      this.render();
    }
  }
  render() {
    if (!this.selection.visible) return;
    this.arrow.scale.setScalar(
      Math.max(
        0.25,
        this.camera.position.distanceTo(this.arrow.position) * 0.032,
      ),
    );
    this.arrow.updateMatrixWorld(true);
    this.picker?.updateMatrixWorld(true);
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.selection.visible =
      !hidden &&
      this.enabled &&
      this.row !== null &&
      this.points.some((p) => p.round === this.row);
  }
  private setRay(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
  }
  private hitRow() {
    const hits = this.picker
      ? this.ray.intersectObject(this.picker, false)
      : [];
    if (hits[0]?.instanceId !== undefined)
      return this.pickRows[hits[0].instanceId];
    const nodes = this.nodes();
    const hit = nodes.mesh
      ? this.ray.intersectObject(nodes.mesh, false)[0]
      : null;
    return hit?.instanceId !== undefined
      ? (nodes.points[hit.instanceId]?.round ?? null)
      : null;
  }
  private down = (e: PointerEvent) => {
    if (!this.enabled || e.button !== 0) return;
    this.setRay(e);
    this.render();
    const arrowHit =
      this.selection.visible &&
      this.ray.intersectObject(this.arrowHit, false).length > 0;
    const row = arrowHit ? this.row : this.hitRow();
    if (row === null) return;
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    normal.y = 0;
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    normal.normalize();
    const point = this.points.find((p) => p.round === row);
    if (!point) return;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      normal,
      new THREE.Vector3().fromArray(point.position),
    );
    const start = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!start) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.controls.enabled = false;
    this.controls.enableDamping = false;
    this.controls.update();
    this.canvas.setPointerCapture(e.pointerId);
    this.callbacks.select(row);
    this.callbacks.start();
    this.dragging = {
      id: e.pointerId,
      row,
      offset: this.offsets[row] || 0,
      y: start.y,
      plane,
    };
    this.canvas.style.cursor = "ns-resize";
  };
  private move = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.setRay(e);
    if (this.dragging) {
      e.stopImmediatePropagation();
      e.preventDefault();
      const hit = this.ray.ray.intersectPlane(
        this.dragging.plane,
        new THREE.Vector3(),
      );
      if (hit) {
        const offset = Math.max(
          -1000,
          Math.min(1000, this.dragging.offset + hit.y - this.dragging.y),
        );
        this.callbacks.change(this.dragging.row, offset);
      }
      return;
    }
    if (e.buttons) return;
    const hovered = this.hitRow();
    const arrowHit =
      this.selection.visible &&
      this.ray.intersectObject(this.arrowHit, false).length > 0;
    this.canvas.style.cursor = arrowHit
      ? "ns-resize"
      : hovered !== null
        ? "grab"
        : "default";
    e.stopImmediatePropagation();
  };
  private up = (e: PointerEvent) => {
    if (!this.dragging) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.finish(false);
  };
  private cancel = (e: PointerEvent) => {
    if (!this.dragging) return;
    e.stopImmediatePropagation();
    this.finish(true);
  };
  private lostCapture = () => {
    if (this.dragging) this.finish(true);
  };
  private key = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.dragging) {
      e.preventDefault();
      this.finish(true);
    }
  };
  private finish(cancel: boolean) {
    const drag = this.dragging;
    if (!drag) return;
    this.dragging = null;
    if (this.canvas.hasPointerCapture(drag.id))
      this.canvas.releasePointerCapture(drag.id);
    this.controls.enabled = true;
    this.controls.enableDamping = true;
    this.canvas.style.cursor = "grab";
    if (cancel) this.callbacks.change(drag.row, drag.offset);
    this.callbacks.end(cancel);
  }
  dispose() {
    if (this.dragging) this.finish(true);
    this.canvas.removeEventListener("pointerdown", this.down, true);
    this.canvas.removeEventListener("pointermove", this.move, true);
    this.canvas.removeEventListener("pointerup", this.up, true);
    this.canvas.removeEventListener("pointercancel", this.cancel, true);
    this.canvas.removeEventListener("lostpointercapture", this.lostCapture);
    window.removeEventListener("blur", this.lostCapture);
    window.removeEventListener("keydown", this.key);
    if (this.picker) {
      dispose(this.picker);
      this.scene.remove(this.picker);
    }
    dispose(this.selection);
    this.scene.remove(this.selection);
  }
}
