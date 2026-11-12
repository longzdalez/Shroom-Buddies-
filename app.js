// Shroom Buddies — all data is stored on this device only (localStorage). No accounts, no servers.
const store = {
  get(k, d) { try { const v = localStorage.getItem('sb_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sb_' + k, JSON.stringify(v)); } catch { alertMsg('Could not save — storage may be full.'); } }
};
const DEFAULT_PRACTICES = ['Morning meditation', 'Breathwork (5 min)', 'Walk in nature', 'Drink water', 'Gratitude note', 'Evening reflection']
  .map((name, i) => ({ id: 'p' + i, name }));

const S = {
  journal: store.get('journal', []),          // [{id, date, mood, energy, intention, text}]
  practices: store.get('practices', DEFAULT_PRACTICES),
  done: store.get('done', {}),                // {'YYYY-MM-DD': [practiceId,...]}
  settings: store.get('settings', { bg: '' }),
};
const save = k => store.set(k, S[k]);

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const z = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const today = () => dkey(new Date());
const nice = k => new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
function alertMsg(m) { const v = $('#view'); if (v) v.insertAdjacentHTML('afterbegin', `<div class="card">${esc(m)}</div>`); }

// Tiny safe markdown renderer for guides (escapes HTML first)
function md(src) {
  const lines = esc(src).split('\n'); let out = '', list = null;
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const l of lines) {
    let m;
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { close(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+\.\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (l.trim() === '') close();
    else { close(); out += `<p>${inline(l)}</p>`; }
  }
  close(); return out;
}

// ---------- views ----------
let current = 'today', calMonth = new Date(), calSel = today();

const views = {
  today() {
    const k = today(), done = S.done[k] || [];
    const n = S.practices.filter(p => done.includes(p.id)).length;
    const todays = S.journal.filter(e => e.date === k);
    return `
      <div class="card"><h2>${nice(k)}</h2>
        <div class="muted">${n} of ${S.practices.length} practices done · streak: ${streak()} day${streak() === 1 ? '' : 's'}</div></div>
      <div class="card"><h2>Daily practices</h2>
        ${S.practices.map(p => `<label class="practice ${done.includes(p.id) ? 'done' : ''}">
          <input type="checkbox" data-practice="${p.id}" ${done.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}
      </div>
      <div class="card"><h2>Journal</h2>
        ${todays.length ? todays.map(entryHTML).join('') : '<p class="muted">No entry yet today.</p>'}
        <button data-act="newEntry">+ Write today's entry</button></div>`;
  },
  journal() {
    const list = [...S.journal].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return `<button data-act="newEntry" style="width:100%;margin-bottom:12px">+ New entry</button>
      ${list.length ? list.map(e => `<div class="card">${entryHTML(e)}</div>`).join('') : '<div class="card muted">Your journal is empty. Start with how you feel today.</div>'}`;
  },
  calendar() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="dow">${d}</div>`).join('');
    cells += '<div></div>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${z(m + 1)}-${z(d)}`, hasJ = S.journal.some(e => e.date === k), p = (S.done[k] || []).length;
      cells += `<div class="day ${k === today() ? 'today' : ''} ${k === calSel ? 'sel' : ''}" data-day="${k}">${d}
        <div class="dots">${hasJ ? '📓' : ''}${p ? '🌱' : ''}</div></div>`;
    }
    const ents = S.journal.filter(e => e.date === calSel), done = S.done[calSel] || [];
    return `<div class="card">
        <div class="row" style="margin-bottom:10px"><button class="ghost small" data-act="prevM" style="flex:0">‹</button>
          <h2 style="text-align:center;margin:0">${calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button class="ghost small" data-act="nextM" style="flex:0">›</button></div>
        <div class="cal">${cells}</div></div>
      <div class="card"><h2>${nice(calSel)}</h2>
        <div class="muted">Practices: ${done.length ? S.practices.filter(p => done.includes(p.id)).map(p => esc(p.name)).join(', ') : 'none'}</div>
        ${ents.map(e => `<div style="margin-top:10px">${entryHTML(e)}</div>`).join('')}
        <button class="small" data-act="newEntry" data-date="${calSel}" style="margin-top:10px">+ Entry for this day</button></div>`;
  },
  guides() { loadGuides(); return '<div class="card muted">Loading guides…</div>'; },
  settings() {
    return `<div class="card"><h2>Daily practices</h2>
        ${S.practices.map(p => `<div class="practice"><span style="flex:1">${esc(p.name)}</span>
          <button class="ghost small" data-del-practice="${p.id}">Remove</button></div>`).join('')}
        <div class="row" style="margin-top:8px"><input id="newPractice" placeholder="Add a practice"><button data-act="addPractice" style="flex:0">Add</button></div></div>
      <div class="card"><h2>Background</h2><select id="bgSelect"><option value="">Default</option></select></div>
      <div class="card"><h2>Backup</h2><p class="muted">Your data only lives on this phone. Export a backup now and then.</p>
        <div class="row"><button data-act="export">Export</button><button class="ghost" data-act="import">Import</button></div>
        <input type="file" id="importFile" accept="application/json" hidden></div>`;
  },
};

