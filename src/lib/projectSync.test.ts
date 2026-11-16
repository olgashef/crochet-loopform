import test from 'node:test';
import assert from 'node:assert/strict';
import { projectContentKey, receiveProject } from './projectSync';
import { identityPlacement } from './assembly';
import type { Project } from './studio';
const project:Project={version:2,name:'Bear',activeId:'head',pieces:[
  {id:'head',name:'Head',source:'Round 1: 6 sc in mr',rowOffsets:{}},
  {id:'ear',name:'Ear',source:'Round 1: 6 sc in mr',rowOffsets:{}},
]};

test('tab selection does not trigger shared writes or an autosave echo',()=>{
  const other={...project,activeId:'ear'};
  assert.equal(projectContentKey(other),projectContentKey(project));
  assert.equal(receiveProject(project,other),project);
});
test('remote pattern and placement edits sync without stealing the selected piece',()=>{
  const other:Project={...project,activeId:'ear',pieces:project.pieces.map(p=>p.id==='ear'?{...p,placement:{...identityPlacement(),parentId:'head',position:[1,2,3]}}:p)};
  const synced=receiveProject(project,other);
  assert.equal(synced.activeId,'head');assert.deepEqual(synced.pieces,other.pieces);
  assert.equal(projectContentKey(synced),projectContentKey(other));
});
test('removing the local selection in another tab selects a surviving piece',()=>{
  const local={...project,activeId:'ear'},other={...project,pieces:[project.pieces[0]]};
  assert.equal(receiveProject(local,other).activeId,'head');
});
