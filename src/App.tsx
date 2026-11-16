import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, BookOpen, Box, Check, CheckCircle2, ChevronDown, CircleHelp, Copy, Download, Focus, FolderOpen, Grid2X2, Layers3, Maximize2, Minus, MousePointer2, MoveVertical, Paintbrush, Pause, Play, Plus, Redo2, RotateCcw, Scissors, Search, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { StitchChart } from './components/StitchChart';
import { migratePatternColors } from './lib/patternColors';
import { YarnPalette, type ColorTool } from './components/YarnPalette';
import { PatternEditor } from './components/PatternEditor';
import { PatternWorksheet } from './components/PatternWorksheet';
import { AssemblyViewer, type AssemblyTool } from './components/AssemblyViewer';
import { AssemblyControls } from './components/AssemblyControls';
import { detachPlacement, earPattern, findAnchor, identityPlacement, stagedPlacement, type PiecePlacement } from './lib/assembly';
import { ModelViewer, type ViewerHandle } from './components/ModelViewer';
import { SafetyEyeControls } from './components/SafetyEyeControls';
import { SafetyEyesDialog } from './components/SafetyEyesDialog';
import type { SafetyEyePair } from './lib/safetyEyes';
import { buildGeometry } from './lib/geometry';
import { parsePattern } from './lib/pattern';
import { projectContentKey, receiveProject } from './lib/projectSync';
import { colorSelection, paintStitches, type ColorScope } from './lib/colorwork';
import { download, initialProject, newPiece, STUDIO_EXAMPLES, validProject, type Project } from './lib/studio';
import { setPatternOrientation, type PatternOrientation } from './lib/orientation';
import { offsetRows, sanitizeRowOffsets } from './lib/rowOffsets';
import { EmbroideryControls } from './components/EmbroideryControls';
import { embroideryCode, MAX_EMBROIDERY, type EmbroideryAnchor, type ThreadWeight } from './lib/embroidery';