function entryHTML(e) {
  return `<div class="entry"><h3>${MOODS[e.mood - 1] || ''} ${nice(e.date)}</h3>
    ${e.intention ? `<div class="muted">Intention: ${esc(e.intention)}</div>` : ''}
    ${e.energy ? `<div class="muted">Energy: ${e.energy}/5</div>` : ''}
    <p>${esc(e.text)}</p>
    <div class="row" style="margin-top:8px;justify-content:flex-end"><button class="ghost small" style="flex:0" data-edit="${e.id}">Edit</button>
    <button class="ghost small" style="flex:0" data-del-entry="${e.id}">Delete</button></div></div>`;
}

function entryForm(e) {
  const scale = (name, val, icons) => `<div class="scale" data-scale="${name}">${[1, 2, 3, 4, 5].map(i =>
    `<button type="button" class="${val === i ? 'sel' : ''}" data-v="${i}">${icons ? icons[i - 1] : i}</button>`).join('')}</div>`;
  $('#view').innerHTML = `<div class="card"><h2>${e.id ? 'Edit entry' : 'New entry'}</h2>
    <label>Date</label><input type="date" id="fDate" value="${e.date}">
    <label>Mood</label>${scale('mood', e.mood, MOODS)}
    <label>Energy</label>${scale('energy', e.energy)}
    <label>Intention</label><input id="fInt" value="${esc(e.intention)}" placeholder="What do you want to focus on?">
    <label>Notes</label><textarea id="fText" placeholder="How are you feeling? What did you notice?">${esc(e.text)}</textarea>
    <div class="row"><button class="ghost" data-act="cancel">Cancel</button><button data-act="saveEntry">Save</button></div></div>`;
  const form = { ...e };
  $('#view').querySelectorAll('[data-scale]').forEach(sc => sc.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    form[sc.dataset.scale] = +b.dataset.v; sc.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
  });
  $('[data-act="saveEntry"]').onclick = () => {
    Object.assign(form, { date: $('#fDate').value || today(), intention: $('#fInt').value.trim(), text: $('#fText').value.trim() });
    if (!form.text && !form.mood) return;
    if (form.id) S.journal = S.journal.map(x => x.id === form.id ? form : x); else S.journal.push({ ...form, id: uid() });
    save('journal'); render();
  };
}

