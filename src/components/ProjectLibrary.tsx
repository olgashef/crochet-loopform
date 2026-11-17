import { pieceName } from "../lib/pieceName";
import { useEffect, useState } from 'react';
import { Archive, Copy, FolderOpen, Plus, RotateCcw, Search, X } from 'lucide-react';
import { archiveProject, listProjects, saveLibraryProject, type LibraryEntry } from '../lib/projectLibrary';
import type { Project } from '../lib/studio';

interface Props {
  currentId: string;
  onClose(): void;
  onOpen(project: Project): Promise<void>;
  onNew(): Promise<void>;
  onImport(): void;
}
export function ProjectLibrary({currentId,onClose,onOpen,onNew,onImport}: Props) {
  const [entries,setEntries]=useState<LibraryEntry[]>([]), [query,setQuery]=useState('');
  const [archived,setArchived]=useState(false), [busy,setBusy]=useState(true), [error,setError]=useState('');
  async function refresh(){setEntries(await listProjects());}
  useEffect(()=>{refresh().catch(e=>setError(e.message)).finally(()=>setBusy(false));},[]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const visible=entries.filter(e=>e.archived===archived && `${e.project.name} ${e.project.pieces.map(pieceName).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-backdrop" onClick={onClose}><section className="modal project-library" role="dialog" aria-modal="true" aria-label="Project library" onClick={e=>e.stopPropagation()}>
    <button className="modal-close icon" aria-label="Close project library" onClick={onClose}><X size={18}/></button>
    <span className="eyebrow">YOUR CROCHET COLLECTION</span><h2>Project library</h2>
    <p>All your pieces, colors, accessories, and settings. Saved automatically in this browser on this device.</p>
    <div className="project-library-actions"><button className="primary" disabled={busy} onClick={()=>run(onNew)}><Plus size={16}/>New project</button><button disabled={busy} onClick={onImport}><FolderOpen size={16}/>Import project</button><button disabled={busy} onClick={()=>setArchived(!archived)}>{archived?'Active projects':'Archived projects'}</button></div>
    <label className="project-library-search"><Search size={16}/><input aria-label="Search projects" placeholder="Find a project or piece…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {error&&<p role="alert" className="library-error">{error}</p>}
    {busy&&<p role="status">Saving and loading projects…</p>}
    {!busy&&!visible.length&&<div className="library-empty"><FolderOpen/><h3>{query?'No matching projects':archived?'No archived projects':'Your next creation starts here'}</h3><p>{query?'Try a different name.':archived?'Archived projects stay here until you restore them.':'Create a project or import a Loopform backup.'}</p></div>}
    <div className="project-library-grid">{visible.map(entry=><article className="library-project" key={entry.id}>
      <div className="library-project-heading"><FolderOpen size={22}/><h3>{entry.project.name||'Untitled project'}</h3>{entry.id===currentId&&<small>Current</small>}</div>
      <p>{entry.project.pieces.length} {entry.project.pieces.length===1?'piece':'pieces'} · {entry.project.pieces.map(pieceName).join(', ')}</p>
      <time dateTime={new Date(entry.updatedAt).toISOString()}>Saved {new Date(entry.updatedAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</time>
      <div className="library-project-buttons">{archived?<button disabled={busy} onClick={()=>run(()=>archiveProject(entry.id,false))}><RotateCcw size={14}/>Restore</button>:<>
        <button className="primary" disabled={busy} aria-label={`Open ${entry.project.name}`} onClick={()=>run(()=>onOpen(entry.project))}>Open project</button>
        <button disabled={busy} aria-label={`Duplicate ${entry.project.name}`} onClick={()=>run(async()=>{await saveLibraryProject({...entry.project,id:crypto.randomUUID(),name:`${entry.project.name} copy`});})}><Copy size={14}/>Copy</button>
        <button disabled={busy||entry.id===currentId} title={entry.id===currentId?'Open another project before archiving this one':'Move to archive'} aria-label={`Archive ${entry.project.name}`} onClick={()=>run(()=>archiveProject(entry.id,true))}><Archive size={14}/></button>
      </>}</div>
    </article>)}</div>
    <p className="help-note">Use Export → Loopform project for a portable backup you can open on another device.</p>
  </section></div>;
}
