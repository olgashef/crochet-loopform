import test from 'node:test';
import assert from 'node:assert/strict';
import { moveWorksheetRow } from './worksheet';
const source='Pattern name: "Paw"\nRound 1: 6sc in mr\nRound 2: 6inc\nRound 3: 12sc\nRound 4: 6dec // decrease\nfasten off';
test('moves a decrease above or below an adjacent round and renumbers',()=>{
  const up=moveWorksheetRow(source,5,4);
  assert.equal(up,'Pattern name: "Paw"\nRnd 1: 6sc in mr\nRnd 2: 6inc\nRnd 3: 6dec // decrease\nRnd 4: 12sc\nfasten off');
  const down=moveWorksheetRow(up,4,5,true);
  assert.ok(down.includes('Rnd 3: 12sc\nRnd 4: 6dec // decrease'));
});
test('preserves grouped duration and colors and keeps unrelated directives',()=>{
  const text='edge: open\nRound 1: 6sc in mr\nRound 2–4: [red] 6sc\nRound 5: [white] 3dec\neyes between 1 and 2 at 2, 4 size 8mm stitch 5mm';
  const moved=moveWorksheetRow(text,4,3);
  assert.ok(moved.includes('Rnd 2: [white] 3dec\nRnd 3–5: [red] 6sc for 3 rounds'));
  assert.ok(moved.startsWith('edge: open'));
  assert.ok(moved.endsWith('eyes between 1 and 2 at 2, 4 size 8mm stitch 5mm'));
});
test('self drops, invalid targets, and drops already in position do nothing',()=>{
  assert.equal(moveWorksheetRow(source,4,4),source);
  assert.equal(moveWorksheetRow(source,4,1),source);
  assert.equal(moveWorksheetRow(source,4,5),source);
});
