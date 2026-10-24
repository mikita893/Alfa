import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('Legacy migration retains contacts and attendance and is repeatable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'alpha-migration-'));const path=join(dir,'test.sqlite');
 let db=new DatabaseSync(path);
 db.exec(`CREATE TABLE parishes(id INTEGER PRIMARY KEY,name TEXT NOT NULL,city TEXT NOT NULL DEFAULT '');
 CREATE TABLE editions(id INTEGER PRIMARY KEY,parish_id INTEGER NOT NULL,name TEXT NOT NULL,date TEXT NOT NULL,location TEXT NOT NULL,status TEXT NOT NULL);
 CREATE TABLE people(id INTEGER PRIMARY KEY,edition_id INTEGER NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,role TEXT NOT NULL,group_name TEXT NOT NULL,status TEXT NOT NULL);
 CREATE TABLE meetings(id INTEGER PRIMARY KEY,edition_id INTEGER NOT NULL,title TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,location TEXT NOT NULL);
 CREATE TABLE attendance(meeting_id INTEGER,person_id INTEGER,PRIMARY KEY(meeting_id,person_id));
 INSERT INTO parishes VALUES(1,'Dawna parafia','');
 INSERT INTO editions VALUES(1,1,'Dawna edycja','2026-01-01','','Zakończona');
 INSERT INTO people VALUES(1,1,'Dawna osoba','old@example.com','','Pomocnik','Grupa 1','Potwierdzony');
 INSERT INTO meetings VALUES(1,1,'Spotkanie','2026-01-01','19:00','Sala');
 INSERT INTO attendance VALUES(1,1);`);db.close();
 try {
  for(let i=0;i<2;i++){
   const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'0',ALFA_DB:path,ALFA_SEED:'0'},stdio:['ignore','pipe','pipe']});
   const chunk=await once(child.stdout,'data');const port=String(chunk[0]).match(/port (\d+)/)[1];
   const state=await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
   const exited=once(child,'exit');child.kill();await exited;
   assert.equal(state.people.length,1);assert.equal(state.people[0].name,'Dawna osoba');
   assert.equal(state.people[0].enrollments[0].group_name,'Grupa 1');assert.equal(state.attendance.length,1);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});
