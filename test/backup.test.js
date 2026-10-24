import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readdir,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('Backup contains committed WAL data and has restricted file permissions',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'alpha-backup-'));
 const source=join(directory,'source.sqlite'),dest=join(directory,'copies');
 const db=new DatabaseSync(source);db.exec("PRAGMA journal_mode=WAL; CREATE TABLE example(value TEXT); INSERT INTO example VALUES ('committed');");
 try{
  const r=spawnSync(process.execPath,['scripts/backup.js',dest],{env:{...process.env,ALFA_DB:source},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const file=join(dest,(await readdir(dest))[0]);const copy=new DatabaseSync(file,{readOnly:true});
  try{assert.equal(copy.prepare('SELECT value FROM example').get().value,'committed');assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{copy.close();}
  assert.equal((await stat(file)).mode&0o777,0o600);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
