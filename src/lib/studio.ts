import { validPlacement, type PiecePlacement } from './assembly';
import { EXAMPLES } from './pattern';
import { sanitizeRowOffsets, type RowOffsets } from './rowOffsets';
export interface Piece { id: string; name: string; source: string; rowOffsets: RowOffsets; placement?: PiecePlacement; hidden?: boolean }
export interface Project { version: 2; name: string; pieces: Piece[]; activeId: string }
export const STARTER = `Pattern name: "Honey bear"
start: magic ring
orientation top-down

// Crown · increase evenly
[#cba477]
Round 1: 6 sc in mr → 6
Round 2: 6 inc → 12
Round 3: (sc, inc) x6 → 18
Round 4: (2 sc, inc) x6 → 24
Round 5: (3 sc, inc) x6 → 30
Round 6: (4 sc, inc) x6 → 36

// Shape the face
Round 7-12: 36 sc → 36
Round 13: (4 sc, dec) x6 → 30
Round 14: (3 sc, dec) x6 → 24
Round 15: (2 sc, dec) x6 → 18
Round 16: (sc, dec) x6 → 12
Round 17: 6 dec → 6

eyes between 8 and 9 at 15, 22 size 0.8
fasten off

paint 9: 17=#f3e8d6, 18=#f3e8d6, 19=#f3e8d6, 20=#f3e8d6
paint 10: 16=#f3e8d6, 17=#f3e8d6, 18=#f3e8d6, 19=#f3e8d6, 20=#f3e8d6, 21=#f3e8d6
paint 11: 17=#f3e8d6, 18=#f3e8d6, 19=#f3e8d6, 20=#f3e8d6`;
export const STUDIO_EXAMPLES = [
  { name: 'Honey bear', description: 'A rounded head with a cream muzzle', source: STARTER },
  { name: 'Little bee', description: 'Learn shaping and striped colorwork', source: `Pattern name: "Little bee"
start: magic ring
[#e9bb4e]
Round 1: 6 sc in mr → 6
Round 2: 6 inc → 12
Round 3: (sc, inc) x6 → 18
Round 4: (2 sc, inc) x6 → 24
Round 5-6: 24 sc → 24
[#423b40]
Round 7-8: 24 sc → 24
[#e9bb4e]
Round 9-10: 24 sc → 24
[#423b40]
Round 11-12: 24 sc → 24
[#e9bb4e]
Round 13: (2 sc, dec) x6 → 18
Round 14: (sc, dec) x6 → 12
Round 15: 6 dec → 6
fasten off` },
  ...EXAMPLES,
];
export const newPiece = (name = 'Main piece', source = STARTER): Piece => ({ id: crypto.randomUUID(), name, source, rowOffsets: {} });
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readSaved(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}
export function initialProject(): Project {
  const saved = readSaved('loopform.studio.v2');
  // Recover valid pattern text even if a stale or damaged shape edit was saved.
  if (isRecord(saved) && Array.isArray(saved.pieces)) {
    const restored = { ...saved, pieces: saved.pieces.map(piece => isRecord(piece)
      ? { ...piece, rowOffsets: sanitizeRowOffsets(piece.rowOffsets) } : piece) };
    if (validProject(restored)) return restored;
  }
  // A malformed newer save must not prevent recovery of the older workspace.
  const old = readSaved('loopform.workspace.v1');
  if (isRecord(old) && typeof old.source === 'string' && old.source.length <= 120000) {
    const piece = newPiece('Main piece', old.source);
    piece.rowOffsets = sanitizeRowOffsets(old.rowOffsets);
    return { version: 2, name: 'My Loopform project', pieces: [piece], activeId: piece.id };
  }
  const piece = newPiece();
  return { version: 2, name: 'Honey bear', pieces: [piece], activeId: piece.id };
}
export function validProject(value: unknown): value is Project {
  if (!isRecord(value) || value.version !== 2 || typeof value.name !== 'string' || typeof value.activeId !== 'string'
    || !Array.isArray(value.pieces) || value.pieces.length < 1 || value.pieces.length > 30) return false;
  const ids = new Set<string>();
  for (const piece of value.pieces) {
    if (!isRecord(piece) || typeof piece.id !== 'string' || !piece.id || ids.has(piece.id)
      || typeof piece.name !== 'string' || typeof piece.source !== 'string' || piece.source.length > 120000
      || !isRecord(piece.rowOffsets)) return false;
    if (!Object.entries(piece.rowOffsets).every(([row, offset]) => /^\d+$/.test(row)
      && Number(row) >= 1 && Number(row) <= 150 && typeof offset === 'number'
      && Number.isFinite(offset) && Math.abs(offset) <= 1000)) return false;
    if (piece.placement !== undefined && !validPlacement(piece.placement)) return false;
    if (piece.hidden !== undefined && typeof piece.hidden !== 'boolean') return false;
    ids.add(piece.id);
  }
  const mainId = value.pieces[0].id;
  for (const piece of value.pieces) {
    if (piece.placement?.parentId && (piece.id === mainId || piece.placement.parentId !== mainId)) return false;
    if (piece.placement?.anchor && !piece.placement.parentId) return false;
    if (piece.placement && (piece.id === mainId || piece.placement.parentId) && (piece.placement.scale < .1 || piece.placement.scale > 5)) return false;
  }
  return ids.has(value.activeId);
}
export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
