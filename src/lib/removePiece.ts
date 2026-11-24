import type {Project} from './studio';

/** Remove a piece without allowing make: to recreate the deleted instance. */
export function removePiece(project:Project,id:string):Project {
  const target=project.pieces.find(p=>p.id===id);
  if(!target||id===project.pieces[0]?.id)return project;
  const removed=new Set(project.pieces.filter(p=>p.id===id||p.templateId===id).map(p=>p.id));
  let pieces=project.pieces.filter(p=>!removed.has(p.id));
  if(target.templateId){
    const count=pieces.filter(p=>p.id===target.templateId||p.templateId===target.templateId).length;
    pieces=pieces.map(p=>p.id===target.templateId||p.templateId===target.templateId?{...p,source:p.source.replace(/^([ \t]*make:\s*)\d+/im,`$1${count}`)}:p);
  }
  return {...project,pieces,activeId:removed.has(project.activeId)?pieces[0].id:project.activeId};
}
