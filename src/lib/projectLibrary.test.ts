import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, libraryEntry, projectSettings } from './projectLibrary';
import { identityPlacement } from './assembly';
import { receiveProject } from './projectSync';
import { validProject, type Project } from './studio';

const project: Project={version:2,id:'bear',name:'Bear',activeId:'ear',settings:{...DEFAULT_SETTINGS,thickness:1.25,threadWeight:'bulky',view:'assembly',backdrop:'light'},pieces:[
  {id:'body',name:'Body',source:'Round 1 [#ABCDEF]: 6sc in mr\neyes between 1 and 2 at 1, 4 size 6mm stitch 5mm\nembroider dk #303431: 1@10 > 2@30',rowOffsets:{1:.3}},
  {id:'ear',name:'Ear',source:'Round 1: 6sc in mr',rowOffsets:{},hidden:true,placement:{...identityPlacement(),parentId:'body',anchor:{round:1,index:1,point:[0,1,0]},position:[1,2,3]}},
]};
test('library saves independent complete project snapshots including attachments and settings',()=>{
  const entry=libraryEntry(project,undefined,10);
  assert.deepEqual(entry.project,project);assert.equal(entry.id,'bear');assert.equal(entry.createdAt,10);
  entry.project.pieces[0].rowOffsets[1]=8;
  assert.equal(project.pieces[0].rowOffsets[1],.3);
  assert.ok(validProject(JSON.parse(JSON.stringify(entry.project))));
});
test('resaving updates the same record and retains creation time and archive state',()=>{
  const first={...libraryEntry(project,undefined,10),archived:true};
  const second=libraryEntry({...project,name:'Brown bear'},first,20);
  assert.equal(second.id,first.id);assert.equal(second.createdAt,10);assert.equal(second.updatedAt,20);assert.equal(second.archived,true);
});
test('legacy projects get safe defaults and malformed optional settings are bounded',()=>{
  assert.deepEqual(projectSettings(undefined),DEFAULT_SETTINGS);
  const safe=projectSettings({thickness:900,roundLimit:-1,view:'bad',color:'url(evil)',threadWeight:'bad'});
  assert.equal(safe.thickness,1.4);assert.equal(safe.roundLimit,1);assert.equal(safe.view,'3d');assert.equal(safe.color,DEFAULT_SETTINGS.color);
  assert.equal(projectSettings({thickness:NaN}).thickness,1);
});
test('different projects open in separate tabs cannot replace each other',()=>{
  assert.equal(receiveProject(project,{...project,id:'bee',name:'Bee'}),project);
});
test('library rejects missing identities and broken assemblies',()=>{
  assert.throws(()=>libraryEntry({...project,id:undefined}));
  assert.throws(()=>libraryEntry({...project,activeId:'missing'}));
});
