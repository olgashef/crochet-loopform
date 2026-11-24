import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePattern,analyzeInstruction} from './pattern';
import {buildGeometry} from './geometry';
import {createPieceMesh,disposePieceMesh} from './pieceMesh';
import {paintStitches} from './colorwork';
const ok=(s:string)=>{const p=parsePattern(s);assert.deepEqual(p.diagnostics,[],s);return p;};
test('typed increases, multi-increases, skips, triple decreases and shells have truthful topology',()=>{
 for(const type of ['hdc','dc','tr','dtr']) {
  const p=ok(`Round 1: 6sc in mr\nRound 2: (${type} inc)x6 → 12`);
  assert.equal(p.rounds[1].stitches.length,12);assert.ok(p.rounds[1].stitches.every(s=>s.type===type));
  assert.deepEqual(p.rounds[1].stitches[0].parents,p.rounds[1].stitches[1].parents);
 }
 assert.equal(analyzeInstruction('inc3, dec3, sk, shell').inputCount,6);
 assert.equal(analyzeInstruction('inc3, dec3, sk, shell').outputCount,9);
 const p=ok('Round 1: 6sc in mr\nRound 2: dec3, sk, 2sc → 3');
 assert.equal(p.rounds[1].stitches[0].parents.length,3);
 assert.deepEqual(p.rounds[1].stitches[1].parents,[4]);
});
test('texture variants produce finite meshes and survive painting',()=>{
 for(const type of ['dtr','bobble2','bobble3','bobble4','trbo','puff','popcorn']){
  const s=`Round 1: 6sc in mr\nRound 2: 6 ${type} → 6`,p=ok(s),m=buildGeometry(p);
  assert.ok(m.points.every(p=>p.position.every(Number.isFinite)));
  const mesh=createPieceMesh(m,p,1);disposePieceMesh(mesh);
  const painted=ok(paintStitches(s,[7],'#123456'));assert.equal(painted.stitches[7].type,type);
 }
});
test('motifs repeat by consumed stitches and reject a fractional repeat',()=>{
 assert.equal(analyzeInstruction('(sc, inc) around',12).outputCount,18);
 assert.throws(()=>analyzeInstruction('(sc, inc) around',11));
 ok('Round 1: 6sc in mr\nRound 2: (sc, inc) around → 9');
});
test('loop-only work retains free-loop parents and rejects reused loops',()=>{
 const s='Round 1: 6sc in mr\nRound 2: BLO: sc around\nRound 3: FLO of Round 1: sc around';
 const p=ok(s);assert.ok(p.rounds[1].stitches.every(s=>s.loop==='back'));
 assert.deepEqual(p.rounds[2].stitches.map(s=>s.parents),p.rounds[1].stitches.map(s=>s.parents));
 assert.ok(parsePattern(s.replace('FLO of','BLO of')).diagnostics.some(d=>d.severity==='error'));
 ok(paintStitches(s,[7],'#123456'));
});
test('chain return supports ordinary and shared stitches without adding to body totals',()=>{
 const p=ok('Round 1: 6sc in mr\nRound 2: ch 3 back (sc, (sc, sl) in one st), 6sc → 6');
 assert.equal(p.rounds[1].outputCount,6);assert.equal(p.stitches.filter(s=>s.branch).length,6);
});
test('joined foundations preserve an open center and accept ring or tube notation',()=>{
 for(const source of ['start: ch 4, join\nRound 1: 8sc in ring → 8','start: ch 30, join\nRound 1: 30sc → 30\nRound 2: sc around → 30']){
  const p=ok(source);assert.ok(buildGeometry(p).openFoundation);
 }
});
test('hook notation and turning chains count only body stitches',()=>{
 ok('start: ch 11\nRow 1: sc in 2nd ch from hook and in each ch across → 10\nRow 2: 10sc, ch 1, turn → 10');
 ok('start: ch 13\nRow 1: dc in 4th ch from hook and in each ch across → 10\nRow 2: ch 3 (counts as dc), 9 dc → 10');
});

test('new construction forms preserve yarn, loops, parents and counts through painting',()=>{
 const samples=[
  'start: ch 13\nRow 1: 10dc → 10\nRow 2: ch 3 (counts as dc), 9dc → 10',
  'start: ch 4, join\nRound 1: 8sc in ring → 8\nRound 2: 8inc → 16',
  'start: ch 30, join\nRound 1: sc around → 30\nRound 2: sc around → 30',
  'Round 1: 6sc in mr\nRound 2: ch 3 back (sc, (sc, sl) in one st), 6sc → 6',
  'start: ch 11\nRow 1: 10sc, ch 1, turn → 10\nRow 2: 10sc → 10',
  'Round 1: 6sc in mr\nRound 2: 6 hdc inc → 12\nRound 3: 12inc3 → 36',
 ];
 for(const source of samples){
  const p=ok(source),ids=p.stitches.map(s=>s.id).filter((_,i)=>i%3===0);
  let next:string;try{next=paintStitches(source,ids,'#123456');}catch(e){throw new Error(source,{cause:e});}const q=ok(next);
  assert.deepEqual(q.stitches.map(s=>s.parents),p.stitches.map(s=>s.parents));
  assert.equal(buildGeometry(p).points.length,p.stitches.length,source);
  assert.equal(buildGeometry(q).points.length,q.stitches.length,next);
 }
});

test('earlier-loop branches attach to their source course and stay separate',()=>{
 const p=ok('Round 1: 12sc in mr\nRound 2: BLO: sc around\nRound 3: sc around\nRound 4: FLO of Round 1: sc around\nRound 5: sc around');
 const m=buildGeometry(p),r=m.roundCenters;
 assert.equal(r[3].parentRound,1);assert.equal(r[4].parentRound,4);
 assert.ok(r[3].center[1]<r[2].center[1]);
 assert.ok(r[3].radius>r[1].radius);
 assert.ok(m.points.every(p=>p.position.every(Number.isFinite)));
});

test('explicit hook placement, nested loop groups, and joins retain their construction',()=>{
 const p=ok('start: ch 2\nRow 1: 6 sc in 2nd ch from hook → 6');
 assert.ok(p.rounds[0].stitches.every(s=>s.parents[0]===0));
 const source='Round 1: 24sc in mr\nRound 2: (FLO ((sc, hdc, sc) in one st, sl)) x12 → 48';
 const nested=ok(source);assert.ok(nested.rounds[1].stitches.every(s=>s.loop==='front'));
 ok(paintStitches(source,[24,25],'#123456'));
 const joined=ok('Round 1: 6sc in mr\nRound 2: 6sc, join → 6');
 assert.equal(joined.rounds[1].joined,true);
 assert.ok(buildGeometry(joined).links.some(l=>l.from===11&&l.to===6&&l.kind==='course'));
 ok(paintStitches('Round 1: 6sc in mr\nRound 2: 6sc, join → 6',[8],'#123456'));
});

test('inline loop modifiers apply only to the following count or group',()=>{
 const p=ok('Round 1: 6sc in mr\nRound 2: BLO 2 sc, 4 sc → 6');
 assert.deepEqual(p.rounds[1].stitches.map(s=>s.loop),['back','back',undefined,undefined,undefined,undefined]);
 ok(paintStitches('Round 1: 6sc in mr\nRound 2: BLO 2 sc, 4 sc → 6',[7],'#123456'));
});

test('invalid joined colors report diagnostics rather than crashing the preview',()=>{
 assert.ok(parsePattern('start: ch 4, join [invalid,red,red,red]\nRound 1: 8sc in ring').diagnostics.some(d=>d.severity==='error'));
});
