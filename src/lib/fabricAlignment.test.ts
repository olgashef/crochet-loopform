import assert from 'node:assert/strict';
import test from 'node:test';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { parsePattern } from './pattern';
import { buildGeometry } from './geometry';
import { createFabricGeometry } from './fabricGeometry';
import { buildStitchFrames } from './stitchFrame';
import { courseGrowth } from './courseGrowth';

// The clustered increases from the elephant screenshot, followed by a closed
// shoulder. Inspect the underside too: a radial-only inset fails on that slope.
const elephant = `Round 1: 8sc in mr
Round 2: 8inc
Round 3: (sc, inc)x8
Round 4: 9sc, 6inc, 9sc
Round 5: 10sc, 3inc, 4sc, 3inc, 10sc
Round 6: 11sc, 3inc, 8sc, 3inc, 11sc
Round 7: 18sc, 6inc, 18sc
Round 8–12: sc around
Round 13: (6sc, dec)x6
Round 14: (5sc, dec)x6
Round 15: (4sc, dec)x6
Round 16: (3sc, dec)x6
Round 17: (2sc, dec)x6
Round 18: (sc, dec)x6
Round 19: 6dec`;

test('asymmetric yarn faces the actual fabric and its backing stays beneath every course', () => {
  for (const orientation of ['bottom-up', 'top-down']) {
    const model = buildGeometry(parsePattern(`orientation ${orientation}\n${elephant}`));
    const frames = buildStitchFrames(model.points, .25, true, model.roundCenters);
    const geometry = createFabricGeometry(model, Infinity, .15);
    const material = new MeshBasicMaterial({side: DoubleSide});
    const mesh = new Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const ray = new Raycaster();
    for (const point of model.points) {
      const frame = frames.get(point.id)!;
      const normal = new Vector3(0, 0, 1).applyQuaternion(frame.rotation);
      const axis = new Vector3(0, 1, 0).applyQuaternion(frame.rotation);
      assert.ok(Math.abs(axis.dot(normal)) < 1e-8);
      ray.set(frame.position.clone().addScaledVector(normal, 1), normal.clone().negate());
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, `round ${point.round}, stitch ${point.index}: missing backing`);
      assert.ok(hit.distance > 1.1 && hit.distance < 1.22,
        `round ${point.round}, stitch ${point.index}: backing must lie inward along the yarn normal`);
    }
    geometry.dispose();
    material.dispose();
  }
});

test('local course spacing sizes the loops on both sides of an asymmetric bulge', () => {
  const model = buildGeometry(parsePattern(elephant));
  const frames = buildStitchFrames(model.points, .25, true, model.roundCenters);
  const ring = model.points.filter(p => p.round === 4);
  const heights = ring.map(p => frames.get(p.id)!.scale.y);
  assert.ok(Math.max(...heights) - Math.min(...heights) > .15,
    'the outer and inner sides cannot use the same average circular gauge');
  for (const p of model.points) {
    const f = frames.get(p.id)!;
    assert.ok(f.scale.y < 1.65, 'a single SC must not stretch across a torn course');
  }
});

test('closed backing has no cracks where adjacent rounds change stitch counts', () => {
  const geometry = createFabricGeometry(buildGeometry(parsePattern(elephant)));
  const vertices = geometry.getAttribute('position');
  const edges = new Map<string, number>();
  const key = (i: number) => [vertices.getX(i), vertices.getY(i), vertices.getZ(i)].map(n => n.toFixed(5)).join(',');
  for (let i = 0; i < vertices.count; i += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const edge = [key(i + corner), key(i + (corner + 1) % 3)].sort().join('|');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'each fabric edge must meet exactly two triangles');
  geometry.dispose();
});

test('concentrated increases cannot add an unbounded sideways step or radial lobe', () => {
  const pattern = parsePattern('Round 1: 120sc in mr\nRound 2: 60inc, 60sc');
  const angles = new Map(pattern.rounds[0].stitches.map((p, i) => [p.id, i * Math.PI / 60]));
  const growth = courseGrowth(pattern.rounds[1].stitches, angles, .9, .92);
  assert.ok(Math.hypot(...growth.shift) <= .92 * .3 + 1e-8);
  assert.ok(growth.outline.reduce((sum, mode) => sum + Math.hypot(mode.cosine, mode.sine), 0) <= .92 * .25 + 1e-8);
});
