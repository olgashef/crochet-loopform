import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, Vector3 } from 'three';
import { embroideryCode, parseEmbroideryDirective, THREADS } from './embroidery';
import { embroiderySurface } from './embroiderySurface';
import { createEmbroideryMesh, embroideryPath } from './embroideryMesh';
import { EmbroideryPointer } from './embroideryPointer';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { offsetRows } from './rowOffsets';
import { STARTER, newPiece, validProject } from './studio';
import { writtenPattern, csvPattern } from './worksheet';
import { createPieceMesh, disposePieceMesh } from './pieceMesh';

const segment = parseEmbroideryDirective('embroider dk #303431: 8.25@80 > 9.5@100', 1)!;

test('embroidery survives pattern/project exports and does not alter crochet stitches or colors', () => {
  const source = STARTER + '\n' + embroideryCode(segment);
  const parsed = parsePattern(source);
  assert.deepEqual(parsed.diagnostics, []);
  assert.deepEqual(parsed.stitches, parsePattern(STARTER).stitches);
  assert.equal(parsed.embroidery.length, 1);
  const project = {version: 2, name: 'Face', activeId: 'main', pieces: [{...newPiece('Main', source), id: 'main'}]};
  const restored = JSON.parse(JSON.stringify(project));
  assert.ok(validProject(restored));
  assert.deepEqual(parsePattern(restored.pieces[0].source).embroidery, parsed.embroidery);
  assert.deepEqual(parsePattern(writtenPattern(source)).embroidery, parsed.embroidery);
  assert.ok(csvPattern(source).includes('embroider dk #303431'));
});

test('invalid thread weights, coordinates, colors, missing courses and excessive lines report errors', () => {
  for (const code of ['embroider thin #123456: 1@0 > 2@90', 'embroider dk red: 1@0 > 2@90', 'embroider dk #123456: NaN@0 > 2@90', 'embroider dk #123456: 1@0 > 2@9999', 'embroider dk #123456: 1@0 > 1@360']) {
    assert.throws(() => parseEmbroideryDirective(code, 1));
  }
  assert.ok(parsePattern(STARTER + '\nembroider dk #123456: 70@0 > 71@10').diagnostics.some(d => /missing round/.test(d.message)));
  const open = '1: 6 sc in mr\n2: 6 inc\nembroider dk #123456: 2@0 > 2.5@30';
  assert.ok(parsePattern(open).diagnostics.some(d => /open end/.test(d.message)));
  assert.ok(parsePattern(STARTER + '\n' + Array(257).fill(embroideryCode(segment)).join('\n')).diagnostics.some(d => /at most 256/.test(d.message)));
});

test('surface placement follows both orientations, curved crowns and translated row heights', () => {
  for (const orientation of ['top-down', 'bottom-up']) {
    const model = buildGeometry(parsePattern(STARTER.replace('orientation top-down', `orientation ${orientation}`)));
    const surface = embroiderySurface(model);
    for (const anchor of [{round: 1.5, angle: 95}, {round: 8.25, angle: 120}, {round: 16.6, angle: 210}, {round: 0.5, angle: 90}, {round: 17.5, angle: 90}]) {
      const point = surface.sample(anchor)!;
      assert.ok(point && point.position.toArray().every(Number.isFinite));
      assert.ok(Math.abs(point.normal.length() - 1) < 1e-8);
      const picked = surface.pick(point.position)!;
      assert.ok(Math.abs(picked.round - anchor.round) < 0.001);
      assert.ok(Math.abs(picked.angle - anchor.angle) < 0.001);
    }
    const crown = surface.sample({round: 1.5, angle: 90})!;
    assert.ok(orientation === 'top-down' ? crown.normal.y > .5 : crown.normal.y < -.5);
    const moved = embroiderySurface(offsetRows(model, {8: 2, 9: 4}));
    assert.ok(Math.abs(moved.sample({round: 8.25, angle: 90})!.position.y - surface.sample({round: 8.25, angle: 90})!.position.y - 2.5) < 1e-8);
  }
});

test('thread runs stay above the fabric and cross the seam along its short side', () => {
  const model = buildGeometry(parsePattern(STARTER));
  const seam = {...segment, from: {round: 8.5, angle: 350}, to: {round: 8.5, angle: 10}};
  const points = embroideryPath(model, seam);
  assert.ok(points.length > 2);
  const center = model.roundCenters[7].center;
  for (const point of points) {
    assert.ok(point.toArray().every(Number.isFinite));
    assert.ok(point.x > center[0]);
    assert.ok(Math.hypot(point.x - center[0], point.z - center[2]) > model.roundCenters[7].radius + .2);
  }
});

