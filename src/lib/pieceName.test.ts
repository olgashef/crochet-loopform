import test from 'node:test';
import assert from 'node:assert/strict';
import { pieceName, setPieceName } from './pieceName';
import { parsePattern } from './pattern';

test('explicit pattern titles replace legacy labels while untitled pieces retain their names',()=>{
  assert.equal(pieceName({name:'Piece 2',source:'Pattern name: "Left ear"\nRound 1: 4sc in mr'}),'Left ear');
  assert.equal(pieceName({name:'Piece 2',source:'// Pattern name: "Not a title"\nRound 1: 4sc in mr'}),'Piece 2');
  assert.equal(pieceName({name:'Piece 2',source:'Pattern name: ""'}),'Piece 2');
});
test('renaming and duplicating update the pattern title without altering stitches',()=>{
  const source='Pattern name: "Ear" // a note\nRound 1: 4sc in mr → 4';
  const renamed=setPieceName(source,'Ear copy');
  assert.equal(pieceName({source:renamed,name:'Old label'}),'Ear copy');
  assert.equal(parsePattern(renamed).name,'Ear copy');
  assert.deepEqual(parsePattern(renamed).stitches,parsePattern(source).stitches);
  assert.ok(renamed.includes('// a note'));
  assert.equal(setPieceName('Round 1: 4sc in mr','Nose'),'Pattern name: "Nose"\nRound 1: 4sc in mr');
});
