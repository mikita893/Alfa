import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(path, extra={}) {
  const process=spawn(globalThis.process.execPath,['server.js'],{env:{...globalThis.process.env,PORT:'0',ALFA_DB:path,ALFA_SEED:'0',ALFA_DEV_NO_AUTH:'1',...extra},stdio:['ignore','pipe','pipe']});
  const port=await new Promise((resolve,reject)=>{
    let log='';
    const timeout=setTimeout(()=>{process.kill();reject(new Error('Server startup timeout'));},10000);
    process.stdout.on('data',chunk=>{log+=chunk;const match=log.match(/port (\d+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
    process.once('error',e=>{clearTimeout(timeout);reject(e);});
    process.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Server exited: ${code}`));});
  });
  return {process,base:`http://127.0.0.1:${port}`};
}
async function stop(process) { const exited=once(process,'exit');process.kill('SIGTERM');await exited; }
test('Organizer workflow: parish isolation, validation, attendance, persistence and deletion',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'alfa-test-'));
  const path=join(directory,'test.sqlite');
  let server=await start(path);
  const request=async(path,method='GET',body)=>{
    const response=await fetch(server.base+path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  const create=async(table,body)=>{const r=await request('/api/'+table,'POST',body);assert.equal(r.status,201,JSON.stringify(r.body));return r.body.id;};
  try {
    assert.equal((await fetch(server.base)).status,200);
    const p1=await create('parishes',{name:'Parafia A',city:'Warszawa'});
    const p2=await create('parishes',{name:'Parafia B',city:'Kraków'});
    const edition={name:'Jesień',date:'2026-10',end_date:'2027-01',location:'Sala',status:'Planowana'};
    const e1=await create('editions',{...edition,parish_id:p1});
    const e2=await create('editions',{...edition,parish_id:p2});
    const roleId=await create('roles',{name:'Animator muzyczny'});
    const person={name:'Osoba testowa',email:'test@example.com',phone:'',parish_ids:[p1,p2],enrollments:[{edition_id:e1,role_ids:[roleId],group_name:'Grupa 1',status:'Zgłoszony'},{edition_id:e2,role_ids:[roleId],group_name:'',status:'Potwierdzony'}]};
    const personId=await create('people',person);
    const standalone=await create('people',{name:'Bez przypisania'});
    assert.equal((await request('/api/people','POST',{...person,enrollments:[{...person.enrollments[0],edition_id:99999}]})).status,400);
    assert.equal((await request('/api/people','POST',{...person,email:'invalid'})).status,400);
    assert.equal((await request('/api/people','POST',{...person,enrollments:[{...person.enrollments[0],role_ids:[99999]}]})).status,400);
    assert.equal((await request('/api/editions','POST',{...edition,parish_id:p1,end_date:'2025-01'})).status,400);
    const meeting={edition_id:e1,title:'Spotkanie',date:'2026-10-27',time:'19:00',location:'Sala'};
    const m1=await create('meetings',meeting);
    const m2=await create('meetings',{...meeting,edition_id:e2});
    assert.equal((await request('/api/meetings','POST',{...meeting,date:'2026-02-30'})).status,400);
    assert.equal((await request('/api/attendance','POST',{meeting_id:m2,person_id:standalone,present:true})).status,400);
    assert.equal((await request('/api/attendance','POST',{meeting_id:m1,person_id:personId,present:true})).status,200);
    await request('/api/attendance','POST',{meeting_id:m1,person_id:personId,present:true});
    assert.equal((await request('/api/state')).body.attendance.length,1);
    const task={edition_id:e1,title:'Przygotować salę',owner:'Koordynator',date:'2026-10-27',done:false};
    const taskId=await create('tasks',task);
    assert.equal((await request(`/api/tasks/${taskId}`,'PUT',{...task,done:true})).status,200);
    await stop(server.process);server=await start(path);
    const state=(await request('/api/state')).body;
    assert.equal(state.parishes.length,2);
    assert.equal(state.people.find(p=>p.id===personId).enrollments[0].group_name,'Grupa 1');
    assert.equal(state.people.find(p=>p.id===personId).enrollments.length,2);
    assert.equal(state.people.find(p=>p.id===personId).parish_ids.length,2);
    assert.equal(state.people.find(p=>p.id===standalone).enrollments.length,0);
    assert.equal(state.tasks[0].done,1);
    assert.equal(state.attendance.length,1);
    const csrf=await fetch(server.base+'/api/people',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.example'},body:JSON.stringify(person)});
    assert.equal(csrf.status,403);
    assert.equal((await request(`/api/people/${personId}`,'DELETE',{})).status,200);
    assert.equal((await request('/api/state')).body.attendance.length,0);
    assert.equal((await request(`/api/people/${personId}`,'DELETE',{})).status,404);
  } finally {await stop(server.process);await rm(directory,{recursive:true,force:true});}
});
