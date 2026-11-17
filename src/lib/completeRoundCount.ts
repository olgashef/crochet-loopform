import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { analyzeInstruction, readRoundLine } from './pattern';
import { stripWrittenCount } from './worksheet';

/** Use the same stitch semantics as the preview; branches do not add body stitches. */
export function completeRoundCount(editor: {state: EditorState; dispatch(spec: TransactionSpec): void}): boolean {
  const {state}=editor;
  if(state.selection.ranges.length!==1 || !state.selection.main.empty)return false;
  const line=state.doc.lineAt(state.selection.main.head);
  if(!readRoundLine(line.text))return false;
  let previousCount: number | undefined;
  for(let number=1;number<line.number;number++) {
    const previous=readRoundLine(state.doc.line(number).text);
    if(!previous)continue;
    try {previousCount=analyzeInstruction(stripWrittenCount(previous.instruction),previousCount).outputCount;}
    catch {previousCount=undefined;}
  }
  const commentIndex=line.text.indexOf('//');
  const code=commentIndex<0?line.text:line.text.slice(0,commentIndex);
  const comment=commentIndex<0?'':` ${line.text.slice(commentIndex)}`;
  // Also complete a manually typed arrow without its number.
  const clean=stripWrittenCount(code).replace(/\s*→\s*$/, '').trimEnd();
  const round=readRoundLine(clean)!;
  try {
    const count=analyzeInstruction(round.instruction,previousCount).outputCount;
    const completed=`${clean} → ${count}`;
    editor.dispatch({
      changes:{from:line.from,to:line.to,insert:completed+comment},
      selection:EditorSelection.cursor(line.from+completed.length),
      userEvent:'input.complete',
      scrollIntoView:true,
    });
  } catch {
    // Keep incomplete instructions untouched; their parser diagnostics remain visible.
  }
  return true;
}
