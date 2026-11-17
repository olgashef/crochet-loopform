import test from 'node:test';
import assert from 'node:assert/strict';
import { projectContentKey, receiveProject, canReceiveProject } from './projectSync';
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

test('two tabs with different selected pieces converge without echoing a placement edit',()=>{
  const first={...project,id:'shared'},second={...first,activeId:'ear'};
  const changed={...first,pieces:first.pieces.map(p=>p.id==='ear'?{...p,placement:{...identityPlacement(),position:[4,2,3] as [number,number,number]}}:p)};
  const firstSaved=projectContentKey(changed);
  assert.equal(canReceiveProject(second,changed,projectContentKey(second),false),true);
  const received=receiveProject(second,changed),secondSaved=projectContentKey(received);
  assert.equal(received.activeId,'ear');
  assert.equal(firstSaved,secondSaved);
  assert.equal(canReceiveProject(changed,received,firstSaved,false),false);
  assert.equal(canReceiveProject(received,changed,secondSaved,false),false);
});
test('remote snapshots cannot overwrite a drag or an unsaved local edit',()=>{
  const saved=projectContentKey(project),remote={...project,name:'Remote edit'};
  assert.equal(canReceiveProject(project,remote,saved,true),false);
  assert.equal(canReceiveProject({...project,name:'Local edit'},remote,saved,false),false);
  assert.equal(canReceiveProject(project,remote,saved,false),true);
  assert.equal(canReceiveProject({...project,id:'a'},{...remote,id:'b'},saved,false),false);
});
