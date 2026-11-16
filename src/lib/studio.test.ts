import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { initialProject, STARTER, validProject, type Project } from './studio';

function project(): Project {
  return { version: 2, name: 'Saved bear', activeId: 'head', pieces: [
    { id: 'head', name: 'Head', source: STARTER, rowOffsets: { 3: 1.5 } },
    { id: 'ear', name: 'Ear', source: 'Round 1: 6 sc in mr → 6', rowOffsets: {} },
  ] };
}
function storage(t: TestContext, values: Record<string, string>, unavailable = false) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => {
      if (unavailable) throw new Error('Storage is unavailable');
      return values[key] ?? null;
    },
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
}

test('project validation rejects malformed imports without throwing', () => {
  assert.equal(validProject(project()), true);
  for (const value of [null, [], {}, { ...project(), pieces: [null] },
    { ...project(), pieces: [false] }, { ...project(), pieces: [] },
    { ...project(), pieces: Array(31).fill(project().pieces[0]) },
    { ...project(), pieces: [project().pieces[0], project().pieces[0]] },
    { ...project(), activeId: 'missing' },
    { ...project(), pieces: [{ ...project().pieces[0], rowOffsets: [] }] },
    { ...project(), pieces: [{ ...project().pieces[0], rowOffsets: { 1: '2' } }] },
    { ...project(), pieces: [{ ...project().pieces[0], rowOffsets: { 1: Infinity } }] },
    { ...project(), pieces: [{ ...project().pieces[0], source: 'x'.repeat(120001) }] },
  ]) assert.equal(validProject(value), false);
});

test('saved projects restore all pieces, active tab, colors, and shape edits', t => {
  const saved = project();
  saved.activeId = 'ear';
  storage(t, { 'loopform.studio.v2': JSON.stringify(saved) });
  assert.deepEqual(initialProject(), saved);
});

test('restoring a saved project removes malformed offsets without losing its pattern', t => {
  const saved = project();
  storage(t, { 'loopform.studio.v2': JSON.stringify({ ...saved, pieces: [
    { ...saved.pieces[0], rowOffsets: { 3: 1.5, 4: '200', 5: 1001, 151: 2 } },
    { ...saved.pieces[1], rowOffsets: null },
  ] }) });
  assert.deepEqual(initialProject(), saved);
});

test('a corrupted new save still recovers and sanitizes the legacy workspace', t => {
  storage(t, {
    'loopform.studio.v2': '{broken json',
    'loopform.workspace.v1': JSON.stringify({ source: STARTER, rowOffsets: { 2: -1, 3: 'bad', 151: 2 } }),
  });
  const restored = initialProject();
  assert.equal(restored.pieces[0].source, STARTER);
  assert.deepEqual(restored.pieces[0].rowOffsets, { 2: -1 });
  assert.equal(validProject(restored), true);
});

test('unavailable browser storage starts a usable fresh project', t => {
  storage(t, {}, true);
  const fresh = initialProject();
  assert.equal(fresh.pieces[0].source, STARTER);
  assert.equal(validProject(fresh), true);
});
