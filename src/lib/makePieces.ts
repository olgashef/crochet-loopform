import { parsePattern } from './pattern';
import { pieceName } from './pieceName';
import type { Project, Piece } from './studio';

/** Materialize repeat instances while retaining each one's identity and placement. */
export function makePieces(project: Project): Project {
  const active=project.pieces.find(p=>p.id===project.activeId);
  const templates=project.pieces.filter(p=>!p.templateId).map(p=>active?.templateId===p.id?{...p,source:active.source}:p);
  const pieces: Piece[]=[];
  for(const template of templates) {
    const name=pieceName(template);
    pieces.push({...template,name});
    const parsed=parsePattern(template.source);
    const existing=project.pieces.filter(p=>p.templateId===template.id);
    // An unfinished directive must not delete positioned copies while typing.
    const invalid=parsed.diagnostics.some(d=>/^Use make:/.test(d.message));
    const count=invalid?existing.length+1:parsed.make??1;
    const available=30-templates.length-(pieces.length-templates.indexOf(template)-1);
    for(let i=0;i<Math.min(count-1,available);i++) {
      const previous=existing[i];
      pieces.push({...previous,id:previous?.id??crypto.randomUUID(),templateId:template.id,
        name:`${name} ${i+2}`,source:template.source,rowOffsets:previous?.rowOffsets??{...template.rowOffsets}});
    }
  }
  const activeId=pieces.some(p=>p.id===project.activeId)?project.activeId:active?.templateId??pieces[0].id;
  return {...project,pieces,activeId};
}
