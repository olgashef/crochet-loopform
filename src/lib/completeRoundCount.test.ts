import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, Transaction, type TransactionSpec } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { completeRoundCount } from './completeRoundCount';

function editor(doc: string, cursor=doc.length) {
  const view = {
    state:EditorState.create({doc,selection:{anchor:cursor},extensions:[history()]}),
    dispatch: (spec:TransactionSpec | Transaction) => {view.state=spec instanceof Transaction?spec.state:view.state.update(spec).state;},
  };
  return view;
}
test('Tab counts repeats and colors and replaces stale totals in one undoable edit',()=>{
  const source='Round 1: 6sc in mr → 6\nRound 2 [#EAC79A]: (sc, inc) x3 → 99';
  const view=editor(source);
  assert.equal(completeRoundCount(view),true);
  assert.equal(view.state.doc.toString(),source.replace('→ 99','→ 9'));
  assert.equal(undo(view),true);
  assert.equal(view.state.doc.toString(),source);
});
test('around uses the preceding round; counts remain before inline comments',()=>{
  const view=editor('Round 1: 6sc in mr\nRound 2: 6inc\nRound 3–5: sc around // keep going');
  completeRoundCount(view);
  assert.equal(view.state.doc.line(3).text,'Round 3–5: sc around → 12 // keep going');
  assert.equal(view.state.selection.main.head,view.state.doc.toString().indexOf(' //'));
  completeRoundCount(view);
  assert.equal(view.state.doc.line(3).text,'Round 3–5: sc around → 12 // keep going');
});
test('completes the cursor round without changing other lines or counting branch stitches',()=>{
  const source='Rnd 1: 6sc in mr\nRnd 2: branch(4 ch, 3 slst), 6sc (99)\nfasten off';
  const view=editor(source,source.indexOf('branch'));
  completeRoundCount(view);
  assert.equal(view.state.doc.toString(),source.replace('(99)','→ 6'));
});
test('supports a bare arrow and same-stitch groups',()=>{
  const view=editor('Round 1: [sc, sc] in same st, 4sc → ');
  completeRoundCount(view);
  assert.equal(view.state.doc.toString(),'Round 1: [sc, sc] in same st, 4sc → 6');
});
test('unfinished instructions and unknown around counts are left intact',()=>{
  for(const source of ['Round 1: sc around','Round 2: (sc, inc','Round 2:']) {
    const view=editor(source);completeRoundCount(view);
    assert.equal(view.state.doc.toString(),source);
  }
  const view=editor('// a note');
  assert.equal(completeRoundCount(view),false);
});
