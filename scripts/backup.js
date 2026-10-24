import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
const source=process.env.ALFA_DB||resolve('data/alfa.sqlite');
const directory=resolve(process.argv[2]||'data/backups');mkdirSync(directory,{recursive:true,mode:0o700});
const file=resolve(directory,`alpha-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
const db=new DatabaseSync(source,{readOnly:true});
try{db.prepare('VACUUM INTO ?').run(file);chmodSync(file,0o600);console.log('Zapisano spójną kopię SQLite:',file);}finally{db.close();}
