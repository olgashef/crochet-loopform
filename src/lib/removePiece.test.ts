import test from 'node:test';
import assert from 'node:assert/strict';
import {removePiece} from './removePiece';
import {makePieces} from './makePieces';
import {newPiece,type Project} from './studio';
test('deleting a repeated instance updates make and survives normalization',()=>{
 const main=newPiece('Main','Round 1: 6sc in mr');
 const paw=newPiece('Paw','make: 4\nRound 1: 6sc in mr');
 const p=makePieces({version:2,name:'Test',activeId:main.id,pieces:[main,paw]} as Project);
 const copy=p.pieces[2];p.activeId=copy.id;
 const next=makePieces(removePiece(p,copy.id));
 assert.equal(next.pieces.length,4);
 assert.ok(!next.pieces.some(x=>x.id===copy.id));
 assert.equal(next.activeId,main.id);
 assert.equal(p.pieces.length,5);
 assert.equal(removePiece(p,main.id),p);
 const removed=makePieces(removePiece(p,paw.id));
 assert.equal(removed.pieces.length,1);
});
