let currentUser;
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles = () => state.roles.map(r=>r.name);
let state, parishId, editionId, view = 'people', search = '', roleFilter = '', groupFilter = '', formContext;
const today = () => new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Warsaw'});
const dateLabel = (date, options={day:'numeric',month:'long'}) => date ? new Date(`${date.length===7?date+'-01':date}T12:00:00`).toLocaleDateString('pl-PL', options) : '—';
let showAllPeople=false;
const people = () => state.people.filter(p=>showAllPeople || p.enrollments.some(e=>e.edition_id===editionId)).map(p=>{
 const e=p.enrollments.find(e=>e.edition_id===editionId);
 const names=e?.role_ids.map(id=>state.roles.find(r=>r.id===id)?.name).filter(Boolean)||[];
 return {...p,role:names.join(', '),role_names:names,group_name:e?.group_name||'',status:e?.status||'Bez edycji'};
});
const meetings = () => state.meetings.filter(m=>m.edition_id===editionId).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
const tasks = () => state.tasks.filter(t=>t.edition_id===editionId).sort((a,b)=>a.done-b.done || a.date.localeCompare(b.date));
const edition = () => state.editions.find(e=>e.id===editionId);
const initials = name => name.replace(/^ks\.\s*/,'').split(/\s+/).slice(0,2).map(s=>s[0]).join('');
const badge = status => `<span class="badge ${['Potwierdzony','Trwa'].includes(status)?'green':status==='Rezygnacja'?'gray':'amber'}">${esc(status)}</span>`;
const empty = (title, text, action='', label='') => `<div class="empty"><span class="empty-symbol">✳</span><h3>${title}</h3><p>${text}</p>${action?`<button class="button primary" data-add="${action}">${label}</button>`:''}</div>`;
async function api(path, method='GET', body) {
  const response=await fetch(`/api/${path}`, {method, headers:body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':currentUser?.csrf||''}, body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401){location.replace('/login');throw new Error('Sesja wygasła. Zaloguj się ponownie.');}
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || 'Nie udało się zapisać danych.');
  return data;
}
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3500); }
async function refresh() {
  state=await api('state');
  if(!state.parishes.some(p=>p.id===parishId)) parishId=(state.parishes.find(p=>p.name==='Parafia Zmartwychwstania Pańskiego')||state.parishes[0])?.id;
  const editions=state.editions.filter(e=>e.parish_id===parishId);
  if(!editions.some(e=>e.id===editionId)) editionId=editions[0]?.id;
  $('#parish').innerHTML=state.parishes.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#parish').value=parishId || '';
  $('#edition').innerHTML=editions.length?editions.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join(''):'<option>Brak edycji</option>';
  $('#edition').value=editionId || 'Brak edycji';
  render();
}
function render() {
  const titles={dashboard:['Spokojnie. Wszystko pod kontrolą.','Mniej organizowania, więcej miejsca na spotkanie.','＋ Dodaj osobę','people'],people:['Uczestnicy','Jedna karta osoby. Wszystkie edycje i role w jednym miejscu.','＋ Dodaj osobę','people'],meetings:['Spotkajmy się przy jednym stole.','Zaplanuj kolejne wieczory i zaznacz obecności.','＋ Dodaj spotkanie','meetings'],tasks:['Dobra organizacja to praca zespołowa.','Małe zadania, wspólna odpowiedzialność.','＋ Dodaj zadanie','tasks'],settings:['Jedna przestrzeń. Wiele wspólnot.','Zarządzaj parafiami i kolejnymi edycjami kursu.','＋ Dodaj parafię','parishes']};
  const [title,description,action,table]=titles[view];
  $('#page-title').textContent=title; $('#page-description').textContent=description;
  $('#main-action').textContent=action; $('#main-action').dataset.add=table;
  $('#main-action').disabled=!editionId && !['people','settings'].includes(view);
  $('#breadcrumb').textContent=`Twoja przestrzeń / ${{dashboard:'Pulpit',people:'Osoby i grupy',meetings:'Spotkania',tasks:'Zadania zespołu',settings:'Parafie i edycje'}[view]}`;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const e=edition();
  $('#edition-name').textContent=e?.name || 'Zacznij od nowej edycji';
  $('#edition-description').textContent=e?`${e.location || 'Miejsce do ustalenia'} · ${e.date.length===7?e.date:dateLabel(e.date)} — ${e.end_date||'ustal zakończenie'}`:'Dodaj edycję w zakładce Parafie i edycje';
  $('#edition-status').textContent=e?.status || '';
  if(!editionId && !['people','settings'].includes(view)) { $('#view').innerHTML=empty('Nowy początek','Dodaj edycję Alpha, aby zaprosić osoby i zaplanować spotkania.','editions','Utwórz edycję'); return; }
  ({dashboard:renderDashboard,people:renderPeople,meetings:renderMeetings,tasks:renderTasks,settings:renderSettings})[view]();
}
function meetingCard(m, compact=false) {
  const d=new Date(`${m.date}T12:00:00`);
  const count=state.attendance.filter(a=>a.meeting_id===m.id).length;
  return `<article class="meeting-card ${compact?'compact':''}"><div class="date-tile"><span>${esc(d.toLocaleDateString('pl-PL',{month:'short'}).replace('.',''))}</span><strong>${d.getDate()}</strong></div><div class="meeting-info"><span class="small-label">${esc(d.toLocaleDateString('pl-PL',{weekday:'long'}))} · ${esc(m.time)}</span><h3>${esc(m.title)}</h3><p>⌖ ${esc(m.location || 'Miejsce do ustalenia')}</p></div><div class="meeting-actions">${compact?`<button class="text-button" data-attendance="${m.id}">Szczegóły ↗</button>`:`<span class="muted">${count} obecnych</span><button class="button secondary" data-attendance="${m.id}">Obecności</button><button class="icon-button" data-edit="meetings" data-id="${m.id}" aria-label="Edytuj spotkanie">✎</button>`}</div></article>`;
}
function taskRow(t) {
  const overdue=!t.done && t.date<today();
  return `<div class="task-row ${t.done?'completed':''}"><input type="checkbox" data-toggle-task="${t.id}" ${t.done?'checked':''} aria-label="Ukończ: ${esc(t.title)}"><div><strong>${esc(t.title)}</strong><span>${esc(t.owner || 'Bez przypisania')} <span class="${overdue?'overdue':''}">· ${dateLabel(t.date)}</span></span></div><button class="icon-button" data-edit="tasks" data-id="${t.id}" aria-label="Edytuj zadanie">✎</button></div>`;
}
function renderDashboard() {
  const participants=people().filter(p=>p.role_names.includes('Uczestnik')&&p.status!=='Rezygnacja');
  const team=people().filter(p=>!p.role_names.includes('Uczestnik')&&p.status!=='Rezygnacja');
  const groups=new Set(people().filter(p=>p.status!=='Rezygnacja').map(p=>p.group_name).filter(Boolean));
  const upcoming=meetings().filter(m=>m.date>=today()).slice(0,2);
  const pending=tasks().filter(t=>!t.done);
  $('#view').innerHTML=`<div class="stats-grid">${[['♧',participants.length,'Uczestnicy',`${participants.filter(p=>p.status==='Potwierdzony').length} potwierdzonych`],['◇',team.length,'Osoby w zespole','Razem tworzymy Alpha'],['◉',groups.size,'Małe grupy','Przestrzeń do rozmowy'],['☑',pending.length,'Otwarte zadania',pending.length?'Działamy krok po kroku':'Wszystko zrobione!']].map(([icon,n,label,sub])=>`<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong>${n}</strong><small>${sub}</small></div>`).join('')}</div>
  <div class="dashboard-columns"><section class="panel"><div class="section-heading"><div><span class="eyebrow">KALENDARZ ALPHA</span><h2>Najbliższe spotkania</h2></div><button class="text-button" data-view="meetings">Wszystkie ↗</button></div>${upcoming.length?upcoming.map(m=>meetingCard(m,true)).join(''):empty('Chwila na planowanie','Nie ma nadchodzących spotkań.','meetings','Dodaj spotkanie')}<div class="gentle-note"><span>✳</span><div><strong>Najważniejsze dzieje się przy stole.</strong><p>Zadbaj o ciepłe przyjęcie. Reszta zaczyna się od rozmowy.</p></div></div></section>
  <section class="panel"><div class="section-heading"><div><span class="eyebrow">DO ZROBIENIA</span><h2>Małe kroki na dziś</h2></div><button class="text-button" data-view="tasks">Wszystkie ↗</button></div>${pending.length?pending.slice(0,4).map(taskRow).join(''):empty('Wszystko gotowe','Zespół jest na bieżąco.')}<button class="add-inline" data-add="tasks">＋ Dodaj zadanie</button></section></div>
  <section class="panel people-preview"><div class="section-heading"><div><span class="eyebrow">LUDZIE SĄ W CENTRUM</span><h2>Ostatnio dodane osoby</h2></div><button class="text-button" data-view="people">Zobacz wszystkich ↗</button></div>${people().length?personTable(people().slice(-4).reverse(),false):empty('Zacznij od ludzi','Dodaj pierwszego uczestnika lub osobę z zespołu.','people','Dodaj osobę')}</section>`;
}
function personTable(list,editable=true) {
  return `<div class="table-wrap"><table><thead><tr><th>Osoba</th><th>Rola</th><th>Grupa</th><th>Status</th>${editable?'<th><span class="sr-only">Akcje</span></th>':''}</tr></thead><tbody>${list.map(p=>`<tr><td><div class="person-cell"><span class="avatar tone-${p.id%4}">${esc(initials(p.name))}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.email || p.phone || 'Brak danych kontaktowych')}</small></div></div></td><td>${esc(p.role||'Bez roli')}</td><td>${p.group_name?`<span class="group-tag">${esc(p.group_name)}</span>`:'<span class="muted">Nieprzypisana</span>'}</td><td>${badge(p.status)}</td>${editable?`<td><button class="text-button" data-edit="people" data-id="${p.id}">Edytuj</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function renderPeople() {
  const groups=[...new Set(people().map(p=>p.group_name).filter(Boolean))].sort();
  const list=people().filter(p=>(!search || `${p.name} ${p.email} ${p.phone}`.toLocaleLowerCase('pl').includes(search.toLocaleLowerCase('pl')))&&(!roleFilter||p.role_names.includes(roleFilter))&&(!groupFilter||p.group_name===groupFilter));
  $('#view').innerHTML=`<section class="panel"><div class="list-toolbar"><div><h2>Osoby <span class="count">${people().length}</span></h2><p class="muted">${showAllPeople?'Wspólna baza osób, również bez przypisanej edycji.':'Osoby w wybranej edycji. Kliknij Edytuj, aby otworzyć kartę.'}</p></div><div class="filters"><select id="people-scope" aria-label="Zakres osób"><option value="edition" ${!showAllPeople?'selected':''}>Wybrana edycja</option><option value="all" ${showAllPeople?'selected':''}>Wszystkie osoby</option></select><label class="sr-only" for="search">Szukaj osoby</label><input id="search" type="search" placeholder="Szukaj osoby…" value="${esc(search)}"><select id="role-filter" aria-label="Filtruj role"><option value="">Wszystkie role</option>${roles().map(r=>`<option ${r===roleFilter?'selected':''}>${esc(r)}</option>`).join('')}</select><select id="group-filter" aria-label="Filtruj grupy"><option value="">Wszystkie grupy</option>${groups.map(g=>`<option ${g===groupFilter?'selected':''}>${esc(g)}</option>`).join('')}</select></div></div>${list.length?personTable(list):empty('Brak osób do wyświetlenia','Zmień filtry lub dodaj pierwszą osobę.','people','Dodaj osobę')}</section>`;
}
function renderMeetings() {
  $('#view').innerHTML=`<section class="panel"><div class="section-heading"><div><span class="eyebrow">KROK PO KROKU</span><h2>Harmonogram spotkań <span class="count">${meetings().length}</span></h2></div></div>${meetings().length?meetings().map(m=>meetingCard(m)).join(''):empty('Pierwsze spotkanie przed Wami','Ustal temat, termin i miejsce.','meetings','Dodaj spotkanie')}</section>`;
}
function renderTasks() {
  const list=tasks(), done=list.filter(t=>t.done).length;
  $('#view').innerHTML=`<section class="panel"><div class="section-heading"><div><span class="eyebrow">WSPÓLNIE DAMY RADĘ</span><h2>Zadania zespołu</h2><p class="muted">${done} z ${list.length} zadań ukończonych</p></div><span class="badge green">${list.length?Math.round(done/list.length*100):0}% gotowe</span></div>${list.length?list.map(taskRow).join(''):empty('Czysta lista, dobry początek','Zapisz pierwsze zadanie i przypisz odpowiedzialną osobę.','tasks','Dodaj zadanie')}</section>`;
}
function renderSettings() {
  const parish=state.parishes.find(p=>p.id===parishId);
  const list=state.editions.filter(e=>e.parish_id===parishId);
  $('#view').innerHTML=`<div class="settings-grid"><section class="panel"><div class="section-heading"><div><span class="eyebrow">TWOJA WSPÓLNOTA</span><h2>${esc(parish?.name || 'Dodaj parafię')}</h2><p class="muted">${esc(parish?.city || '')}</p></div>${parish?`<button class="text-button" data-edit="parishes" data-id="${parish.id}">Edytuj</button>`:''}</div><p class="settings-copy">Parafia ma wiele edycji. Osoba może należeć do wielu parafii i edycji, albo pozostać bez przypisania. Przełączysz parafię w menu po lewej stronie.</p><div class="info-note">Wersja lokalna dla organizatorów. Przed wprowadzeniem rzeczywistych danych potrzebne są logowanie, kontrola dostępu i ustalenie zasad przetwarzania danych.</div></section><section class="panel"><div class="section-heading"><div><span class="eyebrow">KOLEJNE POCZĄTKI</span><h2>Edycje Alpha</h2></div><button class="text-button" data-add="editions" ${!parishId?'disabled':''}>＋ Nowa edycja</button></div>${list.length?list.map(e=>`<div class="edition-row"><div><strong>${esc(e.name)}</strong><small>${esc(e.date)} — ${esc(e.end_date||'do ustalenia')} · ${esc(e.location || 'Miejsce do ustalenia')}</small></div>${badge(e.status)}<button class="text-button" data-edit="editions" data-id="${e.id}">Edytuj</button></div>`).join(''):empty('Pierwsza edycja','Dodaj edycję dla tej parafii.','editions','Dodaj edycję')}</section></div><section class="panel roles-panel"><div class="section-heading"><div><span class="eyebrow">WŁASNY SŁOWNIK</span><h2>Role w edycjach</h2></div><button class="text-button" data-add="roles">＋ Dodaj rolę</button></div><div class="role-list">${state.roles.map(r=>`<button class="role-chip" data-edit="roles" data-id="${r.id}">${esc(r.name)} <span>✎</span></button>`).join('')}</div></section>`;
}
function input(name,label,type='text',required=false,value='') {
  return `<label class="field"><span>${label}${required?' <span class="required">*</span>':''}</span><input name="${name}" type="${type}" ${required?'required':''} maxlength="200" value="${esc(value)}"></label>`;
}
function select(name,label,options,value='') {
  return `<label class="field"><span>${label}</span><select name="${name}">${options.map(o=>`<option ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
}
function openForm(table,id) {
  if(['meetings','tasks'].includes(table)&&!editionId) return;
  if(table==='editions'&&!parishId) return toast('Najpierw dodaj parafię.');
  const item=id?state[table].find(x=>x.id===Number(id)):{};
  formContext={table,id,item};
  const names={people:'osobę',meetings:'spotkanie',tasks:'zadanie',parishes:'parafię',editions:'edycję',roles:'rolę'};
  $('#modal-title').textContent=`${id?'Edytuj':'Dodaj'} ${names[table]}`;
  $('#form-error').textContent=''; $('#save-button').hidden=false;
  const v=(key,fallback='')=>item[key]??fallback;
  let html='';
  if(table==='roles') html=input('name','Nazwa roli','text',true,v('name'));
  if(table==='parishes') html=input('name','Nazwa parafii','text',true,v('name'))+input('city','Miejscowość','text',false,v('city'));
  if(table==='editions') html=input('name','Nazwa edycji','text',true,v('name'))+input('date','Rozpoczęcie','month',true,v('date',today()).slice(0,7))+input('end_date','Zakończenie','month',true,v('end_date',today()).slice(0,7))+input('location','Miejsce spotkań','text',false,v('location'))+select('status','Status',['Planowana','Trwa','Zakończona'],v('status','Planowana'));
  if(table==='people') {
    const enrollments=item.enrollments || (editionId?[{edition_id:editionId,status:'Zgłoszony',group_name:'',role_ids:[state.roles.find(r=>r.name==='Uczestnik')?.id].filter(Boolean)}]:[]);
    html=input('name','Imię i nazwisko','text',true,v('name'))+`<div class="field-grid">${input('email','E-mail','email',false,v('email'))}${input('phone','Telefon','tel',false,v('phone'))}</div>`;
    html+=`<details class="relationships" ${id?'':'open'}><summary>Edycje i role <span>· opcjonalne</span></summary><p class="form-note">Ta sama osoba może uczestniczyć lub służyć w wielu edycjach. Odznaczenie edycji usuwa jej przypisanie i obecności.</p>${state.editions.map(e=>{
      const member=enrollments.find(x=>x.edition_id===e.id);
      return `<fieldset class="membership" data-enrollment="${e.id}"><label class="check-field"><input type="checkbox" name="join_${e.id}" ${member?'checked':''}><strong>${esc(e.name)}</strong></label><small>${esc(state.parishes.find(p=>p.id===e.parish_id)?.name)}</small><div class="membership-fields" ${member?'':'hidden'}>${select('status_'+e.id,'Status',['Zgłoszony','Potwierdzony','Rezygnacja'],member?.status||'Zgłoszony')}${input('group_'+e.id,'Grupa','text',false,member?.group_name||'')}<span class="small-label">Role w tej edycji (możesz wybrać kilka)</span><div class="role-checkboxes">${state.roles.map(r=>`<label class="check-field"><input type="checkbox" name="role_${e.id}_${r.id}" ${member?.role_ids.includes(r.id)?'checked':''}>${esc(r.name)}</label>`).join('')}</div></div></fieldset>`;
    }).join('')}</details>`;
    html+=`<details class="relationships"><summary>Powiązania z parafiami <span>· opcjonalne</span></summary>${state.parishes.map(p=>`<label class="check-field"><input type="checkbox" name="parish_${p.id}" ${item.parish_ids?.includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</details>`;
  }
  if(table==='meetings') html=input('title','Temat spotkania','text',true,v('title'))+`<div class="field-grid">${input('date','Data','date',true,v('date',today()))}${input('time','Godzina','time',true,v('time','19:00'))}</div>`+input('location','Miejsce','text',false,v('location',edition()?.location));
  if(table==='tasks') html=input('title','Co trzeba zrobić?','text',true,v('title'))+input('owner','Osoba odpowiedzialna','text',false,v('owner'))+input('date','Termin','date',true,v('date',today()))+`<label class="check-field"><input type="checkbox" name="done" ${item.done?'checked':''}> Zadanie ukończone</label>`;
  if(id&&['people','tasks','meetings'].includes(table)) html+='<button type="button" class="delete-button" id="delete-entry">Usuń wpis</button>';
  $('#form-fields').innerHTML=html;
  $('#modal').showModal();
}
function openAttendance(id) {
  const m=state.meetings.find(m=>m.id===Number(id));
  formContext=null;
  $('#modal-title').textContent=m.title;
  $('#form-error').textContent=''; $('#save-button').hidden=true;
  const list=people().filter(p=>p.status!=='Rezygnacja');
  $('#form-fields').innerHTML=`<p class="muted">${dateLabel(m.date)} · ${esc(m.time)} · obecność zapisuje się od razu</p><div class="attendance-list">${list.length?list.map(p=>`<label class="attendance-row"><span class="avatar tone-${p.id%4}">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.role)}${p.group_name?' · '+esc(p.group_name):''}</small></span><input type="checkbox" data-attendance-person="${p.id}" data-meeting="${m.id}" ${state.attendance.some(a=>a.meeting_id===m.id&&a.person_id===p.id)?'checked':''} aria-label="Obecność: ${esc(p.name)}"></label>`).join(''):'<p>Dodaj osoby do tej edycji.</p>'}</div>`;
  $('#modal').showModal();
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b || b.disabled) return;
  if(b.dataset.view) { view=b.dataset.view; search='';roleFilter='';groupFilter='';render(); }
  if(b.dataset.add) openForm(b.dataset.add);
  if(b.dataset.edit) openForm(b.dataset.edit,b.dataset.id);
  if(b.dataset.attendance) openAttendance(b.dataset.attendance);
  if(['close-modal','cancel-modal'].includes(b.id)) $('#modal').close();
  if(b.id==='delete-entry' && formContext) {
    if(!confirm('Usunąć ten wpis? Powiązane obecności również zostaną usunięte.')) return;
    b.disabled=true;
    try { await api(`${formContext.table}/${formContext.id}`,'DELETE',{}); $('#modal').close(); await refresh();toast('Wpis usunięty.'); }
    catch(err) {$('#form-error').textContent=err.message;b.disabled=false;}
  }
});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.id==='parish') { parishId=Number(t.value);editionId=undefined;search='';roleFilter='';groupFilter='';await initialize().catch(err=>toast(err.message)); }
  if(t.id==='edition') { editionId=Number(t.value);search='';roleFilter='';groupFilter='';render(); }
  if(t.name?.startsWith('join_')) t.closest('fieldset').querySelector('.membership-fields').hidden=!t.checked;
  if(t.id==='people-scope') {showAllPeople=t.value==='all';renderPeople();}
  if(t.id==='role-filter') {roleFilter=t.value;renderPeople();}
  if(t.id==='group-filter') {groupFilter=t.value;renderPeople();}
  if(t.dataset.toggleTask) {
    t.disabled=true;const item=state.tasks.find(x=>x.id===Number(t.dataset.toggleTask));
    try {await api(`tasks/${item.id}`,'PUT',{...item,done:t.checked});await refresh();}
    catch(err) {t.checked=!t.checked;t.disabled=false;toast(err.message);}
  }
  if(t.dataset.attendancePerson) {
    t.disabled=true;
    try {await api('attendance','POST',{person_id:Number(t.dataset.attendancePerson),meeting_id:Number(t.dataset.meeting),present:t.checked}); await refresh();}
    catch(err) {t.checked=!t.checked;toast(err.message);}
    finally {t.disabled=false;}
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='search') {const pos=e.target.selectionStart;search=e.target.value;renderPeople();$('#search').focus();$('#search').setSelectionRange?.(pos,pos);}
});
$('#entry-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!formContext) return;
  const {table,id,item}=formContext;
  let body=Object.fromEntries(new FormData(e.target));
  if(table==='people') body={name:body.name,email:body.email,phone:body.phone,parish_ids:state.parishes.filter(p=>body['parish_'+p.id]).map(p=>p.id),enrollments:state.editions.filter(ed=>body['join_'+ed.id]).map(ed=>({edition_id:ed.id,status:body['status_'+ed.id],group_name:body['group_'+ed.id]||'',role_ids:state.roles.filter(r=>body['role_'+ed.id+'_'+r.id]).map(r=>r.id)}))};
  if(['tasks','meetings'].includes(table)) body.edition_id=item.edition_id??editionId;
  if(table==='editions') body.parish_id=item.parish_id??parishId;
  if(table==='tasks') body.done=e.target.elements.done.checked;
  $('#save-button').disabled=true;
  try {
    const result=await api(`${table}${id?'/'+id:''}`,id?'PUT':'POST',body);
    if(table==='parishes'&&!id){parishId=result.id;editionId=undefined;}
    if(table==='editions'&&!id) editionId=result.id;
    $('#modal').close();await refresh();toast('Zapisano zmiany.');
  } catch(err) {$('#form-error').textContent=err.message;}
  finally {$('#save-button').disabled=false;}
});
initialize().catch(err=>{$('#view').innerHTML=empty('Nie udało się wczytać danych',esc(err.message));});

