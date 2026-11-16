import { parsePattern } from './pattern';
import { parseEyeDirective, validateEyePair } from './safetyEyes';

export interface EyeTemplate {
  lowerRound:number;
  stitches:[number,number];
  sizeMm:number;
  stitchWidthMm:number;
}
export function safetyEyeCode(eyes:EyeTemplate):string {
  return `eyes between ${eyes.lowerRound} and ${eyes.lowerRound+1} at ${eyes.stitches[0]}, ${eyes.stitches[1]} size ${eyes.sizeMm}mm stitch ${eyes.stitchWidthMm}mm`;
}
/** One source edit for Add/Update, so the whole accessory is one undo step. */
export function saveSafetyEyeTemplate(source:string,eyes:EyeTemplate,editing?:{line:number;text:string}):string {
  const pattern=parsePattern(source);
  if(pattern.diagnostics.some(d=>d.severity==='error'))throw new Error('Fix the pattern errors before adding safety eyes.');
  if(!editing&&pattern.eyes.length>=16)throw new Error('Use at most 16 safety-eye pairs in a piece.');
  const directive=safetyEyeCode(eyes);
  const pair=parseEyeDirective(directive,1)!;
  const error=validateEyePair(pair,pattern.rounds);
  if(error)throw new Error(error);
  let next:string;
  if(editing){
    const lines=source.split(/\r?\n/);
    if(lines[editing.line-1]!==editing.text||!pattern.eyes.some(p=>p.line===editing.line))throw new Error('This eye pair changed. Close the dialog and open it again.');
    const comment=editing.text.indexOf('//');
    lines[editing.line-1]=directive+(comment<0?'':' '+editing.text.slice(comment));
    next=lines.join('\n');
  }else next=source.trimEnd()+'\n\n'+directive;
  if(next.length>120000)throw new Error('Keep the pattern under 120,000 characters.');
  return next;
}
