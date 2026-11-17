import type { Project } from './studio';

/** Selection belongs to each tab; only shared document changes trigger writes. */
export function projectContentKey(project: Project): string {
  return JSON.stringify({id:project.id,settings:project.settings,version:project.version,name:project.name,pieces:project.pieces});
}
export function receiveProject(current: Project, incoming: Project): Project {
  if (current.id && incoming.id && current.id !== incoming.id) return current;
  if(projectContentKey(current)===projectContentKey(incoming))return current;
  return {...incoming,activeId:incoming.pieces.some(p=>p.id===current.activeId)?current.activeId:incoming.activeId};
}

/** A remote snapshot must never replace an in-progress local edit or echo a saved one. */
export function canReceiveProject(current: Project, incoming: Project, savedKey: string | null, dragging: boolean): boolean {
  if(dragging || current.id!==incoming.id)return false;
  const currentKey=projectContentKey(current);
  return currentKey===savedKey && projectContentKey(incoming)!==savedKey;
}