async function initialize(){
 currentUser=await api('me');
 document.querySelector('.profile>div').replaceChildren(document.createTextNode(currentUser.name));
 document.querySelector('#access-nav').hidden=!currentUser.admin;
 await refresh();
}
async function accessPanel(){
 const users=await api('users');
 $('#modal-title').textContent='Dostęp organizatorów';$('#save-button').hidden=true;$('#form-error').textContent='';formContext=null;
 $('#form-fields').innerHTML=`<p class="form-note">Każde aktywne konto ma dostęp do całej bazy parafii. Administrator może tworzyć konta i odbierać dostęp.</p>${users.map(u=>`<div class="edition-row"><div><strong>${esc(u.name)}</strong><small>${esc(u.login)} · ${u.admin?'Administrator':'Organizator'} · ${u.active?'Aktywne':'Zablokowane'}</small></div>${u.active&&u.id!==currentUser.id?`<button type="button" class="text-button" data-disable-user="${u.id}">Odbierz dostęp</button>`:''}</div>`).join('')}<h3>Dodaj organizatora</h3>${input('account_name','Imię organizatora','text',true)}${input('account_login','Login (np. e-mail)','text',true)}<label class="field"><span>Hasło początkowe (12–128 znaków)</span><input name="account_password" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label><label class="check-field"><input type="checkbox" name="account_admin"> Administrator</label><button type="button" class="button primary" id="create-account">Utwórz konto</button><p class="form-note">Przekaż hasło bezpiecznym kanałem. Organizator może zmienić je po zalogowaniu. Nie przesyłaj haseł w czacie ani w repozytorium.</p>`;
 $('#modal').showModal();
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
  if(b.id==='logout'){await api('logout','POST',{});location.replace('/login');}
  if(b.id==='access-nav')await accessPanel();
  if(b.dataset.disableUser){if(!confirm('Odebrać dostęp i wylogować tę osobę?'))return;await api('users/'+b.dataset.disableUser+'/disable','POST',{});$('#modal').close();await accessPanel();}
  if(b.id==='create-account'){
   const form=$('#entry-form');b.disabled=true;
   await api('users','POST',{name:form.elements.account_name.value,login:form.elements.account_login.value,password:form.elements.account_password.value,admin:form.elements.account_admin.checked});
   form.elements.account_password.value='';$('#modal').close();await accessPanel();toast('Utworzono konto organizatora.');
  }
  if(b.id==='change-password'){
   $('#modal-title').textContent='Zmień hasło';$('#save-button').hidden=true;$('#form-error').textContent='';formContext=null;
   $('#form-fields').innerHTML='<label class="field"><span>Obecne hasło</span><input name="old_password" type="password" autocomplete="current-password"></label><label class="field"><span>Nowe hasło (12–128 znaków)</span><input name="new_password" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label><button type="button" id="save-password" class="button primary">Zmień hasło i wyloguj</button>';
   $('#modal').showModal();
  }
  if(b.id==='save-password'){b.disabled=true;const f=$('#entry-form');await api('password','POST',{old_password:f.elements.old_password.value,new_password:f.elements.new_password.value});f.reset();location.replace('/login');}
 }catch(err){$('#form-error').textContent=err.message;b.disabled=false;}
});
