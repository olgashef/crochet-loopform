import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { analyzeInstruction, readRoundLine, parsePattern } from './pattern';
import { stripWrittenCount } from './worksheet';

/** Use the same stitch semantics as the preview; branches do not add body stitches. */
export function completeRoundCount(editor: {state: EditorState; dispatch(spec: TransactionSpec): void}): boolean {
  const {state}=editor;
  if(state.selection.ranges.length!==1 || !state.selection.main.empty)return false;
  const line=state.doc.lineAt(state.selection.main.head);
  if(!readRoundLine(line.text))return false;
  let previousCount: number | undefined;
  const prefix=parsePattern(state.doc.sliceString(0,line.from));
  const chain=prefix.chainStart;
  if(chain)previousCount=chain.stitches.length-(prefix.joinedStart?0:1);
  for(let number=1;number<line.number;number++) {
    const previous=readRoundLine(state.doc.line(number).text);
    if(!previous)continue;
    try {previousCount=analyzeInstruction(stripWrittenCount(previous.instruction),previousCount,previous.kind==='row').outputCount;}
    catch {previousCount=undefined;}
  }
  const commentIndex=line.text.indexOf('//');
  const code=commentIndex<0?line.text:line.text.slice(0,commentIndex);
  const comment=commentIndex<0?'':` ${line.text.slice(commentIndex)}`;
  // Also complete a manually typed arrow without its number.
  const clean=stripWrittenCount(code).replace(/\s*→\s*$/, '').trimEnd();
  const round=readRoundLine(clean)!;
  try {
    const reference=/(?:BLO|FLO)\s+of\s+Round\s+(\d+)/i.exec(round.instruction);
    if(reference)previousCount=prefix.rounds.find(r=>r.number===Number(reference[1]))?.outputCount;
    if(!prefix.rounds.length&&chain&&round.kind==='row') {
      const hook=/in\s+(\d+)(?:nd|rd|th)\s+ch\s+from\s+hook/i.exec(round.instruction);
      const type=/\b(dtr|tr|dc|hdc|sc)\b/.exec(round.instruction)?.[1]??'sc';
      const skip=hook?Number(hook[1])-1:({hdc:2,dc:3,tr:4,dtr:5} as Record<string,number>)[type]??1;
      previousCount=chain.stitches.length-skip;
    }
    const count=analyzeInstruction(round.instruction,previousCount,round.kind==='row').outputCount;
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
