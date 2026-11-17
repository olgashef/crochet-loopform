import { validProject, type Project } from './studio';

export interface ProjectSettings {
  view: '3d' | 'chart' | 'assembly';
  backdrop: 'dark' | 'light';
  editorMode: 'code' | 'rounds';
  mode: 'stitches' | 'structure';
  roundLimit: number;
  thickness: number;
  color: string;
  threadWeight: 'embroidery' | 'dk' | 'bulky';
  threadColor: string;
  libraryOpen: boolean;
}
export const DEFAULT_SETTINGS: ProjectSettings = {
  view: '3d', backdrop: 'dark', editorMode: 'code', mode: 'stitches', roundLimit: 150,
  thickness: 1, color: '#f3e8d6', threadWeight: 'embroidery', threadColor: '#303431', libraryOpen: true,
};
export function projectSettings(value: unknown): ProjectSettings {
  const s = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const pick = <T extends string>(key: string, values: T[], fallback: T): T => values.includes(s[key] as T) ? s[key] as T : fallback;
  const hex = (key: string, fallback: string) => typeof s[key] === 'string' && /^#[a-f0-9]{6}$/i.test(s[key]) ? s[key] as string : fallback;
  return {
    view: pick('view', ['3d','chart','assembly'], '3d'), backdrop: pick('backdrop',['dark','light'],'dark'),
    editorMode: pick('editorMode',['code','rounds'],'code'), mode: pick('mode',['stitches','structure'],'stitches'),
    roundLimit: typeof s.roundLimit === 'number' && Number.isFinite(s.roundLimit) ? Math.max(1,Math.min(150,Math.round(s.roundLimit))) : 150,
    thickness: typeof s.thickness === 'number' && Number.isFinite(s.thickness) ? Math.max(.7,Math.min(1.4,s.thickness)) : 1,
    color: hex('color',DEFAULT_SETTINGS.color), threadColor: hex('threadColor',DEFAULT_SETTINGS.threadColor),
    threadWeight: pick('threadWeight',['embroidery','dk','bulky'],'embroidery'),
    libraryOpen: typeof s.libraryOpen === 'boolean' ? s.libraryOpen : true,
  };
}
export interface LibraryEntry { id: string; project: Project; createdAt: number; updatedAt: number; archived: boolean }
export function libraryEntry(project: Project, previous?: LibraryEntry, now = Date.now()): LibraryEntry {
  if (!validProject(project) || !project.id) throw new Error('This project cannot be saved.');
  return {id:project.id, project:structuredClone({...project,settings:projectSettings(project.settings)}),
    createdAt:previous?.createdAt ?? now, updatedAt:now, archived:previous?.archived ?? false};
}
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve,reject) => {
    const request = indexedDB.open('loopform-projects',1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects',{keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {database=undefined;reject(new Error('Project library storage is unavailable. Export a backup to keep your work.'));};
  });
  return database;
}
export async function listProjects(): Promise<LibraryEntry[]> {
  const database = await db();
  return new Promise((resolve,reject) => {
    const request = database.transaction('projects').objectStore('projects').getAll();
    request.onsuccess = () => resolve((request.result as LibraryEntry[]).filter(e=>validProject(e.project)).sort((a,b)=>b.updatedAt-a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}
export async function saveLibraryProject(project: Project): Promise<void> {
  const database = await db();
  return new Promise((resolve,reject) => {
    const tx = database.transaction('projects','readwrite'), store = tx.objectStore('projects');
    const get = store.get(project.id!);
    get.onsuccess = () => { try { store.put(libraryEntry(project,get.result)); } catch { tx.abort(); } };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error('Could not save to the project library. Export a backup and try again.'));
  });
}
export async function archiveProject(id: string, archived: boolean): Promise<void> {
  const database = await db();
  return new Promise((resolve,reject) => {
    const tx=database.transaction('projects','readwrite'), store=tx.objectStore('projects'), get=store.get(id);
    get.onsuccess=()=>{if(get.result)store.put({...get.result,archived});};
    tx.oncomplete=()=>resolve(); tx.onabort=tx.onerror=()=>reject(new Error('Could not update this project.'));
  });
}