function streak() {
  let n = 0; const d = new Date();
  if (!(S.done[dkey(d)] || []).length) d.setDate(d.getDate() - 1);
  while ((S.done[dkey(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

async function loadGuides() {
  try {
    const list = await (await fetch('guides/guides.json')).json();
    if (current !== 'guides') return;
    $('#view').innerHTML = list.length ? list.map((g, i) => `<div class="card" data-guide="${i}" style="cursor:pointer">
      ${g.image ? `<img src="${esc(g.image)}" alt="" style="width:100%;border-radius:10px;margin-bottom:8px">` : ''}<h2 style="margin:0">${esc(g.title)}</h2></div>`).join('')
      : '<div class="card muted">No guides yet.</div>';
    $('#view').querySelectorAll('[data-guide]').forEach(c => c.onclick = async () => {
      const g = list[+c.dataset.guide];
      const txt = await (await fetch('guides/' + g.file)).text();
      $('#view').innerHTML = `<button class="ghost small" data-nav="guides">‹ All guides</button>
        <div class="card guide">${g.image ? `<img src="${esc(g.image)}" alt="">` : ''}${md(txt)}</div>`;
    });
  } catch { $('#view').innerHTML = '<div class="card muted">Guides are unavailable offline until opened once online.</div>'; }
}

async function fillBackgrounds() {
  const sel = $('#bgSelect'); if (!sel) return;
  try {
    const list = await (await fetch('backgrounds/backgrounds.json')).json();
    list.forEach(b => sel.insertAdjacentHTML('beforeend', `<option value="backgrounds/${esc(b.file)}">${esc(b.name)}</option>`));
  } catch {}
  sel.value = S.settings.bg;
  sel.onchange = () => { S.settings.bg = sel.value; save('settings'); applyBg(); };
}
function applyBg() { document.documentElement.style.setProperty('--bg-image', S.settings.bg ? `url("${S.settings.bg}")` : 'none'); }

// ---------- render & events ----------
function render() {
  $('#view').innerHTML = views[current]();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === current));
  if (current === 'settings') fillBackgrounds();
  window.scrollTo(0, 0);
}
function go(v) { current = v; render(); }

document.querySelector('nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.view); };
$('#settingsBtn').onclick = () => go('settings');

$('#view').addEventListener('change', e => {
  const id = e.target.dataset.practice;
  if (id) { const k = today(), d = new Set(S.done[k] || []); e.target.checked ? d.add(id) : d.delete(id); S.done[k] = [...d]; save('done'); render(); }
  if (e.target.id === 'importFile' && e.target.files[0]) {
    e.target.files[0].text().then(t => {
      try { const d = JSON.parse(t); ['journal', 'practices', 'done', 'settings'].forEach(k => { if (d[k]) { S[k] = d[k]; save(k); } }); applyBg(); go('today'); }
      catch { alertMsg('That file is not a valid backup.'); }
    });
  }
});

$('#view').addEventListener('click', e => {
  const t = e.target.closest('button,[data-day]'); if (!t) return;
  const d = t.dataset;
  if (d.day) { calSel = d.day; render(); return; }
  if (d.nav) return go(d.nav);
  if (d.edit) return entryForm(S.journal.find(x => x.id === d.edit));
  if (d.delEntry) { if (confirm('Delete this entry?')) { S.journal = S.journal.filter(x => x.id !== d.delEntry); save('journal'); render(); } return; }
  if (d.delPractice) { S.practices = S.practices.filter(p => p.id !== d.delPractice); save('practices'); render(); return; }
  switch (d.act) {
    case 'newEntry': return entryForm({ date: d.date || today(), mood: 0, energy: 0, intention: '', text: '' });
    case 'cancel': return render();
    case 'prevM': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); return render();
    case 'nextM': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); return render();
    case 'addPractice': { const v = $('#newPractice').value.trim(); if (v) { S.practices.push({ id: uid(), name: v }); save('practices'); render(); } return; }
    case 'export': {
      const blob = new Blob([JSON.stringify({ journal: S.journal, practices: S.practices, done: S.done, settings: S.settings }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shroom-buddies-backup-${today()}.json`; a.click(); return;
    }
    case 'import': return $('#importFile').click();
  }
});

applyBg();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
