import type { Project } from './studio';

/** Selection belongs to each tab; only shared document changes trigger writes. */
export function projectContentKey(project: Project): string {
  return JSON.stringify({version:project.version,name:project.name,pieces:project.pieces});
}
export function receiveProject(current: Project, incoming: Project): Project {
  if(projectContentKey(current)===projectContentKey(incoming))return current;
  return {...incoming,activeId:incoming.pieces.some(p=>p.id===current.activeId)?current.activeId:incoming.activeId};
}
