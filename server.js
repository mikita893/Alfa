import http from 'node:http';
import { authentication, createUser, passwordHash, checkPassword } from './auth.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.umask(0o077);
const host=process.env.HOST || '127.0.0.1';
const dev=process.env.ALFA_DEV_NO_AUTH==='1';
const publicUrl=process.env.ALFA_PUBLIC_URL;
if(dev && (host!=='127.0.0.1'||process.env.NODE_ENV==='production')) throw new Error('Tryb bez logowania jest dostępny wyłącznie lokalnie poza produkcją.');
if(host!=='127.0.0.1'&&!publicUrl)throw new Error('Ustaw ALFA_PUBLIC_URL na publiczny adres HTTPS.');
if(publicUrl && (!publicUrl.startsWith('https://') || new URL(publicUrl).origin!==publicUrl))throw new Error('ALFA_PUBLIC_URL musi być originem HTTPS bez końcowego ukośnika.');
const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.ALFA_DB || join(root, 'data', 'alfa.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS parishes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS editions (id INTEGER PRIMARY KEY, parish_id INTEGER NOT NULL REFERENCES parishes(id), name TEXT NOT NULL, date TEXT NOT NULL, location TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY, edition_id INTEGER NOT NULL REFERENCES editions(id), name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', role TEXT NOT NULL, group_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY, edition_id INTEGER NOT NULL REFERENCES editions(id), title TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, location TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, edition_id INTEGER NOT NULL REFERENCES editions(id), title TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS attendance (meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE, PRIMARY KEY(meeting_id,person_id));`);

// Versioned additive migration: preserve legacy people and their attendance IDs.
if (!db.prepare('PRAGMA table_info(editions)').all().some(c=>c.name==='end_date')) db.exec("ALTER TABLE editions ADD COLUMN end_date TEXT NOT NULL DEFAULT ''");
db.exec(`CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS person_parishes (person_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE, parish_id INTEGER REFERENCES parishes(id), PRIMARY KEY(person_id,parish_id));
CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, edition_id INTEGER NOT NULL REFERENCES editions(id), group_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, UNIQUE(person_id,edition_id));
CREATE TABLE IF NOT EXISTS enrollment_roles (enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE CASCADE, role_id INTEGER REFERENCES roles(id), PRIMARY KEY(enrollment_id,role_id));
CREATE TABLE IF NOT EXISTS attendance_v2 (meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE, person_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE, PRIMARY KEY(meeting_id,person_id));
CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);`);
if (!db.prepare('SELECT version FROM migrations WHERE version=2').get()) {
  db.exec('BEGIN');
  try {
    for (const role of ['Uczestnik','Koordynator','Duszpasterz','Prowadzący grupę','Pomocnik','Kuchnia','Technika']) db.prepare('INSERT OR IGNORE INTO roles(name) VALUES (?)').run(role);
    for (const p of db.prepare('SELECT * FROM people').all()) {
      db.prepare('INSERT INTO contacts(id,name,email,phone) VALUES (?,?,?,?)').run(p.id,p.name,p.email,p.phone);
      const eid=Number(db.prepare('INSERT INTO enrollments(person_id,edition_id,group_name,status) VALUES (?,?,?,?)').run(p.id,p.edition_id,p.group_name,p.status).lastInsertRowid);
      db.prepare('INSERT OR IGNORE INTO roles(name) VALUES (?)').run(p.role);
      db.prepare('INSERT INTO enrollment_roles VALUES (?,?)').run(eid,db.prepare('SELECT id FROM roles WHERE name=?').get(p.role).id);
    }
    db.exec('INSERT INTO attendance_v2 SELECT * FROM attendance; INSERT INTO migrations VALUES (2); COMMIT');
  } catch(e) {db.exec('ROLLBACK');throw e;}
}
// New tables are the only source of truth; do not retain deleted participants in legacy tables.
db.exec('PRAGMA secure_delete=ON; DROP TABLE IF EXISTS attendance; DROP TABLE IF EXISTS people;');
function seedRequestedEdition() {
  db.exec('BEGIN');
  try {
    const name='Parafia Zmartwychwstania Pańskiego';
    let parish=db.prepare('SELECT id FROM parishes WHERE name=?').get(name);
    if (!parish) parish={id:Number(db.prepare('INSERT INTO parishes(name,city) VALUES (?,?)').run(name,'').lastInsertRowid)};
    let edition=db.prepare('SELECT id FROM editions WHERE parish_id=? AND name=?').get(parish.id,'Jesienna 2026/2027 · Zmartwychwstania Pańskiego');
    if(!edition) edition={id:Number(db.prepare('INSERT INTO editions(parish_id,name,date,end_date,location,status) VALUES (?,?,?,?,?,?)').run(parish.id,'Jesienna 2026/2027 · Zmartwychwstania Pańskiego','2026-10','2027-01','','Trwa').lastInsertRowid)};
    if(!db.prepare('SELECT id FROM contacts WHERE email=?').get('osoba.testowa@example.com')) {
      const id=Number(db.prepare('INSERT INTO contacts(name,email,phone) VALUES (?,?,?)').run('Osoba Testowa','osoba.testowa@example.com','').lastInsertRowid);
      db.prepare('INSERT INTO person_parishes VALUES (?,?)').run(id,parish.id);
      const enrollment=Number(db.prepare("INSERT INTO enrollments(person_id,edition_id,status) VALUES (?,?,'Zgłoszony')").run(id,edition.id).lastInsertRowid);
      db.prepare('INSERT INTO enrollment_roles VALUES (?,?)').run(enrollment,db.prepare("SELECT id FROM roles WHERE name='Uczestnik'").get().id);
    }
    db.exec('COMMIT');
  } catch(e){db.exec('ROLLBACK');throw e;}
}
if(process.env.ALFA_SEED !== '0') seedRequestedEdition();
const fields = {
  roles: ['name'], parishes: ['name','city'], editions: ['parish_id','name','date','end_date','location','status'],
  meetings: ['edition_id','title','date','time','location'], tasks: ['edition_id','title','owner','date','done']
};
const roles = ['Uczestnik','Koordynator','Duszpasterz','Prowadzący grupę','Pomocnik','Kuchnia','Technika'];
const fail = (message, status=400) => Object.assign(new Error(message), { status });
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function validate(table, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Nieprawidłowe dane.');
  const data = {};
  for (const key of fields[table]) {
    if (key.endsWith('_id')) {
      if (!Number.isSafeInteger(Number(body[key])) || Number(body[key]) < 1) throw fail('Wybierz parafię lub edycję.');
      data[key] = Number(body[key]);
      const parent = key === 'parish_id' ? 'parishes' : 'editions';
      if (!db.prepare(`SELECT id FROM ${parent} WHERE id=?`).get(data[key])) throw fail('Nie znaleziono parafii lub edycji.');
    } else if (key === 'done') {
      if (![0,1,false,true,undefined].includes(body[key])) throw fail('Nieprawidłowy stan zadania.');
      data[key] = body[key] ? 1 : 0;
    } else {
      if (body[key] !== undefined && typeof body[key] !== 'string') throw fail('Nieprawidłowy format pola.');
      data[key] = (body[key] || '').trim();
      if (data[key].length > 200) throw fail('Pole może zawierać maksymalnie 200 znaków.');
      if (['name','title','date','time','status','role'].includes(key) && !data[key]) throw fail('Uzupełnij wymagane pola.');
      if (['date','end_date'].includes(key) && data[key] && !(table==='editions' && /^\d{4}-(0[1-9]|1[0-2])$/.test(data[key])) && !validDate(data[key])) throw fail('Podaj prawidłową datę.');
      if (key === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data[key])) throw fail('Podaj prawidłową godzinę.');
      if (key === 'email' && data[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[key])) throw fail('Podaj prawidłowy adres e-mail.');
      if (key === 'role' && !roles.includes(data[key])) throw fail('Nieznana rola.');
      if (key === 'status' && !(table === 'people' ? ['Zgłoszony','Potwierdzony','Rezygnacja'] : ['Planowana','Trwa','Zakończona']).includes(data[key])) throw fail('Nieznany status.');
    }
  }
  if(table==='editions' && (!data.end_date || data.end_date < data.date)) throw fail('Zakończenie musi przypadać w dniu rozpoczęcia lub później.');
  return data;
}
function savePerson(body,id) {
  if(!body||typeof body!=='object')throw fail('Nieprawidłowe dane.');
  const data=validate('parishes',{name:body.name,city:''});
  for(const key of ['email','phone']) if(body[key]!==undefined && (typeof body[key]!=='string' || body[key].length>200)) throw fail('Nieprawidłowy kontakt.');
  const email=(body.email||'').trim(), phone=(body.phone||'').trim();
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Podaj prawidłowy adres e-mail.');
  const affiliations=body.parish_ids??[], enrollments=body.enrollments??[];
  if(!Array.isArray(affiliations)||!Array.isArray(enrollments)||affiliations.length>100||enrollments.length>100) throw fail('Nieprawidłowe powiązania.');
  const exists=(table,id)=>Number.isSafeInteger(id)&&!!db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id);
  if(affiliations.some(id=>!exists('parishes',id))) throw fail('Nie znaleziono parafii.');
  const seen=new Set();
  for(const e of enrollments) {
    if(!e || !exists('editions',e.edition_id)||seen.has(e.edition_id)||!['Zgłoszony','Potwierdzony','Rezygnacja'].includes(e.status)||typeof e.group_name!=='string'||e.group_name.length>200||!Array.isArray(e.role_ids)||e.role_ids.length>100||e.role_ids.some(id=>!exists('roles',id))) throw fail('Sprawdź edycje i role osoby.');
    seen.add(e.edition_id);
  }
  db.exec('BEGIN');
  try {
    if(id) {if(!exists('contacts',id)) throw fail('Nie znaleziono osoby.',404);db.prepare('UPDATE contacts SET name=?,email=?,phone=? WHERE id=?').run(data.name,email,phone,id);}
    else id=Number(db.prepare('INSERT INTO contacts(name,email,phone) VALUES (?,?,?)').run(data.name,email,phone).lastInsertRowid);
    db.prepare('DELETE FROM person_parishes WHERE person_id=?').run(id);
    for(const pid of new Set(affiliations)) db.prepare('INSERT INTO person_parishes VALUES (?,?)').run(id,pid);
    for(const old of db.prepare('SELECT id,edition_id FROM enrollments WHERE person_id=?').all(id)) if(!seen.has(old.edition_id)) {
      db.prepare('DELETE FROM attendance_v2 WHERE person_id=? AND meeting_id IN (SELECT id FROM meetings WHERE edition_id=?)').run(id,old.edition_id);
      db.prepare('DELETE FROM enrollments WHERE id=?').run(old.id);
    }
    for(const e of enrollments) {
      db.prepare('INSERT INTO enrollments(person_id,edition_id,group_name,status) VALUES (?,?,?,?) ON CONFLICT(person_id,edition_id) DO UPDATE SET group_name=excluded.group_name,status=excluded.status').run(id,e.edition_id,e.group_name,e.status);
      const eid=db.prepare('SELECT id FROM enrollments WHERE person_id=? AND edition_id=?').get(id,e.edition_id).id;
      db.prepare('DELETE FROM enrollment_roles WHERE enrollment_id=?').run(eid);
      for(const rid of new Set(e.role_ids)) db.prepare('INSERT INTO enrollment_roles VALUES (?,?)').run(eid,rid);
    }
    db.exec('COMMIT');return id;
  } catch(e){db.exec('ROLLBACK');throw e;}
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>16384) throw fail('Zbyt duże żądanie.',413); }
  try { return JSON.parse(body); } catch { throw fail('Nieprawidłowy JSON.'); }
}
function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
const authenticate=authentication(db,{dev,publicUrl,readBody,json});
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    const user=await authenticate(req,res,url);
    if(!user)return;
    if(url.pathname==='/api/me'&&req.method==='GET')return json(res,200,{id:user.id,name:user.name,admin:!!user.admin,csrf:user.csrf});
    if(url.pathname==='/api/password'&&req.method==='POST'){
      const body=await readBody(req),account=db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
      if(!account||typeof body?.old_password!=='string'||body.old_password.length>128||!await checkPassword(body.old_password,account.password_hash))throw fail('Nieprawidłowe obecne hasło.',403);
      const encoded=await passwordHash(body.new_password);
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded,user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      db.prepare('INSERT INTO audit(user_id,action,target) VALUES (?,?,?)').run(user.id,'change-password','self');
      return json(res,200,{ok:true});
    }
    if(url.pathname==='/api/users'&&req.method==='GET'){
      if(!user.admin)throw fail('Wymagane uprawnienia administratora.',403);
      return json(res,200,db.prepare('SELECT id,login,name,admin,active FROM users ORDER BY name').all());
    }
    if(url.pathname==='/api/users'&&req.method==='POST'){
      if(!user.admin)throw fail('Wymagane uprawnienia administratora.',403);
      const id=await createUser(db,await readBody(req));
      db.prepare('INSERT INTO audit(user_id,action,target) VALUES (?,?,?)').run(user.id,'create-user',String(id));
      return json(res,201,{id});
    }
    const disable=url.pathname.match(/^\/api\/users\/(\d+)\/disable$/);
    if(disable&&req.method==='POST'){
      if(!user.admin)throw fail('Wymagane uprawnienia administratora.',403);
      const id=Number(disable[1]);if(id===user.id)throw fail('Nie możesz zablokować własnego konta.');
      if(!db.prepare('UPDATE users SET active=0 WHERE id=?').run(id).changes)throw fail('Nie znaleziono konta.',404);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      db.prepare('INSERT INTO audit(user_id,action,target) VALUES (?,?,?)').run(user.id,'disable-user',String(id));
      return json(res,200,{ok:true});
    }
    if(user.id&&!['GET','HEAD'].includes(req.method))res.once('finish',()=>{if(res.statusCode<400)db.prepare('INSERT INTO audit(user_id,action,target) VALUES (?,?,?)').run(user.id,req.method,url.pathname);});
    if (url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        if ((origin && origin !== (publicUrl || `http://${req.headers.host}`)) || req.headers['sec-fetch-site'] === 'cross-site') throw fail('Niedozwolone źródło żądania.',403);
        if (req.headers['content-type']?.split(';')[0].trim()!=='application/json') throw fail('Wymagany format JSON.',415);
      }
      if (url.pathname === '/api/state' && req.method === 'GET') {
        const result = Object.fromEntries(Object.keys(fields).map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]));
        result.people=db.prepare('SELECT * FROM contacts ORDER BY name').all().map(p=>({...p,parish_ids:db.prepare('SELECT parish_id FROM person_parishes WHERE person_id=?').all(p.id).map(x=>x.parish_id),enrollments:db.prepare('SELECT * FROM enrollments WHERE person_id=?').all(p.id).map(e=>({...e,role_ids:db.prepare('SELECT role_id FROM enrollment_roles WHERE enrollment_id=?').all(e.id).map(x=>x.role_id)}))}));
        result.attendance = db.prepare('SELECT * FROM attendance_v2').all();
        return json(res,200,result);
      }
      if (url.pathname === '/api/attendance' && req.method === 'POST') {
        const b=await readBody(req);
        if (!Number.isSafeInteger(b.meeting_id) || !Number.isSafeInteger(b.person_id) || typeof b.present !== 'boolean') throw fail('Nieprawidłowa obecność.');
        const m=db.prepare('SELECT edition_id FROM meetings WHERE id=?').get(b.meeting_id);
        const p=db.prepare('SELECT edition_id FROM enrollments WHERE person_id=? AND edition_id=?').get(b.person_id,m?.edition_id??0);
        if (!m || !p || m.edition_id!==p.edition_id) throw fail('Osoba i spotkanie muszą należeć do tej samej edycji.');
        if (b.present) db.prepare('INSERT OR IGNORE INTO attendance_v2 VALUES (?,?)').run(b.meeting_id,b.person_id);
        else db.prepare('DELETE FROM attendance_v2 WHERE meeting_id=? AND person_id=?').run(b.meeting_id,b.person_id);
        return json(res,200,{ok:true});
      }
      const match=url.pathname.match(/^\/api\/(parishes|editions|people|meetings|tasks|roles)(?:\/(\d+))?$/);
      if (!match) throw fail('Nie znaleziono zasobu.',404);
      const [,table,id] = match;
      if(table==='people') {
        if((req.method==='POST'&&!id)||(req.method==='PUT'&&id)) return json(res,id?200:201,{id:savePerson(await readBody(req),id?Number(id):undefined)});
        if(req.method==='DELETE'&&id) {const r=db.prepare('DELETE FROM contacts WHERE id=?').run(Number(id));if(!r.changes) throw fail('Nie znaleziono osoby.',404);return json(res,200,{ok:true});}
        throw fail('Niedozwolona operacja.',405);
      }
      if (req.method === 'POST' && !id) {
        const data=validate(table, await readBody(req));
        const result=db.prepare(`INSERT INTO ${table} (${fields[table].join(',')}) VALUES (${fields[table].map(()=>'?').join(',')})`).run(...Object.values(data));
        return json(res,201,{id:Number(result.lastInsertRowid)});
      }
      if (id && req.method === 'PUT') {
        const existing=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));
        if (!existing) throw fail('Nie znaleziono wpisu.',404);
        const data=validate(table, await readBody(req));
        if (data.edition_id && data.edition_id!==existing.edition_id || data.parish_id && data.parish_id!==existing.parish_id) throw fail('Nie można przenosić wpisu między edycjami lub parafiami.');
        db.prepare(`UPDATE ${table} SET ${fields[table].map(f=>`${f}=?`).join(',')} WHERE id=?`).run(...Object.values(data),Number(id));
        return json(res,200,{ok:true});
      }
      if (id && req.method === 'DELETE' && ['people','tasks','meetings'].includes(table)) {
        const result=db.prepare(`DELETE FROM ${table} WHERE id=?`).run(Number(id));
        if (!result.changes) throw fail('Nie znaleziono wpisu.',404);
        return json(res,200,{ok:true});
      }
      throw fail('Niedozwolona operacja.',405);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw fail('Niedozwolona operacja.',405);
    const files = {'/login':['login.html','text/html; charset=utf-8'],'/auth-client.js':['auth-client.js','text/javascript; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
    const file=files[url.pathname];
    if (!file) throw fail('Nie znaleziono strony.',404);
    res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache'});
    res.end(req.method==='HEAD' ? undefined : readFileSync(join(root,'public',file[0])));
  } catch(e) {
    if(e.code?.startsWith('ERR_SQLITE') && e.message.includes('UNIQUE')) e=fail('Taka nazwa już istnieje.');
    if (!e.status) console.error('Request failed:', e.message);
    json(res,e.status||500,{error:e.status ? e.message : 'Wystąpił błąd serwera. Spróbuj ponownie.'});
  }
});
server.listen(Number(process.env.PORT || 3000),host,()=>console.log(`Alpha: port ${server.address().port} (lokalny prototyp)`));
function shutdown() { server.close(()=>{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close(); process.exit(0);}); }
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
