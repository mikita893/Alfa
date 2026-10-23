import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (!db.prepare('SELECT id FROM parishes LIMIT 1').get() && process.env.ALFA_SEED !== '0') {
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO parishes(name,city) VALUES (?,?)').run('Parafia św. Anny', 'Warszawa · dane przykładowe');
    db.prepare('INSERT INTO editions(parish_id,name,date,location,status) VALUES (1,?,?,?,?)').run('Alpha · Jesień 2026', '2026-10-27', 'Dom parafialny, sala na parterze', 'Trwa');
    const people = [
      ['Anna Kowalska','anna@example.com','', 'Koordynator','', 'Potwierdzony'],
      ['ks. Piotr Nowak','piotr@example.com','', 'Duszpasterz','', 'Potwierdzony'],
      ['Marta Wiśniewska','marta@example.com','', 'Prowadzący grupę','Grupa 1', 'Potwierdzony'],
      ['Tomasz Zieliński','tomasz@example.com','', 'Uczestnik','Grupa 1', 'Potwierdzony'],
      ['Julia Wójcik','julia@example.com','', 'Uczestnik','Grupa 1', 'Potwierdzony'],
      ['Michał Kamiński','michal@example.com','', 'Uczestnik','Grupa 2', 'Zgłoszony'],
      ['Zofia Lewandowska','zofia@example.com','', 'Prowadzący grupę','Grupa 2', 'Potwierdzony'],
      ['Paweł Dąbrowski','pawel@example.com','', 'Kuchnia','', 'Potwierdzony']
    ];
    for (const p of people) db.prepare('INSERT INTO people(edition_id,name,email,phone,role,group_name,status) VALUES (1,?,?,?,?,?,?)').run(...p);
    for (const m of [ ['Czy jest w życiu coś więcej?', '2026-10-27'], ['Kim jest Jezus?', '2026-11-03'], ['Dlaczego Jezus umarł?', '2026-11-10'], ['Skąd mieć pewność swojej wiary?', '2026-11-17'] ]) {
      db.prepare('INSERT INTO meetings(edition_id,title,date,time,location) VALUES (1,?,?,?,?)').run(...m,'19:00','Dom parafialny');
    }
    for (const t of [['Przygotować salę i stoły','Anna Kowalska','2026-10-27'],['Ustalić menu na pierwsze spotkanie','Paweł Dąbrowski','2026-10-26'],['Sprawdzić projektor i nagłośnienie','Marta Wiśniewska','2026-10-27']]) {
      db.prepare('INSERT INTO tasks(edition_id,title,owner,date) VALUES (1,?,?,?)').run(...t);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
const fields = {
  parishes: ['name','city'], editions: ['parish_id','name','date','location','status'],
  people: ['edition_id','name','email','phone','role','group_name','status'],
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
      if (key === 'date' && !validDate(data[key])) throw fail('Podaj prawidłową datę.');
      if (key === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data[key])) throw fail('Podaj prawidłową godzinę.');
      if (key === 'email' && data[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[key])) throw fail('Podaj prawidłowy adres e-mail.');
      if (key === 'role' && !roles.includes(data[key])) throw fail('Nieznana rola.');
      if (key === 'status' && !(table === 'people' ? ['Zgłoszony','Potwierdzony','Rezygnacja'] : ['Planowana','Trwa','Zakończona']).includes(data[key])) throw fail('Nieznany status.');
    }
  }
  return data;
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body)>16384) throw fail('Zbyt duże żądanie.',413); }
  try { return JSON.parse(body); } catch { throw fail('Nieprawidłowy JSON.'); }
}
function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        if ((origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') throw fail('Niedozwolone źródło żądania.',403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw fail('Wymagany format JSON.',415);
      }
      if (url.pathname === '/api/state' && req.method === 'GET') {
        const result = Object.fromEntries(Object.keys(fields).map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]));
        result.attendance = db.prepare('SELECT * FROM attendance').all();
        return json(res,200,result);
      }
      if (url.pathname === '/api/attendance' && req.method === 'POST') {
        const b=await readBody(req);
        if (!Number.isSafeInteger(b.meeting_id) || !Number.isSafeInteger(b.person_id) || typeof b.present !== 'boolean') throw fail('Nieprawidłowa obecność.');
        const m=db.prepare('SELECT edition_id FROM meetings WHERE id=?').get(b.meeting_id);
        const p=db.prepare('SELECT edition_id FROM people WHERE id=?').get(b.person_id);
        if (!m || !p || m.edition_id!==p.edition_id) throw fail('Osoba i spotkanie muszą należeć do tej samej edycji.');
        if (b.present) db.prepare('INSERT OR IGNORE INTO attendance VALUES (?,?)').run(b.meeting_id,b.person_id);
        else db.prepare('DELETE FROM attendance WHERE meeting_id=? AND person_id=?').run(b.meeting_id,b.person_id);
        return json(res,200,{ok:true});
      }
      const match=url.pathname.match(/^\/api\/(parishes|editions|people|meetings|tasks)(?:\/(\d+))?$/);
      if (!match) throw fail('Nie znaleziono zasobu.',404);
      const [,table,id] = match;
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
    const files = {'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
    const file=files[url.pathname];
    if (!file) throw fail('Nie znaleziono strony.',404);
    res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache'});
    res.end(req.method==='HEAD' ? undefined : readFileSync(join(root,'public',file[0])));
  } catch(e) {
    if (!e.status) console.error('Request failed:', e.message);
    json(res,e.status||500,{error:e.status ? e.message : 'Wystąpił błąd serwera. Spróbuj ponownie.'});
  }
});
server.listen(Number(process.env.PORT || 3000),'127.0.0.1',()=>console.log(`Alpha: port ${server.address().port} (lokalny prototyp)`));
function shutdown() { server.close(()=>{db.close(); process.exit(0);}); }
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