const LIBRARY = [
  { symbol:'◎', name:'Magic ring', code:'6 sc in mr', detail:'Start a closed piece in the round', group:'Starting & shaping' },
  { symbol:'∨', name:'Increase', code:'inc', detail:'2 stitches into the same stitch', group:'Starting & shaping' },
  { symbol:'∧', name:'Decrease', code:'dec', detail:'Join 2 stitches into one', group:'Starting & shaping' },
  { symbol:'×', name:'Single crochet', code:'sc', detail:'The foundation of amigurumi', group:'Essential stitches' },
  { symbol:'┬', name:'Half double crochet', code:'hdc', detail:'A little more height and texture', group:'Essential stitches' },
  { symbol:'Ŧ', name:'Double crochet', code:'dc', detail:'A taller, open stitch', group:'Essential stitches' },
  { symbol:'ǂ', name:'Treble crochet', code:'tr', detail:'An extra tall yarn post', group:'Essential stitches' },
  { symbol:'○', name:'Chain', code:'ch', detail:'A foundation loop', group:'Essential stitches' },
  { symbol:'•', name:'Slip stitch', code:'slst', detail:'A compact joining stitch', group:'Essential stitches' },
  { symbol:'♧', name:'Bobble', code:'bobble', detail:'A raised cluster for soft texture', group:'Texture' },
  { symbol:'╱', name:'Embroidery', code:'embroider', detail:'Draw eyes, a nose, or yarn details', group:'Accessories' },
  { symbol:'● ●', name:'Safety eyes', code:'eyes', detail:'Choose placement and size in mm', group:'Accessories' },
];
const PALETTE = ['#f3e8d6','#cba477','#9a674a','#493a37','#e9bb4e','#d87b55','#dc969c','#a291bc','#8aa58b','#5c8580','#799cb5','#efefea'];
function normalizeColors(project: Project): Project {
  return {...project, pieces: project.pieces.map(piece => ({...piece, source: migratePatternColors(piece.source)}))};
}
export default function App() {
  const [project, setProject] = useState<Project>(() => normalizeColors(initialProject()));
  const persistedKey = useRef<string|null>(null);
  const [past, setPast] = useState<Project[]>([]); const [future, setFuture] = useState<Project[]>([]);
  const piece = project.pieces.find(p => p.id === project.activeId)!;
  const source = piece.source;
  const parsed = useMemo(() => parsePattern(source), [source]);
  const model = useMemo(() => buildGeometry(parsed), [parsed]);
  const [selection, setSelection] = useState<number[]>([]);
  const selected = parsed.stitches.find(s => s.id === selection[selection.length - 1]);
  const [paint, setPaint] = useState(false); const [scope, setScope] = useState<ColorScope>('Stitch');
  const [colorTool,setColorTool] = useState<ColorTool>('brush');
  const [embroidering, setEmbroidering] = useState(false);
  const [embroideryAnchor, setEmbroideryAnchor] = useState<EmbroideryAnchor|null>(null);
  const [threadWeight, setThreadWeight] = useState<ThreadWeight>('embroidery');
  const [threadColor, setThreadColor] = useState('#303431');
  const [color, setColor] = useState('#f3e8d6');
  const [view, setView] = useState<'3d'|'chart'|'assembly'>(()=>project.pieces.some(p=>p.placement?.parentId)?'assembly':'3d');
  const [assemblyTool, setAssemblyTool] = useState<AssemblyTool>('select');
  const dragSnapshot = useRef<Project|null>(null);
  const mainPiece = project.pieces[0];
  const mainModel = useMemo(() => offsetRows(buildGeometry(parsePattern(mainPiece.source)),mainPiece.rowOffsets),[mainPiece.source,mainPiece.rowOffsets]);
  const placement = piece.placement ?? (piece.id===mainPiece.id ? identityPlacement() : stagedPlacement(project.pieces.indexOf(piece),mainModel,model));
  const [backdrop, setBackdrop] = useState<'dark'|'light'>('dark');
  const [editorMode, setEditorMode] = useState<'code'|'rounds'>('code');
  const [mode, setMode] = useState<'stitches'|'structure'>('stitches');
  const [roundLimit, setRoundLimit] = useState(150); const [playing, setPlaying] = useState(false);
  const [thickness, setThickness] = useState(1); const [moveRows, setMoveRows] = useState(false);
  const [selectedRow, setSelectedRow] = useState<number|null>(null);
  const [pendingInsert, setPendingInsert] = useState<string|null>(null);
  const [search, setSearch] = useState(''); const [menu, setMenu] = useState<'examples'|'export'|'help'|null>(null);
  const [eyeDialog,setEyeDialog] = useState<{pair?:SafetyEyePair}|null>(null);
  const [focusEyes,setFocusEyes] = useState<number|null>(null);
  useEffect(()=>{if(focusEyes!==null&&view==='3d'){viewer.current?.focusEyePair?.(focusEyes);setFocusEyes(null);}},[focusEyes,view,source]);
  useEffect(()=>setEyeDialog(null),[piece.id]);
  const [saved, setSaved] = useState(true); const [toast, setToast] = useState(''); const [libraryOpen, setLibraryOpen] = useState(true);
  const viewer = useRef<ViewerHandle>(null); const panel = useRef<HTMLElement>(null); const input = useRef<HTMLInputElement>(null);
  const rounds = parsed.rounds.length; const visibleRounds = Math.min(roundLimit, rounds);
  const errors = parsed.diagnostics.filter(d => d.severity === 'error');
  const usedColors = [...new Set(parsed.stitches.map(s => s.color))];
  function update(next: Project, record = true) { if (record) { setPast(p => [...p.slice(-49), project]); setFuture([]); } setProject(normalizeColors(next)); }
  function changeSource(next: string) { if(next.length > 120000) {setToast('Keep each piece under 120,000 characters.');return;} setSelection([]); setEmbroideryAnchor(null); update({...project, pieces: project.pieces.map(p => p.id === piece.id ? {...p, source: next} : p)}); }
  function undo() { if (!past.length) return; setEmbroideryAnchor(null); setFuture(p => [project, ...p]); setProject(past[past.length-1]); setPast(p => p.slice(0,-1)); setSelection([]); setAssemblyTool('select'); }
  function redo() { if (!future.length) return; setEmbroideryAnchor(null); setPast(p => [...p, project]); setProject(future[0]); setFuture(p => p.slice(1)); setSelection([]); setAssemblyTool('select'); }
  useEffect(() => {
    const key=projectContentKey(project);
    if(persistedKey.current===key)return;
    try {localStorage.setItem('loopform.studio.v2',JSON.stringify(project));persistedKey.current=key;setSaved(true);} catch {setSaved(false);}
  },[project]);
  useEffect(() => {
    function receive(event:StorageEvent) {
      if(event.key!=='loopform.studio.v2'||!event.newValue)return;
      try {
        const incoming:unknown=JSON.parse(event.newValue);
        if(!validProject(incoming))return;
        const key=projectContentKey(incoming);if(key===persistedKey.current)return;
        persistedKey.current=key;
        setProject(current=>receiveProject(current,normalizeColors(incoming)));setPast([]);setFuture([]);setSelection([]);setSaved(true);
      } catch { /* Ignore incomplete writes from another tab. */ }
    }
    window.addEventListener('storage',receive);return()=>window.removeEventListener('storage',receive);
  },[]);
  useEffect(() => { setSelection([]); setSelectedRow(null); setRoundLimit(150); setPlaying(false); setAssemblyTool('select'); }, [piece.id]);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setRoundLimit(r => { if (r >= rounds) { setPlaying(false); return rounds; } return r+1; }), 450); return () => clearInterval(timer); }, [playing, rounds]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setSelection([]); setAssemblyTool('select'); setColorTool('brush'); } }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, []);
  function finishEmbroidery() { setEmbroidering(false); setEmbroideryAnchor(null); setPaint(false); setMoveRows(false); setView('3d'); }
  function startEmbroidery() {
    if (errors.length || rounds < 2) { setToast('Finish at least two valid rounds before embroidering.'); return; }
    if (parsed.embroidery.length >= MAX_EMBROIDERY) { setToast(`Use at most ${MAX_EMBROIDERY} embroidery lines per piece.`); return; }
    setView('3d'); setMode('stitches'); setRoundLimit(150); setPlaying(false); setPaint(false); setMoveRows(false); setSelection([]); setEmbroideryAnchor(null); setEmbroidering(true);
  }
  function embroideryPoint(next: EmbroideryAnchor) {
    if (errors.length || !embroidering) return;
    if (!embroideryAnchor) { setEmbroideryAnchor(next); return; }
    if (Math.abs(next.round - embroideryAnchor.round) < 0.005 && Math.abs(Math.atan2(Math.sin((next.angle-embroideryAnchor.angle)*Math.PI/180),Math.cos((next.angle-embroideryAnchor.angle)*Math.PI/180))) < 0.005) return;
    if (parsed.embroidery.length >= MAX_EMBROIDERY) { setToast(`Use at most ${MAX_EMBROIDERY} embroidery lines per piece.`); return; }
    const nextSource = source.trimEnd()+'\n'+embroideryCode({from:embroideryAnchor,to:next,weight:threadWeight,color:threadColor});
    if(nextSource.length>120000){setToast('Keep each piece under 120,000 characters.');return;}
    changeSource(nextSource); setEmbroideryAnchor(next);
  }
  useEffect(()=>{setEmbroidering(false);setEmbroideryAnchor(null);},[piece.id]);
  useEffect(()=>{if(view!=='3d'){setEmbroidering(false);setEmbroideryAnchor(null);}},[view]);
  useEffect(()=>{if(errors.length){setEmbroidering(false);setEmbroideryAnchor(null);}},[errors.length]);
  useEffect(()=>{
    if(!embroidering)return;
    const key=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null;
      if(e.isComposing || target?.closest('input,textarea,select,[contenteditable="true"]'))return;
      if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();finishEmbroidery();}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[embroidering]);
  function select(id: number|null) {
    if (id === null) { setSelection([]); return; }
    if (paint && scope === 'Multi') setSelection(s => s.includes(id) ? s.filter(x => x!==id) : [...s,id]);
    else setSelection(colorSelection(parsed, id, paint ? scope : 'Stitch'));
  }
  function useColorTool(tool:ColorTool) {setEmbroidering(false);setEmbroideryAnchor(null);setPaint(true);setMoveRows(false);setPlaying(false);setMode('stitches');setColorTool(tool);setSelection([]);}
  function chooseColor(next:string) {setColor(next.toLowerCase());if(!paint)useColorTool('brush');else if(colorTool==='sample')setColorTool('brush');}
  function sampleColor(next:string) {setColor(next.toLowerCase());useColorTool('brush');setToast(`Exact yarn ${next.toUpperCase()} picked. Drag to paint with it.`);}
  function brushStitches(ids:number[],next:string):boolean {
    try {
      const result=paintStitches(source,ids,next);
      if(result!==source){changeSource(result);setSelection(ids);setEditorMode('code');setToast(`${ids.length} stitch${ids.length===1?'':'es'} painted · Undo restores the stroke`);}
      return true;
    }catch(error){setToast((error as Error).message);return false;}
  }
  function applyColor(next = color, ids = selection) {
    setColor(next);
    if (!ids.length) return;
    try { const result = paintStitches(source, ids, next); changeSource(result); setSelection(ids); setEditorMode('code'); } catch (e) { setToast((e as Error).message); }
  }
  function addRound() {
    const count = parsed.rounds.at(-1)?.outputCount ?? 6;
    const lines = source.split('\n'); const last = parsed.rounds.at(-1)?.line ?? lines.length;
    lines.splice(last,0,`Round ${rounds+1}: ${count} sc${rounds ? '' : ' in mr'} → ${count}`);
    changeSource(lines.join('\n')); setRoundLimit(150);
  }
  function insert(code: string) { setEditorMode('code'); setPendingInsert(code); }
  useEffect(() => { if(editorMode === 'code' && pendingInsert !== null) {window.dispatchEvent(new CustomEvent('loopform:insert', {detail:pendingInsert}));setPendingInsert(null);} }, [editorMode,pendingInsert]);
  function addPiece(source?: string, name?: string, offsets = {}, nextPlacement?: PiecePlacement) {
    if (project.pieces.length >= 30) { setToast('A project supports up to 30 pieces.'); return; }
    const p = newPiece(name ?? `Piece ${project.pieces.length+1}`, source ?? 'start: magic ring\n[cream]\nRound 1: 6 sc in mr → 6\nRound 2: 6 inc → 12');
    p.rowOffsets = {...offsets};
    p.placement = nextPlacement ?? stagedPlacement(project.pieces.length, mainModel, buildGeometry(parsePattern(p.source)));
    update({...project, pieces:[...project.pieces,p], activeId:p.id});
    setView('assembly');setPlaying(false);setAssemblyTool('select');
  }
  function changePlacement(next: PiecePlacement, id = piece.id, record = true) {
    if(record) update({...project,pieces:project.pieces.map(p=>p.id===id?{...p,placement:next}:p)});
    else setProject(p=>({...p,pieces:p.pieces.map(x=>x.id===id?{...x,placement:next}:x)}));
  }
  function duplicatePiece() { addPiece(source,`${piece.name} copy`,piece.rowOffsets,piece.id===mainPiece.id?undefined:{...placement,position:[placement.position[0]+1,placement.position[1],placement.position[2]]}); }
  function selectPiece(id: string) {setProject(p=>({...p,activeId:id}));setAssemblyTool('select');}
  function startAttachment() {
    if(assemblyTool==='place'){setAssemblyTool('select');return;}
    if(piece.hidden || mainPiece.hidden) update({...project,pieces:project.pieces.map(p=>p.id===piece.id||p.id===mainPiece.id?{...p,hidden:false}:p)});
    setAssemblyTool('place');
  }
  const safeName = project.name.replace(/[^\w -]/g,'').trim() || 'loopform';
  return <div className="studio">
    <header className="app-header">
      <a className="brand" href="#" aria-label="Loopform studio"><span className="brand-mark">ℓ</span>loopform<span className="brand-tag">STUDIO</span></a>
      <nav aria-label="Workspace"><span className="nav-active"><Layers3 size={16}/> Pattern studio</span><button onClick={() => setMenu('examples')}><BookOpen size={16}/> Patterns</button></nav>
      <div className="header-end"><span className="local-badge"><span/>Local workspace</span><button className="icon" title="How to use Loopform" onClick={() => setMenu('help')}><CircleHelp size={18}/></button><span className="avatar">O</span></div>
    </header>
    <div className="project-bar"><div className="project-title"><FolderOpen size={17}/><input aria-label="Project name" value={project.name} onChange={e => update({...project,name:e.target.value})}/><span className="save-status"><Check size={13}/>{saved ? 'Saved on this device' : 'Storage unavailable · export to save'}</span></div><div className="project-actions"><button onClick={() => input.current?.click()}><FolderOpen size={15}/>Open</button><button onClick={() => setMenu(menu==='export'?null:'export')}><Download size={15}/>Export<ChevronDown size={13}/></button><button className="primary" onClick={() => { download(`${safeName}.loopform.json`, JSON.stringify(project,null,2),'application/json'); setToast('Project downloaded with all pieces, colors, and attachments.'); }}><ArrowDownToLine size={15}/>Save project</button></div></div>
    <div className={`workspace ${!libraryOpen?'library-collapsed':''}`}>
      <aside className="library panel">
        <div className="panel-heading"><span><BookOpen size={15}/>Stitch library</span><button className="icon" title={libraryOpen?'Collapse library':'Open library'} onClick={() => setLibraryOpen(!libraryOpen)}>{libraryOpen?<Minus size={14}/>:<Plus size={14}/>}</button></div>
        {libraryOpen && <><div className="library-search"><Search size={14}/><input placeholder="Find a stitch…" aria-label="Find a stitch" value={search} onChange={e => setSearch(e.target.value)}/><kbd>US</kbd></div><div className="library-list">{['Starting & shaping','Essential stitches','Texture','Accessories'].map(group => <section key={group}><h3>{group}</h3>{LIBRARY.filter(s => s.group===group && `${s.name} ${s.code}`.toLowerCase().includes(search.toLowerCase())).map(s => <button className="stitch-card" key={s.code} title={s.code==='embroider'?'Draw embroidery on the 3D model':s.code==='eyes'?'Add safety eyes with placement and size':`Insert ${s.code} at the cursor`} onClick={() => {if(s.code==='embroider'){startEmbroidery();return;}if(s.code==='eyes'){setEyeDialog({});return;}setEditorMode('code'); insert(s.code);}}><span className="stitch-symbol">{s.code==='embroider'?<Scissors size={20}/>:s.code==='eyes'?<svg className="safety-eyes-icon" viewBox="0 0 28 24" width="28" height="24" aria-hidden="true" focusable="false"><ellipse cx="7.5" cy="12" rx="5" ry="6" fill="currentColor"/><ellipse cx="20.5" cy="12" rx="5" ry="6" fill="currentColor"/><circle cx="6" cy="10" r="1.5" fill="white"/><circle cx="19" cy="10" r="1.5" fill="white"/></svg>:s.symbol}</span><span><strong>{s.name}</strong><small>{s.detail}</small><code>{s.code}</code></span><Plus className="insert-plus" size={13}/></button>)}</section>)}</div><div className="library-tip"><Sparkles size={15}/><p>A pattern starts with one loop.<br/><button onClick={() => setMenu('examples')}>Try a starter pattern →</button></p></div></>}
      </aside>
      <section className="editor panel">
        <div className="panel-heading"><span><span className="dot mauve"/>Pattern editor</span><div className="heading-tools"><button className="icon" aria-label="Undo" disabled={!past.length} onClick={undo}><Undo2 size={16}/></button><button className="icon" aria-label="Redo" disabled={!future.length} onClick={redo}><Redo2 size={16}/></button><span className="divider"/><button className="icon" title="Pattern syntax" onClick={() => setMenu('help')}><CircleHelp size={15}/></button></div></div>
        <div className="piece-tabs" aria-label="Pattern pieces">{project.pieces.map(p => <button className={p.id===piece.id?'active':''} key={p.id} onClick={() => selectPiece(p.id)}><span className="dot"/>{p.name}{p.id===mainPiece.id&&<small className="main-piece-tag">MAIN</small>}</button>)}<button className="add-piece" title="Add piece" onClick={() => addPiece()}><Plus size={14}/></button></div>
        <div className="editor-toolbar"><div className="segmented"><button className={editorMode==='code'?'active':''} onClick={() => setEditorMode('code')}>Pattern</button><button className={editorMode==='rounds'?'active':''} onClick={() => setEditorMode('rounds')}>Rounds</button></div><span className="live-status"><span/>Live preview</span></div>
        <div className="editor-body">{editorMode==='code'?<PatternEditor key={piece.id} value={source} onChange={changeSource} diagnostics={parsed.diagnostics} onRender={() => setRoundLimit(150)} selectedLine={selected?.paintSourceLine ?? selected?.sourceLine ?? null}/>:<PatternWorksheet value={source} onChange={changeSource} diagnostics={parsed.diagnostics} selectedLine={selected?.sourceLine ?? null} onRender={() => setRoundLimit(150)} onEditingChange={() => {}}/>}</div>
        <div className="editor-bottom"><button onClick={addRound} disabled={!!errors.length || rounds>=150}><Plus size={14}/>Add round</button><span>{rounds} rounds <i>·</i> {parsed.stitches.length.toLocaleString()} stitches</span></div>
        <details className="piece-details"><summary>Piece settings & accessories</summary><div className="piece-controls"><label>Name<input aria-label="Piece name" value={piece.name} onChange={e => update({...project,pieces:project.pieces.map(p => p.id===piece.id?{...p,name:e.target.value}:p)})}/></label><label>First round<select value={parsed.orientation} onChange={e => changeSource(setPatternOrientation(source,e.target.value as PatternOrientation))}><option value="bottom-up">At bottom</option><option value="top-down">At top</option></select></label><button onClick={duplicatePiece}><Copy size={14}/>Duplicate</button><button disabled={piece.id===mainPiece.id} title={piece.id===mainPiece.id?'Keep the main piece as the assembly base':'Remove this piece'} onClick={() => {const remaining=project.pieces.filter(p=>p.id!==piece.id);update({...project,pieces:remaining,activeId:remaining[0].id});}}><Trash2 size={14}/>Remove</button></div><SafetyEyeControls source={source} pattern={parsed} onChange={changeSource} onAdd={()=>setEyeDialog({})} onEdit={pair=>setEyeDialog({pair})}/><div className="embroidery-list"><strong>Embroidery · {parsed.embroidery.length} lines</strong><button onClick={startEmbroidery}><Scissors size={14}/>Add embroidery</button>{parsed.embroidery.map((segment,i)=><div key={segment.line}><i style={{background:segment.color}}/><span>Line {i+1} · {segment.weight==='embroidery'?'Embroidery thread':segment.weight==='dk'?'DK yarn':'Super bulky yarn'}</span><button aria-label={`Remove embroidery line ${i+1}`} onClick={()=>{setEmbroideryAnchor(null);changeSource(source.split('\n').filter((_,line)=>line!==segment.line-1).join('\n'));}}><Trash2 size={13}/></button></div>)}</div></details>
      </section>
      <section className="preview panel" ref={panel}>
        <div className="panel-heading"><span><Box size={16}/>Your creation<span className="preview-tag">LIVE</span></span><div className="heading-tools"><div className="segmented"><button aria-label="3D view" className={view==='3d'?'active':''} onClick={() => setView('3d')}>Piece</button><button aria-label="Assembly view" className={view==='assembly'?'active':''} onClick={()=>{setView('assembly');setPlaying(false);}}>Assembly</button><button aria-label="Stitch chart" className={view==='chart'?'active':''} onClick={() => setView('chart')}><Grid2X2 size={14}/></button></div><button className="icon" title="Fullscreen preview" onClick={() => document.fullscreenElement ? document.exitFullscreen() : panel.current?.requestFullscreen()}><Maximize2 size={15}/></button></div></div>
        <div className="viewport" data-backdrop={backdrop}>
          <div className="view-top">{view==='assembly'?<div className="view-mode assembly-modes">{(['select','translate','rotate'] as const).map(t=><button key={t} className={assemblyTool===t?'active':''} onClick={()=>setAssemblyTool(t)}>{t==='select'?'Explore':t==='translate'?'Move':'Rotate'}</button>)}</div>:<div className="view-mode"><button className={!paint&&!moveRows&&!embroidering?'active':''} onClick={() => {setPaint(false);setMoveRows(false);setEmbroidering(false);setEmbroideryAnchor(null);}}><MousePointer2 size={14}/>Explore</button><button className={paint?'active':''} onClick={() => useColorTool('brush')}><Paintbrush size={14}/>Color</button><button className={moveRows?'active':''} title="Move individual rounds" onClick={() => {setMoveRows(!moveRows);setPaint(false);setEmbroidering(false);setEmbroideryAnchor(null);}}><MoveVertical size={14}/></button><button aria-label="Embroider" title="Draw embroidery on the piece" className={embroidering?'active':''} onClick={startEmbroidery}><Scissors size={14}/><span>Embroider</span></button></div>}<button className="view-focus" title="Center model" onClick={() => viewer.current?.resetView()}><Focus size={18}/></button></div>
          {view==='assembly'?<AssemblyViewer ref={viewer} pieces={project.pieces} activeId={piece.id} tool={assemblyTool} thickness={thickness} onSelect={selectPiece} onPlace={(id,next)=>{changePlacement(next,id);setAssemblyTool('select');setToast('Piece attached. Use Move or Rotate to fine-tune it.');}} onTransform={(id,next)=>changePlacement(next,id,false)} onDragStart={()=>{dragSnapshot.current=project;}} onDragEnd={()=>{if(dragSnapshot.current){const before=dragSnapshot.current;setPast(p=>[...p.slice(-49),before]);setFuture([]);dragSnapshot.current=null;}}}/>:view==='3d'?<ModelViewer ref={viewer} model={model} safetyEyes={parsed.eyes} embroidery={parsed.embroidery} embroidering={embroidering} embroideryAnchor={embroideryAnchor} threadWeight={threadWeight} threadColor={threadColor} onEmbroideryPoint={embroideryPoint} rowOffsets={piece.rowOffsets} moveRows={moveRows} selectedRow={selectedRow} onSelectRow={setSelectedRow} onRowMove={(row,value) => setProject(p=>({...p,pieces:p.pieces.map(x=>x.id===piece.id?{...x,rowOffsets:{...x.rowOffsets,[row]:value}}:x)}))} onRowDragStart={() => {setPast(p=>[...p.slice(-49),project]);setFuture([]);}} onRowDragEnd={() => {}} visibleRounds={visibleRounds} thickness={thickness} mode={mode} selectedStitch={selected?.id ?? null} selectedStitches={selection} paintTool={paint&&colorTool!=='select'?colorTool:'inspect'} brushColor={color} canPaint={!errors.length} onBrush={brushStitches} onSample={sampleColor} onSelect={select}/>:<StitchChart pattern={parsed} visibleRounds={visibleRounds} selection={selection} tool={paint&&colorTool!=='select'?colorTool:'inspect'} color={color} canPaint={!errors.length} onSelect={select} onBrush={brushStitches} onSample={sampleColor}/>}
          {view!=='assembly' && paint && colorTool==='select' && <div className="color-scope"><span>SELECT BY</span>{(['Stitch','Multi','Patch','Round','Whole piece'] as ColorScope[]).map(s => <button className={scope===s?'active':''} key={s} onClick={() => {setScope(s);setSelection([]);}}>{s}</button>)}</div>}
          {view!=='assembly' && moveRows && <div className="row-control">{selectedRow ? <><strong>Round {selectedRow}</strong><label>Height<input aria-label="Row height" type="number" step="0.1" value={piece.rowOffsets[selectedRow]??0} onChange={e=>update({...project,pieces:project.pieces.map(p=>p.id===piece.id?{...p,rowOffsets:{...p.rowOffsets,[selectedRow]:Number(e.target.value)}}:p)})}/></label><button onClick={()=>update({...project,pieces:project.pieces.map(p=>p.id===piece.id?{...p,rowOffsets:{}}:p)})}>Reset rounds</button></>:'Click a round, then drag the height handle.'}</div>}
          <div className="view-label"><span className="dot"/>{view==='assembly'?`${project.pieces.length} pieces`:piece.name}<span>·</span>{view==='assembly'?'Assembly':mode==='stitches'?'Finished fabric':'Stitch structure'}</div>
          <div className="zoom-controls"><button title="Zoom in" onClick={() => viewer.current?.zoomIn()}><Plus size={16}/></button><button title="Zoom out" onClick={() => viewer.current?.zoomOut()}><Minus size={16}/></button><button title="Front view" onClick={() => viewer.current?.frontView()}><RotateCcw size={15}/></button></div>
          <div className="viewport-hint">{view==='assembly'?(assemblyTool==='place'?'Click the main piece to attach · Esc to cancel':assemblyTool==='translate'?'Drag an arrow to move · Drag a square for two axes':assemblyTool==='rotate'?'Drag a colored ring to rotate the selected piece':'Drag to rotate · Click a piece to select'):embroidering ? 'Click points to embroider · Right-drag to rotate · Enter to finish' :paint ? (colorTool==='brush'?(view==='chart'?'Drag across cells to paint whole stitches':'Drag to paint whole stitches · Right-drag to rotate'):colorTool==='sample'?'Click a stitch to copy its exact yarn color':selection.length ? `${selection.length} stitch${selection.length===1?'':'es'} selected · choose a yarn below` : 'Click a stitch, then choose a yarn color') : 'Drag to rotate · Scroll to zoom · Click to inspect'}</div>
        </div>
        {view==='assembly'?<AssemblyControls pieces={project.pieces} active={piece} placement={placement} tool={assemblyTool} anchorMissing={!!placement.anchor&&!findAnchor(mainModel,placement)} onSelect={selectPiece} onChange={changePlacement} onAttach={startAttachment} onDetach={()=>{changePlacement(detachPlacement(placement,mainPiece.placement??identityPlacement(),mainModel));setAssemblyTool('select');}} onAddEar={()=>addPiece(earPattern(parsePattern(mainPiece.source).stitches[0]?.color),'Ear')} onDuplicate={duplicatePiece} onVisibility={()=>update({...project,pieces:project.pieces.map(p=>p.id===piece.id?{...p,hidden:!p.hidden}:p)})}/>:<>{embroidering?<EmbroideryControls weight={threadWeight} color={threadColor} hasAnchor={!!embroideryAnchor} count={parsed.embroidery.length} onWeight={setThreadWeight} onColor={setThreadColor} onNewLine={()=>setEmbroideryAnchor(null)} onFinish={finishEmbroidery}/>:<YarnPalette color={color} palette={PALETTE} usedColors={usedColors} painting={paint} tool={colorTool} canPaint={!errors.length} selectionCount={selection.length} selectionLabel={selected?`${selection.length} selected · Round ${selected.round}, stitch ${selected.index+1}`:'Select stitches, then apply a yarn color'} onColor={chooseColor} onTool={useColorTool} onApply={()=>applyColor()} onMatch={()=>{useColorTool('select');setSelection(parsed.stitches.filter(s=>s.color.toLowerCase()===color.toLowerCase()).map(s=>s.id));}}/>}
        <div className="playback"><button className="play-button" aria-label={playing?'Pause playback':'Play construction'} disabled={!rounds||embroidering} onClick={()=>{if(!playing && visibleRounds>=rounds)setRoundLimit(1);setPlaying(!playing);}}>{playing?<Pause size={13}/>:<Play size={13}/>}</button><span>Round <strong>{visibleRounds}</strong> / {rounds}</span><input aria-label="Visible rounds" disabled={embroidering} type="range" min={1} max={Math.max(1,rounds)} value={Math.max(1,visibleRounds)} onChange={e=>{setRoundLimit(Number(e.target.value));setPlaying(false);setSelection([]);}}/><button onClick={()=>{setRoundLimit(150);setPlaying(false);}}>Show all</button></div></>}
        <div className="render-settings"><button onClick={()=>setBackdrop(backdrop==='dark'?'light':'dark')}>{backdrop==='dark'?'Light backdrop':'Dark backdrop'}</button><label>Yarn size<input aria-label="Yarn size" type="range" min="0.7" max="1.4" step="0.05" value={thickness} onChange={e=>setThickness(Number(e.target.value))}/></label>{view!=='assembly'&&<button disabled={embroidering} onClick={()=>setMode(mode==='stitches'?'structure':'stitches')}>{mode==='stitches'?'Show structure':'Show yarn'}</button>}</div>
      </section>
    </div>
    <section className={`validation ${errors.length?'has-errors':''}`} aria-live="polite"><div><span className="validation-icon">{errors.length?<CircleHelp size={19}/>:<CheckCircle2 size={19}/>}</span><div><strong>{errors.length?'Let’s check that round':parsed.diagnostics.length?'A small note before you continue':'Every stitch adds up'}</strong><p>{parsed.diagnostics[0]?.message ?? 'Your rounds are in order and all stitch counts match. Ready for your next idea.'}</p></div></div><span>{errors.length ? `Line ${errors[0].line}` : `${rounds} rounds checked`}<Check size={14}/></span></section>
    <footer className="app-footer"><span><span className="dot"/>Made for making. Saved in your browser.</span><span>US crochet terms <i>·</i> Loopform Studio</span></footer>
    <input type="file" ref={input} hidden accept=".json,.txt,.crochet" aria-label="Open project file" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>4000000)throw new Error('Choose a file under 4 MB.');const text=await file.text();if(file.name.endsWith('.json')){const data=JSON.parse(text);if(validProject(data)){update({...data,pieces:data.pieces.map(p=>({...p,rowOffsets:sanitizeRowOffsets(p.rowOffsets)}))});}else if(typeof data.source==='string'&&data.source.length<=120000)addPiece(data.source,file.name.replace(/\.[^.]+$/,''));else throw new Error('This is not a Loopform project.');}else{if(text.length>120000)throw new Error('Keep each piece under 120,000 characters.');addPiece(text,file.name.replace(/\.[^.]+$/,''));}setToast('Pattern opened.');}catch(err){setToast((err as Error).message);}e.target.value='';}}/>
    {eyeDialog&&<SafetyEyesDialog source={source} pattern={parsed} pieceName={piece.name} selected={selected} pair={eyeDialog.pair} onClose={()=>setEyeDialog(null)} onSave={(next,index)=>{changeSource(next);setEyeDialog(null);setEditorMode('code');setView('3d');setRoundLimit(150);setPlaying(false);setPaint(false);setMoveRows(false);setMode('stitches');setFocusEyes(index);setToast('Safety eyes saved in the pattern and added to the 3D model.');}}/>}
    {menu && <div className="modal-backdrop" onClick={()=>setMenu(null)}><div className={`modal ${menu==='help'?'help-modal':''}`} role="dialog" aria-modal="true" aria-label={menu==='examples'?'Starter patterns':menu==='export'?'Export project':'Pattern guide'} onClick={e=>e.stopPropagation()}><button className="modal-close icon" aria-label="Close dialog" onClick={()=>setMenu(null)}><X size={18}/></button>{menu==='examples'?<><span className="eyebrow">A LITTLE INSPIRATION</span><h2>Start with something lovely.</h2><p>Open a pattern as a new piece in your project.</p><div className="example-list">{STUDIO_EXAMPLES.map(ex=><button key={ex.name} onClick={()=>{addPiece(ex.source,ex.name);setMenu(null);}}><span className="example-icon">◎</span><span><strong>{ex.name}</strong><small>{ex.description}</small></span><Plus size={16}/></button>)}</div></>:menu==='export'?<><span className="eyebrow">TAKE YOUR IDEAS WITH YOU</span><h2>Export your creation</h2><p>Project files include every piece, color, accessory, and attachment.</p><div className="export-list"><button onClick={()=>{download(`${safeName}.loopform.json`,JSON.stringify(project,null,2),'application/json');setMenu(null);}}><FolderOpen/><span><strong>Loopform project</strong><small>Editable project · JSON</small></span><Download/></button><button onClick={()=>{download(`${safeName}.txt`,project.pieces.map(p=>`// PIECE: ${p.name}\n${p.source}`).join('\n\n'));setMenu(null);}}><BookOpen/><span><strong>Pattern text</strong><small>All pieces and exact stitch colors · TXT</small></span><Download/></button><button onClick={()=>{viewer.current?.exportImage();setMenu(null);}} disabled={view==='chart'}><Box/><span><strong>Preview image</strong><small>Current view · piece or assembly · PNG</small></span><Download/></button></div></>:<><span className="eyebrow">FROM THE FIRST LOOP</span><h2>Your pattern, made visible.</h2><p>Write one round per line. Increases widen the piece; decreases close it. Counts and the 3D preview update as you type.</p><pre>{'start: magic ring\nRound 1: 6 sc in mr → 6\nRound 2: 6 inc → 12\nRound 3: (sc, inc) x6 → 18\nRound 4-6: 18 sc → 18'}</pre><h3>Make every stitch your own</h3><p>Choose Color → Brush, pick a yarn, and drag across the model or chart. Every touched stitch is colored in full, and each drag is one undo step. Right-drag rotates the model; Explore returns to normal orbiting. Escape cancels an unfinished stroke. Use Eyedropper or Alt-click to copy a stitch’s exact stored yarn color, unaffected by lighting. The hex field and In this piece swatches let you reuse the same shade. Select mode keeps Multi, Patch, Round, and Whole piece selections.</p><p>Painting updates the round’s base yarn and inline stitch colors immediately, such as <code>3sc[#A96A43]</code>. These exact colors are saved with your pattern and included in pattern text exports. Each brush stroke can be undone. Choose a used yarn and Select matching to select every stitch in that shade; pick a replacement and Apply yarn.</p><h3>Safety eyes</h3><p>Choose Safety eyes from the stitch library. Set the round gap, the stitch gap for each eye, and the diameter in millimeters. Confirm to update the pattern and show the eyes in 3D. Preview scale adjusts the stitch width for your yarn. Edit or remove eyes under Piece settings & accessories.</p><h3>Embroidery</h3><p>Choose Embroider or Embroidery in the stitch library. Select Embroidery thread, DK yarn, or Super bulky yarn and a color. Click two points on the model to sew a line; continue clicking to connect more points. New line starts a separate eye or nose. Right-drag rotates the piece. Press Enter or Done to return to Explore. Each line is saved in the pattern and can be undone or removed under Piece settings & accessories.</p><h3>Pieces & saving</h3><p>Each tab has its own pattern. Use Assembly to see all pieces together; the first tab is your main piece. Add an ear or any custom piece, select Place on main piece, then click a stitch where it should join. Choose the joining edge, and use Move / Rotate handles or numeric controls to adjust it. Attachments follow the main piece as you edit or move it. Duplicate for a matching second ear, then choose its new placement. Your project saves here automatically; Save project downloads a portable backup with the full assembly.</p><p className="help-note">The model estimates shape from stitch counts. Yarn, tension, stuffing, and sewing affect the finished object.</p></>}</div></div>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={16}/>{toast}</div>}
  </div>;
}