test('all three thread widths render and obey playback in piece and assembly meshes', () => {
  const model = buildGeometry(parsePattern(STARTER));
  const radii = Object.keys(THREADS).map(weight => {
    const s = {...segment, weight: weight as keyof typeof THREADS};
    const group = createEmbroideryMesh(model, [s]);
    assert.equal(group.children.length, 1);
    const mesh = group.children[0] as Mesh;
    const radius = (mesh.geometry as import('three').TubeGeometry).parameters.radius;
    const positions = mesh.geometry.getAttribute('position');
    assert.ok(Array.from(positions.array).every(Number.isFinite));
    disposePieceMesh(group);
    const hidden = createEmbroideryMesh(model, [s], 1, 9);
    assert.equal(hidden.children.length, 0);
    return radius;
  });
  assert.ok(radii[0] < radii[1] && radii[1] < radii[2]);
  const parsed = parsePattern(STARTER + '\n' + embroideryCode(segment));
  const assembly = createPieceMesh(model, parsed, 1);
  assert.ok(assembly.getObjectByName(`embroidery-${parsed.embroidery[0].line}`));
  disposePieceMesh(assembly);
  assert.equal(createEmbroideryMesh(model, [{...segment, to: {round: 100, angle: 90}}]).children.length, 0);
});

test('empty surfaces and collapsed endpoints never generate invalid geometry', () => {
  const empty = buildGeometry(parsePattern(''));
  assert.equal(embroiderySurface(empty).pick(new Vector3()), null);
  assert.deepEqual(embroideryPath(empty, segment), []);
  const model = buildGeometry(parsePattern(STARTER));
  assert.equal(createEmbroideryMesh(model, [{...segment, to: segment.from}]).children.length, 0);
});

class Surface extends EventTarget {
  captures = new Set<number>();
  focus() {}
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); this.dispatchEvent(new Event('lostpointercapture')); }
  pointer(type: string, x: number, extra = {}) {
    this.dispatchEvent(Object.assign(new Event(type, {cancelable:true}), {pointerId:1,button:0,clientX:x,clientY:0,buttons:0,...extra}));
  }
}
test('embroidery clicks ignore drags, canceled pointers and right-button camera gestures', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {configurable:true, value:new EventTarget()});
  const element = new Surface(), clicks: number[] = [];
  let enabled = true;
  const pointer = new EmbroideryPointer(element as unknown as HTMLElement, {enabled:()=>enabled,click:x=>clicks.push(x),hover:()=>{},leave:()=>{}});
  t.after(()=>{pointer.dispose();if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');});
  element.pointer('pointerdown', 10); element.pointer('pointerup', 11);
  element.pointer('pointerdown', 10); element.pointer('pointermove', 20); element.pointer('pointerup', 10);
  element.pointer('pointerdown', 10); element.pointer('pointercancel', 10); element.pointer('pointerup', 10);
  element.pointer('pointerdown', 10, {button:2}); element.pointer('pointerup', 10, {button:2});
  element.pointer('pointerdown', 10); enabled = false; element.pointer('pointerup', 10);
  assert.deepEqual(clicks, [11]); assert.equal(element.captures.size, 0);
});

test('stitches cross a flat crown in a straight line rather than following its circular rounds', () => {
  const base = buildGeometry(parsePattern('1: 6 sc in mr\n2: 6 inc\n3: [sc, inc] x6\n4: [2 sc, inc] x6'));
  const model = {...base,
    points: base.points.map(p => ({...p, position: [p.position[0], 0, p.position[2]] as [number,number,number]})),
    roundCenters: base.roundCenters.map(r => ({...r, center: [r.center[0], 0, r.center[2]] as [number,number,number]})),
  };
  for (const [from, to] of [[20,140], [350,10], [0,180]]) {
    const path = embroideryPath(model, {...segment, from: {round: 2.5, angle: from}, to: {round: 2.5, angle: to}});
    assert.ok(path.length > 2);
    path.forEach((point, index) => {
      const expected = path[0].clone().lerp(path.at(-1)!, index / (path.length - 1));
      assert.ok(point.distanceTo(expected) < 1e-8, 'a straight stitch must not bow sideways around a round');
    });
  }
});

test('rounded crown embroidery stays in the straight chord projection plane', () => {
  const model = buildGeometry(parsePattern(STARTER));
  const s = {...segment, from: {round: 2.5, angle: 25}, to: {round: 2.5, angle: 155}};
  const surface = embroiderySurface(model);
  const a = surface.sample(s.from)!, b = surface.sample(s.to)!;
  const chord = b.position.clone().sub(a.position).normalize();
  const outward = a.normal.clone().add(b.normal);
  outward.addScaledVector(chord, -outward.dot(chord)).normalize();
  const sideways = chord.clone().cross(outward).normalize();
  const path = embroideryPath(model, s);
  path.forEach((point, index) => {
    assert.ok(Math.abs(point.clone().sub(path[0]).dot(sideways)) < 1e-8);
    const expected = path[0].clone().lerp(path.at(-1)!, index / (path.length - 1));
    assert.ok(Math.abs(point.clone().sub(expected).dot(chord)) < 1e-8);
  });
});
