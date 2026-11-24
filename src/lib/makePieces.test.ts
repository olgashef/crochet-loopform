import test from 'node:test';
import assert from 'node:assert/strict';
import { makePieces } from './makePieces';
import { parsePattern } from './pattern';
import { validProject, type Project } from './studio';
import { identityPlacement } from './assembly';
const source='edge: open\nmake: 4\nPattern name: "Paws"\nRound 1: 6sc in mr';
const project:Project={version:2,activeId:'p',name:'Cat',pieces:[{id:'p',name:'Piece',source,rowOffsets:{}}]};
test('make creates four persistent matching instances without multiplying stitches',()=>{
  assert.equal(parsePattern(source).make,4);
  assert.equal(parsePattern(source).stitches.length,6);
  const made=makePieces(project);
  assert.equal(made.pieces.length,4);assert.ok(validProject(made));
  assert.deepEqual(makePieces(JSON.parse(JSON.stringify(made))),made);
  made.pieces[1].placement={...identityPlacement(),position:[2,3,4]};
  made.activeId=made.pieces[1].id;
  made.pieces[1].source=source.replace('6sc','7sc');
  const edited=makePieces(made);
  assert.ok(edited.pieces.every(p=>p.source.includes('7sc')));
  assert.deepEqual(edited.pieces[1].placement,made.pieces[1].placement);
});
test('changing quantity preserves surviving placements and unfinished make keeps copies',()=>{
  const made=makePieces(project);
  made.pieces[0].source=source.replace('make: 4','make:');
  assert.equal(makePieces(made).pieces.length,4);
  made.pieces[0].source=source.replace('make: 4','make: 2');
  assert.equal(makePieces(made).pieces.length,2);
  assert.ok(parsePattern(source.replace('make: 4','make: 100')).diagnostics.some(d=>d.severity==='error'));
});
