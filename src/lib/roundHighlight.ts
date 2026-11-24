import { Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { ModelPoint } from './geometry';
import type { ParsedPattern } from './pattern';

export function roundsForSourceLine(pattern: ParsedPattern, line: number | null): number[] {
  return line === null ? [] : pattern.chainStart?.line===line?[0]:pattern.rounds.filter(round => round.line === line).map(round => round.number);
}

export interface HighlightInstances {
  mesh: InstancedMesh | null;
  points: ModelPoint[];
}

/** A temporary overlay; source yarn colors, picking, and geometry stay intact. */
export function createRoundHighlight(rounds: readonly number[], layers: HighlightInstances[]): Group {
  const group = new Group();
  group.name = 'active-round-highlight';
  if (!rounds.length) return group;
  const selected = new Set(rounds);
  for (const {mesh, points} of layers) {
    if (!mesh) continue;
    const indices = points.flatMap((p, index) => selected.has(p.round) && index < mesh.count ? [index] : []);
    if (!indices.length) continue;
    const material = new MeshBasicMaterial({
      color: '#d3a1ff', transparent: true, opacity: .85,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      polygonOffsetUnits: -1, toneMapped: false,
    });
    const overlay = new InstancedMesh(mesh.geometry.clone(), material, indices.length);
    const matrix = new Matrix4(), expansion = new Vector3(1.045, 1.045, 1.045);
    const morphCarrier = mesh.morphTexture ? new Mesh(overlay.geometry, material) : null;
    indices.forEach((index, i) => {
      if (morphCarrier) {
        mesh.getMorphAt(index, morphCarrier);
        overlay.setMorphAt(i, morphCarrier);
      }
      mesh.getMatrixAt(index, matrix);
      overlay.setMatrixAt(i, matrix.scale(expansion));
    });
    if (overlay.morphTexture) overlay.morphTexture.needsUpdate = true;
    overlay.instanceMatrix.needsUpdate = true;
    overlay.computeBoundingSphere();
    overlay.renderOrder = 2;
    overlay.raycast = () => {}; // Inspecting/painting must hit the real stitches.
    group.add(overlay);
  }
  return group;
}
