import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {authSchema,createUser,loginName,passwordHash} from './auth.js';
process.umask(0o077);
const path=process.env.ALFA_DB||resolve('data/alfa.sqlite');mkdirSync(dirname(path),{recursive:true});
const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');authSchema(db);
const [command,login]=process.argv.slice(2);
try{
 if(['create-admin','reset-password'].includes(command)){
  loginName(login);
  const existing=db.prepare('SELECT id FROM users WHERE login=?').get(login.toLowerCase());
  if(command==='create-admin'&&existing)throw new Error('Login już istnieje.');
  if(command==='reset-password'&&!existing)throw new Error('Nie znaleziono konta.');
  if(!process.stdin.isTTY)throw new Error('Uruchom w interaktywnym terminalu. Hasło nie może być argumentem polecenia.');
  let muted=false;
  const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
  const rl=createInterface({input:process.stdin,output,terminal:true});
  try{
   const name=command==='create-admin'?await rl.question('Imię organizatora: '):'';
   process.stdout.write('Hasło (min. 12 znaków, ukryte): ');muted=true;
   const password=await rl.question('');
   process.stdout.write('\nPowtórz hasło: ');const repeat=await rl.question('');muted=false;process.stdout.write('\n');
   if(password!==repeat)throw new Error('Hasła różnią się.');
   if(command==='create-admin'){await createUser(db,{login,name,password,admin:true});console.log('Utworzono administratora.');}
   else{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await passwordHash(password),existing.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);console.log('Zmieniono hasło i unieważniono sesje.');}
  }finally{rl.close();}
 }else throw new Error('Użycie: node manage-users.js create-admin LOGIN lub reset-password LOGIN');
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}
