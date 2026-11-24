import { useEffect, useRef, useState } from 'react';
import { AssemblyViewer } from './AssemblyViewer';
import type { Project } from '../lib/studio';
const noop = () => {};
const noRounds: number[] = [];
/** Only visible cards allocate a WebGL scene. Saved placements remain read-only. */
export function ProjectPreview({ project }: { project: Project }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const parts = project.pieces.slice(1);
  const attached = parts.filter(p => p.placement?.parentId === project.pieces[0]?.id).length;
  const status = !parts.length ? 'Single piece' : attached === parts.length ? 'All pieces attached' : attached ? 'Assembly in progress' : 'Pieces not attached';
  return <><div ref={host} className="project-assembly-preview" role="img" aria-label={`3D assembly of ${project.name}`}>
    {visible && <AssemblyViewer pieces={project.pieces} activeId="" tool="select" thickness={project.settings?.thickness ?? 1} highlightedRounds={noRounds} onSelect={noop} onPlace={noop} onTransform={noop} onDragStart={noop} onDragEnd={noop} />}
  </div><p className="project-assembly-status">{status}{parts.length > 0 && ` · ${attached}/${parts.length} attached to main`}{project.pieces.some(p=>p.hidden) && ' · Includes hidden pieces'}</p></>;
}
