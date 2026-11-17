/** Explicit pattern titles win over legacy piece labels, including on saved projects. */
export function pieceName(piece: {source: string; name: string}): string {
  let name=piece.name;
  for(const line of piece.source.split('\n')) {
    const title=/^\s*Pattern name:\s*"(.*)"\s*$/i.exec(line.split('//')[0]);
    if(title && title[1].trim())name=title[1].trim();
  }
  return name;
}

export function setPieceName(source: string, name: string): string {
  const title=`Pattern name: "${name.replace(/[\r\n]/g,' ')}"`;
  let found=false;
  const lines=source.split('\n').map(line=>{
    if(!/^\s*Pattern name:/i.test(line))return line;
    found=true;
    const comment=line.indexOf('//');
    return title+(comment<0?'':` ${line.slice(comment)}`);
  });
  return found?lines.join('\n'):`${title}\n${source}`;
}
