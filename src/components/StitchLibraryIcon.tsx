import type { ReactNode } from 'react';

/** Chart-inspired symbols drawn on one grid, independent of installed fonts. */
export function StitchLibraryIcon({ code }: { code: string }) {
  const key = code.trim();
  const path = (d: string) => <path d={d} />;
  const post = (slashes: number) => <>{path('M12 20V4M8 4h8')}{Array.from({length: slashes}, (_, i) => <path key={i} d={`M9 ${9+i*3}l6 -3`} />)}</>;
  const fan = (count: number, decrease = false) => <>{Array.from({length: count}, (_, i) => <path key={i} d={decrease ? `M${4+16*i/(count-1)} 19L12 5` : `M12 19L${4+16*i/(count-1)} 5`} />)}</>;
  const around = <>{path('M19 8a8 8 0 1 0 1 7M15 8h5V3')}</>;
  let drawing: ReactNode;
  if (key === 'sc') drawing = path('M6 6l12 12M18 6L6 18');
  else if (['hdc', 'dc', 'tr', 'dtr'].includes(key)) drawing = post(['hdc','dc','tr','dtr'].indexOf(key));
  else if (key === 'ch') drawing = <ellipse cx="12" cy="12" rx="8" ry="4" />;
  else if (key === 'slst') drawing = <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />;
  else if (key === 'magic-start') drawing = <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></>;
  else if (key === 'ring-start') drawing = <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />;
  else if (key === 'tube-start') drawing = <><ellipse cx="12" cy="6" rx="7" ry="3" />{path('M5 6v12c0 4 14 4 14 0V6')}</>;
  else if (key === 'oval-start') drawing = <><rect x="3" y="5" width="18" height="14" rx="7" />{path('M7 12h10')}</>;
  else if (key === 'chain-start') drawing = <>{[6,12,18].map(x => <ellipse key={x} cx={x} cy="12" rx="4" ry="3" />)}</>;
  else if (key === 'inc' || key === 'inc3' || key.includes('same st') || key === '3 hdc in one st') drawing = fan(key.includes('sc, sc, sc, sc') ? 4 : key === 'inc' ? 2 : 3);
  else if (key.endsWith(' inc')) drawing = <>{fan(2)}{Array.from({length: ['hdc','dc','tr','dtr'].indexOf(key.split(' ')[0])}, (_, i) => <path key={i} d={`M${5+i} ${9+i*3}h4M${15-i} ${9+i*3}h4`} />)}</>;
  else if (key === 'dec' || key === 'dec3') drawing = fan(key === 'dec' ? 2 : 3, true);
  else if (key === 'sk') drawing = path('M4 17Q12 3 20 17M17 14l3 3 1-4');
  else if (/^(bobble|trbo|puff|popcorn|shell)/.test(key)) {
    const count = key === 'bobble2' ? 2 : key === 'bobble3' ? 3 : key === 'bobble4' ? 4 : 5;
    drawing = <>{Array.from({length: count}, (_, i) => <path key={i} d={`M12 20Q${-4+32*i/(count-1)} ${key === 'shell' ? 1 : -4} ${key === 'shell' ? 4+16*i/(count-1) : 12} 5`} />)}{key !== 'shell' && path('M9 5h6')}</>;
  }
  else if (/^[BF]LO/.test(key)) drawing = <>{path('M4 14q8-12 16 0M4 17q8-8 16 0')}{key.startsWith('BLO') ? path('M7 7h10') : path('M7 21h10')}{key.includes('of Round') && path('M3 6V3h5')}</>;
  else if (key === 'eyes') drawing = <><ellipse cx="7" cy="12" rx="4" ry="6" /><ellipse cx="17" cy="12" rx="4" ry="6" />{path('M6 10v2M16 10v2')}</>;
  else if (key === 'embroider') drawing = <>{path('M4 20L17 4q4-3 3 2L4 20M16 7l2-2M5 20q9 3 14-3')}</>;
  else if (key.startsWith('edge:')) drawing = path('M4 5v14h16V5');
  else if (key.startsWith('make:')) drawing = <><rect x="3" y="3" width="12" height="12" rx="2" />{path('M9 18v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1')}</>;
  else if (key.startsWith('orientation')) drawing = key.includes('top-down') ? path('M12 3v18M6 15l6 6 6-6M5 3h14') : path('M12 21V3M6 9l6-6 6 6M5 21h14');
  else if (key === 'fasten off') drawing = <>{path('M4 4l16 16M20 4L9 15')}<circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="2" /></>;
  else if (key === 'join') drawing = path('M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8');
  else if (key.includes('back') || key.startsWith('branch')) drawing = path('M4 19L18 5M11 5h7v7M20 12l-8 8M12 16v4h4');
  else if (key.includes('for 3')) drawing = <>{path('M5 5h14M5 12h14M5 19h14')}{key.includes('rounds') && <circle cx="12" cy="12" r="9" />}</>;
  else if (key.includes('around')) drawing = around;
  else if (key === 'sc across') drawing = path('M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4');
  else if (key.includes('from hook')) drawing = <>{path('M17 3v7a4 4 0 0 1-8 0V8M4 18h16M7 15v6M13 15v6')}</>;
  else if (key.includes('counts as')) drawing = <>{path('M7 20V4M4 4h6M14 16V6M11 9l3-3 3 3')}<ellipse cx="17" cy="19" rx="4" ry="2" /></>;
  else drawing = path('M19 5v7H5M10 7l-5 5 5 5'); // Turning / new row / other side.
  return <svg className="stitch-library-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawing}</svg>;
}
