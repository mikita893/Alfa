import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(derive);
const hash=value=>createHash('sha256').update(value).digest('hex');
export function authSchema(db) {
 db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL, touched INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, user_id INTEGER, action TEXT NOT NULL, target TEXT NOT NULL);`);
}
export async function passwordHash(password) {
 if(typeof password!=='string'||password.length<12||password.length>128) throw Object.assign(new Error('Hasło musi mieć od 12 do 128 znaków.'),{status:400});
 const salt=randomBytes(16).toString('hex');
 const key=await scrypt(password,salt,64);
 return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password, encoded) {
 const [,salt,key]=encoded.split(':');
 const actual=await scrypt(password,salt,64);
 return timingSafeEqual(actual,Buffer.from(key,'hex'));
}
export function loginName(value) {
 if(typeof value!=='string'||! /^[a-zA-Z0-9@._+-]{3,120}$/.test(value)) throw Object.assign(new Error('Login: 3–120 znaków, bez spacji (może być e-mail).'),{status:400});
 return value.toLowerCase();
}
export async function createUser(db,body) {
 const login=loginName(body.login);
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.admin!=='boolean') throw Object.assign(new Error('Sprawdź nazwę użytkownika i uprawnienia.'),{status:400});
 const encoded=await passwordHash(body.password);
 return Number(db.prepare('INSERT INTO users(login,name,password_hash,admin) VALUES (?,?,?,?)').run(login,body.name.trim(),encoded,Number(body.admin)).lastInsertRowid);
}
export function authentication(db,{dev=false, publicUrl, readBody, json}) {
 authSchema(db);
 const secure=!!publicUrl;
 const cookieName=secure?'__Host-alpha_session':'alpha_session';
 const attempts=new Map(), networkAttempts=new Map();let pending=0;
 const respond=(res,code,error)=>{json(res,code,{error});return null;};
 const originAllowed=req=>(!req.headers.origin||req.headers.origin===(publicUrl||`http://${req.headers.host}`)) && req.headers['sec-fetch-site']!=='cross-site';
 const sessionCookie=(token,age)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
 return async(req,res,url)=>{
  res.setHeader('Cache-Control','no-store');
  if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  const mutation=!['GET','HEAD'].includes(req.method);
  if(mutation && (!originAllowed(req)||req.headers['content-type']?.split(';')[0].trim()!=='application/json')) return respond(res,403,'Niedozwolone źródło lub format żądania.');
  if(url.pathname==='/api/login'&&req.method==='POST'){
   const b=await readBody(req);if(!b||typeof b!=='object')return respond(res,400,'Nieprawidłowe dane.');const login=typeof b?.login==='string'?b.login.toLowerCase().slice(0,120):'';
   const key=hash((req.socket.remoteAddress||'')+':'+login);const now=Date.now();
   for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
   for(const [k,v]of networkAttempts)if(v.until<now)networkAttempts.delete(k);
   const networkKey=hash(req.socket.remoteAddress||'');
   const network=networkAttempts.get(networkKey)||{count:0,until:now+15*60*1000};
   if(network.count>=120){res.setHeader('Retry-After','900');return respond(res,429,'Za dużo prób. Spróbuj za 15 minut.');}
   network.count++;networkAttempts.set(networkKey,network);
   const a=attempts.get(key)||{count:0,until:now+15*60*1000};
   if(a.count>=10||pending>=4||attempts.size>=10000){res.setHeader('Retry-After','900');return respond(res,429,'Za dużo prób. Spróbuj za 15 minut.');}
   a.count++;attempts.set(key,a);
   if(typeof b.password!=='string'||b.password.length>128)return respond(res,401,'Nieprawidłowy login lub hasło.');
   const user=db.prepare('SELECT * FROM users WHERE login=? AND active=1').get(login);
   pending++;
   let valid;
   try {valid=await checkPassword(b.password,user?.password_hash||'scrypt:00000000000000000000000000000000:'+ '00'.repeat(64));}finally{pending--;}
   if(!user||!valid||!db.prepare('SELECT id FROM users WHERE id=? AND active=1 AND password_hash=?').get(user.id,user.password_hash))return respond(res,401,'Nieprawidłowy login lub hasło.');
   attempts.delete(key);
   const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
   db.prepare('DELETE FROM sessions WHERE expires<? OR touched<?').run(now,now-30*60*1000);
   db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(hash(token),user.id,csrf,now+8*3600000,now);
   res.setHeader('Set-Cookie',sessionCookie(token,8*3600));
   db.prepare('INSERT INTO audit(user_id,action,target) VALUES (?,?,?)').run(user.id,'login','session');
   json(res,200,{ok:true});return null;
  }
  const publicFiles=['/login','/auth-client.js','/style.css'];
  if(publicFiles.includes(url.pathname)&&['GET','HEAD'].includes(req.method))return {public:true};
  if(dev)return {id:null,name:'Tryb testowy',admin:true,csrf:'development'};
  const token=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  const now=Date.now();
  const user=/^[a-f0-9]{64}$/.test(token)?db.prepare('SELECT u.id,u.name,u.login,u.admin,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires>? AND touched>? AND u.active=1').get(hash(token),now,now-30*60*1000):null;
  if(!user){
   if(!url.pathname.startsWith('/api/')){res.writeHead(303,{Location:'/login'});res.end();return null;}
   return respond(res,401,'Zaloguj się ponownie.');
  }
  if(mutation&&req.headers['x-csrf-token']!==user.csrf)return respond(res,403,'Odśwież stronę i spróbuj ponownie.');
  db.prepare('UPDATE sessions SET touched=? WHERE token_hash=?').run(now,hash(token));
  if(url.pathname==='/api/logout'&&req.method==='POST'){
   db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));res.setHeader('Set-Cookie',sessionCookie('',0));json(res,200,{ok:true});return null;
  }
  return user;
 };
}
