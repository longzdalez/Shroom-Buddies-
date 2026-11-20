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
  doses: store.get('doses', {}),              // {'YYYY-MM-DD': {micro:true} or {grams:1.5}}
  checkins: store.get('checkins', {}),        // {'YYYY-MM-DD': {am:{mood,energy}, pm:{mood,energy}}}
  supps: store.get('supps', []),              // [{id, name, time:'08:00' or ''}]
  suppLog: store.get('suppLog', {}),          // {'YYYY-MM-DD': [suppId,...]}
  foods: store.get('foods', ['Fruit', 'Vegetables', 'Whole grains', 'Protein', 'Sugar / sweets', 'Caffeine', 'Alcohol'].map((name, i) => ({ id: 'f' + i, name }))),
  foodLog: store.get('foodLog', {}),          // {'YYYY-MM-DD': [foodId,...]}
  myReels: store.get('myReels', []),          // [{id, url, title}] reels added on this phone
  guideEdits: store.get('guideEdits', {}),    // {'file.md': 'edited text'} guide wording changed on this phone
  reading: store.get('reading', []),          // [{id, name, freq}] books and literature to read
  readLog: store.get('readLog', {}),          // {'YYYY-MM-DD': [readingId,...]}
  prefs: store.get('prefs', { editMode: false }),
};
const REPO = 'longzdalez/Shroom-Buddies-';   // used for "Publish for everyone" (GitHub's own editor)
const ADMIN_SALT = 'shroombuddies-admin:';    // admin passphrase is checked against "adminHash" in site.json
let SITE = {}, sharedReels = null;            // site.json; reels.json as last loaded (null = not loaded)
const isAdmin = () => !!S.prefs.admin;
async function getSite() { try { SITE = await (await fetch('site.json', { cache: 'no-cache' })).json(); } catch {} return SITE; }
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ADMIN_SALT + text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
let installEvt = null;                        // Android "Install app" prompt, when the browser offers it
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (current === 'settings') render(); });
const LISTS = {
  supps: { items: 'supps', log: 'suppLog', icon: '💊', label: 'Supplements', noun: 'supplement', ph: 'e.g. Vitamin D', reminders: true },
  food: { items: 'foods', log: 'foodLog', icon: '🥗', label: 'Food', noun: 'food type', ph: 'e.g. Leafy greens', reminders: false },
  reading: { items: 'reading', log: 'readLog', icon: '📚', label: 'Reading & Literature', noun: 'book or piece of literature', ph: 'e.g. The Doors of Perception', reminders: false },
};
const KEYS = ['journal', 'practices', 'done', 'doses', 'checkins', 'supps', 'suppLog', 'foods', 'foodLog', 'myReels', 'guideEdits', 'reading', 'readLog', 'prefs'];
const save = k => store.set(k, S[k]);

// ---------- pages (swipe left and right) ----------
const PAGES = ['today', 'practices', 'tracker', 'supplements', 'reading', 'journal', 'calendar', 'guides', 'reels', 'settings'];
const LIVE = ['today', 'practices', 'tracker', 'supplements', 'reading', 'journal', 'calendar', 'settings'];  // redrawn on every change
function pageEl(n) { return document.getElementById('p-' + n) || $('#view'); }
let listDay = null;                           // day shown on the Supplements and Reading pages (set at start-up)
let editing = null;                           // {kind, id} while the add/edit form is open on a list page

// ---------- how often an item is due ----------
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekIdx = k => (new Date(k + 'T12:00').getDay() + 6) % 7;   // 0 = Monday
function isDue(item, k) {
  const f = item.freq || { type: 'daily' };
  if (f.type === 'days') return (f.days || []).includes(weekIdx(k));
  if (f.type === 'every') {
    const n = Math.max(1, +f.every || 1), start = f.start || k;
    const d = Math.round((new Date(k + 'T12:00') - new Date(start + 'T12:00')) / 864e5);
    return d >= 0 && d % n === 0;
  }
  return true;
}
function freqText(item) {
  const f = item.freq || { type: 'daily' };
  if (f.type === 'days') return (f.days || []).length ? (f.days || []).map(i => WEEK[i]).join(', ') : 'Choose days';
  if (f.type === 'every') { const n = Math.max(1, +f.every || 1); return `Every ${n} day${n === 1 ? '' : 's'}`; }
  return 'Every day';
}

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const z = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
const today = () => dkey(new Date());
const nice = k => new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
function alertMsg(m) { const v = pageEl(current); if (v) v.insertAdjacentHTML('afterbegin', `<div class="card">${esc(m)}</div>`); }

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
let current = 'today', calMonth = new Date(), calSel = today(), trMonth = new Date(), trSel = today(), trTab = 'shroom';

const views = {
  today() {
    const k = today(), done = S.done[k] || [];
    const n = S.practices.filter(p => done.includes(p.id)).length;
    const todays = S.journal.filter(e => e.date === k);
    const pct = S.practices.length ? Math.round(n / S.practices.length * 100) : 0, st = streak();
    const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return `${quoteHTML()}
      <div class="greet">✦ ${greet}, buddy ✦</div>
      ${remindersHTML()}
      <div class="card hero">
        <div class="ring" style="--p:${pct}"><div><b>${pct}%</b><small>TODAY</small></div></div>
        <div><div class="date">${nice(k)}</div>
          <div class="muted">${n} of ${S.practices.length} practices done</div>
          <div class="chips"><span class="chip">🔥 ${st} day streak</span><span class="chip">📓 ${S.journal.length} entries</span></div></div></div>
      ${checkinHTML(k)}
      `;
  },
  practices() {
    const k = today(), done = S.done[k] || [];
    return `      <div class="card"><h2>Daily practices</h2>
        ${S.practices.map(p => `<label class="practice ${done.includes(p.id) ? 'done' : ''}">
          <input type="checkbox" data-practice="${p.id}" ${done.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}
      </div>
`;
  },
  supplements() { return listPage('supps'); },
  reading() { return listPage('reading'); },
  journal() { return journalPage(); },
  calendar() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="dow">${d}</div>`).join('');
    cells += '<div></div>'.repeat(first);
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${z(m + 1)}-${z(d)}`, hasJ = S.journal.some(e => e.date === k), p = (S.done[k] || []).length, ds = S.doses[k], sp = (S.suppLog[k] || []).length, fd = (S.foodLog[k] || []).length;
      cells += `<div class="day ${k === today() ? 'today' : ''} ${k === calSel ? 'sel' : ''}" data-day="${k}">${d}
        <div class="dots">${hasJ ? '📓' : ''}${p ? '🌱' : ''}${ds ? '🍄' : ''}${sp ? '💊' : ''}${fd ? '🥗' : ''}</div></div>`;
    }
    const ents = S.journal.filter(e => e.date === calSel), done = S.done[calSel] || [];
    return `<div class="card">
        <div class="row" style="margin-bottom:10px"><button class="ghost small" data-act="prevM" style="flex:0">‹</button>
          <h2 style="text-align:center;margin:0">${calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button class="ghost small" data-act="nextM" style="flex:0">›</button></div>
        <div class="cal">${cells}</div></div>
      <div class="card"><h2>${nice(calSel)}</h2>
        <div class="muted">Mushrooms: ${doseText(S.doses[calSel]) || 'none'}</div>
        <div class="muted">Morning: ${ciText((S.checkins[calSel] || {}).am)} · Afternoon: ${ciText((S.checkins[calSel] || {}).pm)}</div>
        <div class="muted">Supplements: ${names('supps', calSel) || 'none'}</div>
        <div class="muted">Food: ${names('food', calSel) || 'none'}</div>
        <div class="muted">Reading: ${names('reading', calSel) || 'none'}</div>
        <div class="muted">Practices: ${done.length ? S.practices.filter(p => done.includes(p.id)).map(p => esc(p.name)).join(', ') : 'none'}</div>
        ${ents.map(e => `<div style="margin-top:10px">${entryHTML(e)}</div>`).join('')}
        <button class="small" data-act="newEntry" data-date="${calSel}" style="margin-top:10px">+ Entry for this day</button></div>
      ${graphHTML(y, m)}`;
  },
  tracker() {
    const tabs = `<div class="subtabs">${[['shroom', '🍄 Shrooms'], ['food', '🥗 Food']].map(([t, l]) =>
      `<button class="${trTab === t ? 'on' : ''}" data-trtab="${t}">${l}</button>`).join('')}</div>`;
    return tabs + (trTab === 'shroom' ? shroomTracker() : listTracker('food'));
  },
  guides() { return '<div class="card muted">Loading guides…</div>'; },
  reels() { return '<div class="card muted">Loading reels…</div>'; },
  settings() { return settingsHTML(); },
};

function shroomTracker() {
    const y = trMonth.getFullYear(), m = trMonth.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(first);
    let count = 0, grams = 0;
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${z(m + 1)}-${z(d)}`, ds = S.doses[k];
      if (ds) { count++; grams += ds.grams || 0; }
      cells += `<div class="day ${k === today() ? 'today' : ''} ${k === trSel ? 'sel' : ''} ${ds ? 'dosed' : ''}" data-trday="${k}">${d}
        <div class="dots">${ds ? (ds.micro ? '🍄' : `<small>${ds.grams}g</small>`) : ''}</div></div>`;
    }
    const last = Object.keys(S.doses).filter(k => k <= today()).sort().pop();
    const since = last ? Math.round((new Date(today() + 'T12:00') - new Date(last + 'T12:00')) / 864e5) : null;
    const cur = S.doses[trSel];
    return `<div class="card hero"><div class="ring" style="--p:${Math.min(100, count / days * 100)}"><div><b>${count}</b><small>DAYS</small></div></div>
        <div><div class="date">${trMonth.toLocaleDateString(undefined, { month: 'long' })}</div>
          <div class="muted">${count} mushroom day${count === 1 ? '' : 's'} this month</div>
          <div class="chips">${grams ? `<span class="chip">⚖️ ${+grams.toFixed(2)}g logged</span>` : ''}<span class="chip">⏳ ${since === null ? 'none yet' : since === 0 ? 'today' : since + ' day' + (since === 1 ? '' : 's') + ' ago'}</span></div></div></div>
      <div class="card">
        <div class="row" style="margin-bottom:10px"><button class="ghost small" data-act="trPrev" style="flex:0">‹</button>
          <h2 style="text-align:center;margin:0">${trMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button class="ghost small" data-act="trNext" style="flex:0">›</button></div>
        <div class="cal">${cells}</div></div>
      <div class="card"><h2>${nice(trSel)}</h2>
        <p class="muted" style="margin-top:0">${cur ? 'Logged: ' + doseText(cur) : 'Nothing logged for this day.'}</p>
        <button data-act="logMicro" style="width:100%">🍄 Microdose</button>
        <div class="row" style="margin-top:10px"><input id="grams" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Or type grams" value="${cur && cur.grams ? cur.grams : ''}" style="margin:0">
          <button data-act="logGrams" style="flex:0">Save</button></div>
        ${cur ? '<button class="ghost small" data-act="clearDose" style="margin-top:10px">Clear this day</button>' : ''}</div>`;
}

// ---------- supplements & reading pages (tick what's due, set how often) ----------
function listPage(kind) {
  const L = LISTS[kind], items = S[L.items], sel = (S[L.log][listDay] || []), k = listDay, isToday = k === today();
  const doneCount = items.filter(i => sel.includes(i.id)).length, dueCount = items.filter(i => isDue(i, k)).length;
  const nav = `<div class="row" style="margin-bottom:10px"><button class="ghost small" data-act="lday" data-step="-1" style="flex:0">‹</button>
      <h2 style="text-align:center;margin:0;flex:1">${isToday ? 'Today' : nice(k)}</h2>
      <button class="ghost small" data-act="lday" data-step="1" style="flex:0">›</button></div>`;
  const rows = items.length ? items.map(i => `<div class="practice ${sel.includes(i.id) ? 'done' : ''}">
      <label style="display:flex;align-items:center;gap:12px;flex:1;cursor:pointer;min-width:0">
        <input type="checkbox" data-lt="${kind}" data-item="${i.id}" ${sel.includes(i.id) ? 'checked' : ''}>
        <span style="flex:1">${esc(i.name)}<br><small class="muted">${freqText(i)}${isDue(i, k) ? '' : ' · not due'}${i.time ? ' · ⏰ ' + i.time : ''}</small></span></label>
      <button class="ghost small" style="flex:0" data-act="ledit" data-kind="${kind}" data-id="${i.id}" aria-label="Edit">✎</button></div>`).join('')
    : `<p class="muted">Nothing on this list yet. Tap + below to add ${L.noun}s.</p>`;
  return `<div class="card hero"><div class="ring" style="--p:${items.length ? doneCount / items.length * 100 : 0}"><div><b>${doneCount}/${items.length}</b><small>${isToday ? 'TODAY' : 'DAY'}</small></div></div>
      <div><div class="date">${L.label}</div><div class="muted">${dueCount} due ${isToday ? 'today' : 'this day'}</div></div></div>
    <div class="card">${nav}${rows}</div>
    ${editorHTML(kind)}`;
}
function editorHTML(kind) {
  const L = LISTS[kind];
  if (!editing || editing.kind !== kind)
    return `<button style="width:100%" data-act="lnew" data-kind="${kind}">+ Add to ${L.label}</button>`;
  const it = editing.id ? S[L.items].find(i => i.id === editing.id) : null;
  const f = (it && it.freq) || { type: 'daily' }, days = f.days || [];
  return `<div class="card"><h2>${it ? 'Edit' : 'New'} ${L.noun}</h2>
    <label>Name</label><input id="iName" value="${esc(it ? it.name : '')}" placeholder="${L.ph}" style="margin-top:0">
    <label>How often</label>
    <select id="iType" style="margin-top:0">
      <option value="daily" ${f.type !== 'days' && f.type !== 'every' ? 'selected' : ''}>Every day</option>
      <option value="days" ${f.type === 'days' ? 'selected' : ''}>On certain days of the week</option>
      <option value="every" ${f.type === 'every' ? 'selected' : ''}>Every few days</option></select>
    <p class="muted" style="font-size:.8rem;margin:10px 0 4px">If you chose certain days, tick them:</p>
    <div class="weekdays">${WEEK.map((w, i) => `<label class="wd"><input type="checkbox" class="wdc" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${w}</span></label>`).join('')}</div>
    <label>If you chose every few days, how many days apart?</label>
    <input id="iEvery" type="number" inputmode="numeric" min="1" max="365" value="${f.every || 2}" style="margin-top:0">
    ${kind === 'supps' ? `<label>Reminder time (optional)</label><input id="iTime" type="time" value="${it && it.time ? it.time : ''}" style="margin-top:0">` : ''}
    <div class="row" style="margin-top:12px"><button class="ghost" data-act="lcancel">Cancel</button>
      ${it ? `<button class="ghost" data-act="ldel" data-kind="${kind}" data-id="${it.id}">Remove</button>` : ''}
      <button data-act="lsave" data-kind="${kind}">Save</button></div></div>`;
}

// ---------- journal page: latest entry open, earlier entries below ----------
function journalPage() {
  const list = [...S.journal].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const latest = list[0], older = list.slice(1);
  return `<button data-act="newEntry" style="width:100%;margin-bottom:12px">+ New entry</button>
    ${latest ? `<div class="card"><div class="muted" style="font-size:.72rem;letter-spacing:.12em;text-transform:uppercase">Latest entry</div>${entryHTML(latest)}</div>`
      : '<div class="card muted">Your journal is empty. Start with how you feel today.</div>'}
    ${older.length ? `<div class="card"><h2>Earlier entries</h2>${older.map(e => `<details class="older"><summary>${MOODS[e.mood - 1] || ''} ${nice(e.date)}${e.intention ? ' · ' + esc(e.intention) : ''}</summary>${entryHTML(e)}</details>`).join('')}</div>` : ''}`;
}

// ---------- supplements & food trackers ----------
const names = (t, k) => S[LISTS[t].items].filter(i => (S[LISTS[t].log][k] || []).includes(i.id)).map(i => esc(i.name)).join(', ');
function listTracker(t) {
  const L = LISTS[t], items = S[L.items], log = S[L.log];
  const y = trMonth.getFullYear(), m = trMonth.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(first), logged = 0;
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${z(m + 1)}-${z(d)}`, n = (log[k] || []).filter(id => items.some(i => i.id === id)).length;
    if (n) logged++;
    cells += `<div class="day ${k === today() ? 'today' : ''} ${k === trSel ? 'sel' : ''} ${n ? 'dosed' : ''}" data-trday="${k}">${d}
      <div class="dots">${n ? `${L.icon}<small>${n}</small>` : ''}</div></div>`;
  }
  const sel = log[trSel] || [], doneToday = items.filter(i => (log[today()] || []).includes(i.id)).length;
  return `<div class="card hero"><div class="ring" style="--p:${items.length ? doneToday / items.length * 100 : 0}"><div><b>${doneToday}/${items.length}</b><small>TODAY</small></div></div>
      <div><div class="date">${L.label}</div>
        <div class="muted">${logged} day${logged === 1 ? '' : 's'} logged in ${trMonth.toLocaleDateString(undefined, { month: 'long' })}</div></div></div>
    <div class="card">
      <div class="row" style="margin-bottom:10px"><button class="ghost small" data-act="trPrev" style="flex:0">‹</button>
        <h2 style="text-align:center;margin:0">${trMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button class="ghost small" data-act="trNext" style="flex:0">›</button></div>
      <div class="cal">${cells}</div></div>
    <div class="card"><h2>${nice(trSel)}</h2>
      ${items.length ? items.map(i => `<label class="practice ${sel.includes(i.id) ? 'done' : ''}">
        <input type="checkbox" data-lt="${t}" data-item="${i.id}" ${sel.includes(i.id) ? 'checked' : ''}><span>${esc(i.name)}</span>
        ${i.time ? `<small class="muted" style="margin-left:auto">⏰ ${i.time}</small>` : ''}</label>`).join('')
      : `<p class="muted">Add your ${L.noun}s below, then tick them off each day.</p>`}</div>
    <div class="card"><h2>Your ${L.label.toLowerCase()}</h2>
      ${items.map(i => `<div class="item-row"><span>${esc(i.name)}</span>
        ${L.reminders ? `<input type="time" value="${i.time || ''}" data-time="${i.id}" aria-label="Reminder time">
          ${i.time ? `<button class="ghost small" data-ics="${i.id}" title="Add a daily reminder to your phone calendar">📅</button>` : ''}` : ''}
        <button class="ghost small" data-del-item="${i.id}" data-lt="${t}">✕</button></div>`).join('')}
      <div class="row" style="margin-top:10px"><input id="newItem" placeholder="${L.ph}" style="margin:0">
        <button data-act="addItem" data-lt="${t}" style="flex:0">Add</button></div>
      ${L.reminders ? `<p class="muted" style="font-size:.8rem;margin-bottom:0">Optional: set a time for a reminder. You'll see it on the Today page when it's due, and 📅 adds a daily alarm to your phone's calendar so it reminds you even when the app is closed.</p>` : ''}</div>`;
}

// reminders due now (supplements with a time that aren't ticked yet today)
function remindersHTML() {
  const now = `${z(new Date().getHours())}:${z(new Date().getMinutes())}`, taken = S.suppLog[today()] || [];
  const due = S.supps.filter(i => i.time && i.time <= now && !taken.includes(i.id) && isDue(i, today()));
  return due.length ? `<div class="card reminder"><h2>⏰ Supplement reminder</h2>${due.map(i =>
    `<div class="item-row"><span>💊 ${esc(i.name)} <small class="muted">(${i.time})</small></span><button class="small" data-quick="${i.id}">Taken ✓</button></div>`).join('')}</div>` : '';
}

// a repeating daily calendar event with an alarm, which phones can import (works with the app closed)
function downloadICS(item) {
  const [hh, mm] = item.time.split(':'), d = today().replace(/-/g, ''), stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shroom Buddies//EN', 'BEGIN:VEVENT', `UID:${item.id}-${Date.now()}@shroombuddies`, `DTSTAMP:${stamp}`,
    `DTSTART:${d}T${hh}${mm}00`, 'DURATION:PT5M', 'RRULE:FREQ=DAILY', `SUMMARY:💊 Take ${item.name}`, 'DESCRIPTION:Reminder from Shroom Buddies',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:Take ${item.name}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `reminder-${item.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`; a.click();
}

function installCard() {
  const installed = matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
  return `<div class="card"><h2>📲 Install the app</h2>${installed ? '<p class="muted" style="margin:0">✅ Installed on this phone. Open it from your home screen.</p>'
    : installEvt ? '<button style="width:100%" data-act="install">📲 Install Shroom Buddies</button>'
    : `<ol class="muted" style="margin:0;padding-left:20px;font-size:.9rem">
        <li><b>Android (Chrome):</b> tap ⋮ at the top right, then <b>Install app</b> or <b>Add to Home screen</b>.</li>
        <li><b>iPhone (Safari):</b> tap the Share button ⬆️, then <b>Add to Home Screen</b>.</li></ol>`}</div>`;
}
function signInCard() {
  return `<div class="card"><h2>🔐 Admin</h2><p class="muted" style="margin-top:0">Only the owner of the app can change the guides and reels.</p>
    <div class="row"><input id="adminPw" type="password" autocomplete="off" placeholder="Admin passphrase" style="margin-top:0"><button data-act="adminIn" style="flex:0">Sign in</button></div></div>`;
}
function adminCard() {
  return `<div class="card"><h2>🔐 Admin</h2><p class="muted" style="margin-top:0">You're signed in as admin on this phone.</p>
    <div class="card" style="margin:0 0 12px;padding:12px"><h2 style="margin-bottom:6px">Guide editing</h2>
    <label class="practice" style="border:0;padding:0"><input type="checkbox" data-editmode ${S.prefs.editMode ? 'checked' : ''}><span style="color:var(--text)">Let me change the wording in the guides</span></label>
    <p class="muted" style="font-size:.8rem;margin-bottom:0">When this is on, open any guide and tap the text to edit it. Changes save on this phone, and <b>Publish for everyone</b> updates the app for all users.</p></div>
    <button class="ghost small" data-act="adminOut">Sign out of admin</button></div>`;
}

function settingsHTML() {
    return `<div class="card howto"><h2>How to use Shroom Buddies</h2>
        <ol>
          <li><b>Swipe</b> left and right to move between pages, or tap the buttons at the bottom.</li>
          <li><b>🌱 Today</b> – tap your mood and energy in the morning and again in the afternoon.</li>
          <li><b>✅ Practices</b> – tick off each daily practice as you do it.</li>
          <li><b>🍄 Tracker</b> – tap a day, then press <b>Microdose</b> or type grams and press <b>Save</b>. Food is here too.</li>
          <li><b>💊 Supplements</b> and <b>📚 Reading</b> – tick off what's due. Tap ✎ to change the name, how often, or the reminder time.</li>
          <li><b>📓 Journal</b> – your latest entry is shown open. Tap <b>+ New entry</b> to write another, or 🎤 to speak.</li>
          <li><b>📅 Calendar</b> – tap any day to see everything you logged.</li>
          <li><b>📖 Guides</b> – pick a folder, then tap a guide to read it.</li>
          <li><b>🎬 Reels</b> – your own reels show first. Tap 📤 to share one with a friend. Shared reels are underneath.</li>
          <li><b>⚙️ Settings</b> – practices, the install card, backup and admin.</li>
        </ol>
        <p class="muted">Everything is kept only on this phone.</p></div>
      ${installCard()}
      ${isAdmin() ? adminCard() : signInCard()}
      <div class="card"><h2>Supplements & reading</h2><p class="muted" style="margin-top:0">Add, change or remove items and how often you take or read them.</p>
        <div class="row"><button class="ghost" data-nav="supplements">💊 Supplements</button><button class="ghost" data-nav="reading">📚 Reading</button></div></div>
      <div class="card"><h2>Daily practices</h2>
        ${S.practices.map(p => `<div class="practice"><span style="flex:1">${esc(p.name)}</span>
          <button class="ghost small" data-del-practice="${p.id}">Remove</button></div>`).join('')}
        <div class="row" style="margin-top:8px"><input id="newPractice" placeholder="Add a practice"><button data-act="addPractice" style="flex:0">Add</button></div></div>
      <div class="card"><h2>Backup</h2><p class="muted">Your data only lives on this phone. Export a backup now and then.</p>
        <div class="row"><button data-act="export">Export</button><button class="ghost" data-act="import">Import</button></div>
        <input type="file" id="importFile" accept="application/json" hidden></div>`;
}

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
  const pe = pageEl(current);
  pe.innerHTML = `<div class="card"><h2>${e.id ? 'Edit entry' : 'New entry'}</h2>
    <label>Date</label><input type="date" id="fDate" value="${e.date}">
    <label>Mood</label>${scale('mood', e.mood, MOODS)}
    <label>Energy</label>${scale('energy', e.energy)}
    <div class="lbl-row"><label for="fInt">Intention</label>${micBtn('fInt')}</div><input id="fInt" value="${esc(e.intention)}" placeholder="What do you want to focus on?">
    <div class="lbl-row"><label for="fText">Notes</label>${micBtn('fText')}</div><textarea id="fText" placeholder="How are you feeling? What did you notice? Tap 🎤 to speak.">${esc(e.text)}</textarea>
    <div class="row"><button class="ghost" data-act="cancel">Cancel</button><button data-act="saveEntry">Save</button></div></div>`;
  const form = { ...e };
  pe.querySelectorAll('[data-mic]').forEach(b => b.onclick = () => dictate(b));
  pe.querySelectorAll('[data-scale]').forEach(sc => sc.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    form[sc.dataset.scale] = +b.dataset.v; sc.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
  });
  $('[data-act="saveEntry"]').onclick = () => {
    stopDictation();
    Object.assign(form, { date: $('#fDate').value || today(), intention: $('#fInt').value.trim(), text: $('#fText').value.trim() });
    if (!form.text && !form.mood) return;
    if (form.id) S.journal = S.journal.map(x => x.id === form.id ? form : x); else S.journal.push({ ...form, id: uid() });
    save('journal'); render();
  };
}

// ---------- voice typing (speak instead of type) ----------
const micBtn = id => `<button type="button" class="mic" data-mic="${id}" aria-label="Speak instead of typing">🎤 Speak</button>`;
let rec = null, recBtn = null;
function stopDictation() { if (rec) { rec.stop(); rec = null; } }
function dictate(btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Voice typing isn't available in this browser. Tap the microphone on your phone's keyboard instead."); return; }
  if (rec) { const same = recBtn === btn; stopDictation(); if (same) return; }
  const field = document.getElementById(btn.dataset.mic);
  const base = field.value ? field.value.replace(/\s*$/, ' ') : '';
  let finals = '';
  rec = new SR(); recBtn = btn;
  rec.lang = navigator.language || 'en-GB'; rec.continuous = true; rec.interimResults = true;
  rec.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finals += (finals && !/\s$/.test(finals) ? ' ' : '') + t.trim();
      else interim += t;
    }
    let spoken = (finals + (interim ? ' ' + interim : '')).trim();
    if (!base.trim() || /[.!?]\s*$/.test(base)) spoken = spoken.charAt(0).toUpperCase() + spoken.slice(1);
    field.value = base + spoken;
  };
  rec.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') alert('Please allow microphone access for this app in your phone settings, then try again.'); };
  rec.onend = () => { btn.classList.remove('on'); btn.textContent = '🎤 Speak'; if (recBtn === btn) { rec = null; recBtn = null; } };
  btn.classList.add('on'); btn.textContent = '⏹ Stop'; field.focus();
  try { rec.start(); } catch { btn.classList.remove('on'); btn.textContent = '🎤 Speak'; rec = null; }
}

function streak() {
  let n = 0; const d = new Date();
  if (!(S.done[dkey(d)] || []).length) d.setDate(d.getDate() - 1);
  while ((S.done[dkey(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

let gFolder = null;
async function loadGuides() {
  try {
    let list = await (await fetch('guides/guides.json', { cache: 'no-cache' })).json();
    if (current !== 'guides') return;
    const folders = list.length && list[0].folder ? list : [{ folder: 'Guides', guides: list }];
    const v = pageEl('guides');
    if (gFolder === null) {          // folder list
      v.innerHTML = folders.map((f, i) => `<div class="card guide-link folder" data-folder="${i}">
        ${f.cover ? `<img src="${esc(f.cover)}" alt="" onerror="this.remove()">` : ''}
        <h2 style="margin:0"><span class="num">${esc(f.icon || '📁')}</span>${esc(f.folder)}</h2>
        <div class="muted" style="margin-top:4px">${f.guides.length} guide${f.guides.length === 1 ? '' : 's'}</div></div>`).join('');
      v.querySelectorAll('[data-folder]').forEach(c => c.onclick = () => { gFolder = +c.dataset.folder; loadGuides(); window.scrollTo(0, 0); });
      return;
    }
    const f = folders[gFolder];
    const showList = () => {
      v.innerHTML = `<button class="ghost small" data-gfolders>‹ All guides</button>
        <h2 class="folder-title">${esc(f.icon || '📁')} ${esc(f.folder)}</h2>` +
        f.guides.map((g, i) => `<div class="card guide-link" data-guide="${i}">
        ${g.image ? `<img src="${esc(g.image)}" alt="" onerror="this.remove()">` : ''}<h2 style="margin:0"><span class="num">${i + 1}</span>${esc(g.title)}</h2></div>`).join('');
      v.querySelector('[data-gfolders]').onclick = () => { gFolder = null; loadGuides(); };
      v.querySelectorAll('[data-guide]').forEach(c => c.onclick = async () => {
        const g = f.guides[+c.dataset.guide];
        const original = await (await fetch('guides/' + g.file, { cache: 'no-cache' })).text();
        showGuide(v, f, g, original, showList);
      });
    };
    showList();
  } catch { pageEl('guides').innerHTML = '<div class="card muted">Guides are unavailable offline until opened once online.</div>'; }
}

// one guide page; in editing mode, tap the text to change the wording
function showGuide(v, f, g, original, back) {
  if (S.guideEdits[g.file] != null && S.guideEdits[g.file].trim() === original.trim()) { delete S.guideEdits[g.file]; save('guideEdits'); }  // already published
  const edited = S.guideEdits[g.file], txt = edited ?? original, editing = isAdmin() && S.prefs.editMode;
  v.innerHTML = `<button class="ghost small" data-gback>‹ ${esc(f.folder)}</button>
    ${g.image ? `<img class="guide-page" src="${esc(g.image)}" alt="" onerror="this.remove()">` : ''}
    ${edited != null ? '<p class="muted edited-note">✏️ You changed this wording on this phone</p>' : ''}
    <div class="card guide ${editing ? 'editable' : ''}" ${editing ? 'data-gedit title="Tap to edit"' : ''}>${md(txt)}
      ${editing ? '<div class="edit-hint">✏️ Tap the text to edit</div>' : ''}</div>`;
  v.querySelector('[data-gback]').onclick = () => { back(); window.scrollTo(0, 0); };
  const card = v.querySelector('[data-gedit]');
  if (card) card.onclick = () => {
    card.outerHTML = `<div class="card guide-editor"><h2>Edit wording</h2>
      <textarea id="gText" rows="18">${esc(txt)}</textarea>
      <p class="muted" style="font-size:.8rem;margin-top:0">Tips: a line starting with <b>#</b> is a title, <b>##</b> a heading, and <b>-</b> a bullet point. Leave an empty line between paragraphs.</p>
      <div class="row"><button class="ghost" data-gcancel>Cancel</button><button data-gsave>Save</button></div>
      <button class="ghost" data-gpublish style="width:100%;margin-top:10px">🌍 Publish for everyone</button>
      ${edited != null ? '<button class="ghost small" data-greset style="margin-top:10px">↺ Go back to the original wording</button>' : ''}</div>`;
    const ta = v.querySelector('#gText'); ta.focus();
    v.querySelector('[data-gcancel]').onclick = () => showGuide(v, f, g, original, back);
    v.querySelector('[data-gsave]').onclick = () => {
      const t = ta.value.replace(/\s+$/, '') + '\n';
      if (t.trim() === original.trim()) delete S.guideEdits[g.file]; else S.guideEdits[g.file] = t;
      save('guideEdits'); showGuide(v, f, g, original, back); window.scrollTo(0, 0);
    };
    v.querySelector('[data-gpublish]').onclick = async () => {
      const t = ta.value.replace(/\s+$/, '') + '\n';
      S.guideEdits[g.file] = t; save('guideEdits');
      let copied = true; try { await navigator.clipboard.writeText(t); } catch { copied = false; }
      v.querySelector('[data-gpublish]').outerHTML = `<div class="publish-steps"><p><b>${copied ? '✅ Your new wording is copied.' : 'Copy your new wording from the box above first.'}</b></p>
        <ol><li>Tap the button below to open GitHub (sign in if asked).</li><li>Tap in the text box there, select all, and paste.</li><li>Press <b>Commit changes</b>.</li></ol>
        <p class="muted" style="font-size:.8rem">Everyone will see the new wording a minute or two later.</p>
        <a class="btn" style="width:100%" href="https://github.com/${REPO}/edit/main/guides/${g.file}" target="_blank" rel="noopener">Open GitHub to paste</a></div>`;
    };
    const r = v.querySelector('[data-greset]');
    if (r) r.onclick = () => { if (confirm('Go back to the original wording?')) { delete S.guideEdits[g.file]; save('guideEdits'); showGuide(v, f, g, original, back); } };
  };
  window.scrollTo(0, 0);
}

// ---------- reels: links to Instagram / Facebook / TikTok / YouTube videos with a preview ----------
function reelInfo(url) {
  let u; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.replace(/^(www\.|m\.)/, ''), path = u.pathname;
  let m;
  if (h === 'instagram.com' && (m = path.match(/^\/(?:[^/]+\/)?(reel|reels|p|tv)\/([\w-]+)/)))
    return { site: 'Instagram', icon: '📸', embed: `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/embed`, tall: true };
  if (h === 'facebook.com' || h === 'fb.watch')
    return { site: 'Facebook', icon: '📘', embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`, tall: /\/reel/.test(path) };
  if (h === 'tiktok.com' && (m = path.match(/\/video\/(\d+)/)))
    return { site: 'TikTok', icon: '🎵', embed: `https://www.tiktok.com/embed/v2/${m[1]}`, tall: true };
  if (h === 'youtu.be' || h === 'youtube.com') {
    const id = h === 'youtu.be' ? path.slice(1) : (u.searchParams.get('v') || (path.match(/\/(?:shorts|embed)\/([\w-]+)/) || [])[1]);
    if (id) return { site: 'YouTube', icon: '▶️', thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, tall: false };
  }
  return { site: h, icon: '🔗' };
}
function reelCard(r, mine) {
  const info = reelInfo(r.url); if (!info) return '';
  const url = esc(r.url);
  const preview = info.embed ? `<div class="reel-frame ${info.tall ? 'tall' : ''}"><iframe src="${esc(info.embed)}" loading="lazy" allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" referrerpolicy="strict-origin-when-cross-origin" title="${esc(r.title || info.site)}"></iframe></div>`
    : info.thumb ? `<a href="${url}" target="_blank" rel="noopener" class="reel-thumb"><img src="${esc(info.thumb)}" alt="" loading="lazy"><span>▶</span></a>` : '';
  return `<div class="card reel">${r.title ? `<h2>${esc(r.title)}</h2>` : ''}${preview}
    <div class="row" style="margin-top:10px"><a class="btn" href="${url}" target="_blank" rel="noopener">${info.icon} Watch on ${esc(info.site)}</a>
    ${mine ? `<button class="ghost small" data-share="${url}" style="flex:0" aria-label="Share">📤</button><button class="ghost small" data-del-reel="${r.id}" style="flex:0" aria-label="Remove">✕</button>` : ''}</div></div>`;
}
async function loadReels() {
  let shared = null;
  const site = await getSite();
  try { shared = await (await fetch('reels.json', { cache: 'no-cache' })).json(); } catch {}
  sharedReels = shared;
  if (current !== 'reels') return;
  const list = shared || [];
  const web = /^https:\/\//.test(site.website || '') ? `<a class="btn web-btn" href="${esc(site.website)}" target="_blank" rel="noopener">🌐 Visit our website</a>` : '';
  const addForm = `<div class="card"><h2>🎬 Add a reel to your phone</h2>
      <p class="muted" style="margin-top:0">Paste a link from Instagram, Facebook, TikTok or YouTube. It shows only on this phone.</p>
      <input id="reelUrl" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/…" style="margin-top:0">
      <input id="reelTitle" placeholder="Title (optional)" style="margin-top:0">
      <button data-act="addReel" style="width:100%">Add reel</button></div>`;
  const adminBox = isAdmin() ? `<div class="card"><h2>🌍 Share with everyone</h2>
      <p class="muted" style="margin-top:0">Paste a link in the box above, then press this to add it to everyone's reels.</p>
      <button class="ghost" data-act="shareReel" style="width:100%">Share with everyone</button><div id="reelSteps"></div></div>` : '';
  pageEl('reels').innerHTML = `${web}${addForm}${adminBox}
    ${S.myReels.length ? '<div class="sec">Your reels</div>' : ''}
    ${[...S.myReels].reverse().map(r => reelCard(r, true)).join('')}
    ${list.length ? '<div class="sec">Shared reels</div>' : ''}
    ${list.map(r => reelCard(r, false)).join('')}
    ${!list.length && !S.myReels.length ? '<div class="card muted">No reels yet.</div>' : ''}`;
}

const doseText = d => !d ? '' : d.micro ? 'Microdose' : `${d.grams}g`;

// ---------- quote of the day (same quote all day, changes daily) ----------
let QUOTES = [];
fetch('quotes.json').then(r => r.json()).then(q => { QUOTES = q; if (current === 'today') render(); }).catch(() => {});
function quoteHTML() {
  if (!QUOTES.length) return '';
  const n = Math.floor(new Date(today() + 'T12:00') / 864e5), q = QUOTES[n % QUOTES.length];
  return `<div class="quote"><p>“${esc(q.text)}”</p><span>— ${esc(q.by)}</span></div>`;
}

// ---------- morning & afternoon check-ins ----------
const PERIODS = [['am', '🌅 Morning'], ['pm', '☀️ Afternoon']];
const ciText = c => !c || (!c.mood && !c.energy) ? '–' : `${c.mood ? MOODS[c.mood - 1] : ''}${c.energy ? ` ⚡${c.energy}` : ''}`;
function checkinHTML(k) {
  const c = S.checkins[k] || {}, now = new Date().getHours() < 12 ? 'am' : 'pm';
  return `<div class="card"><h2>How are you feeling?</h2>${PERIODS.map(([p, label]) => `
    <div class="checkin ${p === now ? 'now' : ''}"><div class="ci-label">${label}</div>
      <div class="ci-row"><span class="ci-k">Mood</span><div class="scale">${MOODS.map((e, i) =>
        `<button class="${(c[p] || {}).mood === i + 1 ? 'sel' : ''}" data-ci="${p}" data-f="mood" data-v="${i + 1}">${e}</button>`).join('')}</div></div>
      <div class="ci-row"><span class="ci-k">Energy</span><div class="scale">${[1, 2, 3, 4, 5].map(i =>
        `<button class="${(c[p] || {}).energy === i ? 'sel' : ''}" data-ci="${p}" data-f="energy" data-v="${i}">${i}</button>`).join('')}</div></div></div>`).join('')}</div>`;
}

// ---------- graph: practices, mood, energy and mushroom days for a month ----------
function dayStats(k) {
  const c = S.checkins[k] || {}, es = S.journal.filter(e => e.date === k).concat([c.am, c.pm].filter(Boolean));
  const avg = f => { const v = es.map(e => e[f]).filter(Boolean); return v.length ? v.reduce((a, b) => a + b) / v.length : null; };
  return { mood: avg('mood'), energy: avg('energy'), amMood: (c.am || {}).mood || null, pmMood: (c.pm || {}).mood || null, amEn: (c.am || {}).energy || null, pmEn: (c.pm || {}).energy || null, practices: (S.done[k] || []).length, dose: S.doses[k] };
}
function graphHTML(y, m) {
  const days = new Date(y, m + 1, 0).getDate(), D = [];
  for (let d = 1; d <= days; d++) { const k = `${y}-${z(m + 1)}-${z(d)}`; D.push({ d, k, ...dayStats(k) }); }
  if (!D.some(x => x.mood || x.energy || x.practices || x.dose))
    return '<div class="card"><h2>Mood & practices graph</h2><p class="muted">Do your morning and afternoon check-ins, practices and mushroom days and your graph will appear here.</p></div>';
  const W = 340, H = 190, L = 22, R = 6, T = 22, B = 22, cw = (W - L - R) / days, maxP = Math.max(1, S.practices.length);
  const X = d => L + (d - 0.5) * cw, Y = v => T + (H - T - B) * (1 - (v - 1) / 4);
  const line = (f, cls) => { let p = '', pen = false;
    D.forEach(x => { if (x[f]) { p += `${pen ? 'L' : 'M'}${X(x.d).toFixed(1)} ${Y(x[f]).toFixed(1)}`; pen = true; } });
    return `<path d="${p}" class="${cls}"/>` + D.filter(x => x[f]).map(x => `<circle cx="${X(x.d).toFixed(1)}" cy="${Y(x[f]).toFixed(1)}" r="2.6" class="${cls}"/>`).join(''); };
  let g = '';
  for (let v = 1; v <= 5; v++) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 3}" class="ax" text-anchor="end">${v}</text>`;
  D.forEach(x => {
    if (x.practices) { const h = (H - T - B) * x.practices / maxP; g += `<rect x="${(X(x.d) - cw * 0.35).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(cw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" class="bar"/>`; }
    if (x.dose) g += `<text x="${X(x.d).toFixed(1)}" y="${T - 7}" text-anchor="middle" font-size="${x.dose.micro ? 9 : Math.min(14, 8 + x.dose.grams * 2)}">🍄</text>`;
    if (x.d === 1 || x.d % 5 === 0) g += `<text x="${X(x.d).toFixed(1)}" y="${H - 7}" class="ax" text-anchor="middle">${x.d}</text>`;
    g += `<rect x="${(X(x.d) - cw / 2).toFixed(1)}" y="0" width="${cw.toFixed(1)}" height="${H}" fill="transparent" data-day="${x.k}"/>`;
  });
  g += line('amEn', 'en am') + line('pmEn', 'en pm') + line('amMood', 'mo am') + line('pmMood', 'mo pm');
  const withMood = D.filter(x => x.mood), avg = a => a.length ? (a.reduce((s, x) => s + x.mood, 0) / a.length) : null;
  const cmp = (label, test) => { const a = avg(withMood.filter(test)), b = avg(withMood.filter(x => !test(x)));
    return a === null || b === null ? '' : `<div class="link"><span>${label}</span><b class="${a > b ? 'up' : a < b ? 'down' : ''}">${MOODS[Math.round(a) - 1]} ${a.toFixed(1)}</b><span class="muted">vs ${b.toFixed(1)} without</span></div>`; };
  const am = D.map(x => x.amMood).filter(Boolean), pm = D.map(x => x.pmMood).filter(Boolean), mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const ampm = am.length && pm.length ? `<div class="link"><span>🌅 Morning vs ☀️ afternoon</span><b>${MOODS[Math.round(mean(am)) - 1]} ${mean(am).toFixed(1)}</b><span class="muted">vs ${mean(pm).toFixed(1)}</span></div>` : '';
  const links = ampm + [cmp('🍄 Mushroom days', x => !!x.dose)].concat(S.practices.map(p => cmp(esc(p.name), x => (S.done[x.k] || []).includes(p.id))),
    S.supps.map(i => cmp('💊 ' + esc(i.name), x => (S.suppLog[x.k] || []).includes(i.id))), S.foods.map(i => cmp('🥗 ' + esc(i.name), x => (S.foodLog[x.k] || []).includes(i.id)))).join('');
  return `<div class="card"><h2>Mood & practices graph</h2>
    <svg viewBox="0 0 ${W} ${H}" class="graph">${g}</svg>
    <div class="legend"><span><i class="mo am"></i>Morning mood</span><span><i class="mo pm"></i>Afternoon mood</span><span><i class="en am"></i>Morning energy</span><span><i class="en pm"></i>Afternoon energy</span><span><i class="bar"></i>Practices done</span><span>🍄 Mushroom day</span></div>
    <p class="muted" style="font-size:.78rem">Tap a day on the graph to see its details above.</p>
    ${links ? `<h2 style="margin-top:14px">Average mood this month</h2>${links}` : ''}</div>`;
}

// ---------- splash: title slide, once per session ----------
(function splash() {
  const el = $('#splash'); if (!el) return;
  const done = () => { el.remove(); document.body.classList.remove('splashing'); };
  const hide = () => { el.classList.add('hide'); document.body.classList.remove('splashing'); setTimeout(() => el.remove(), 900); };
  if (sessionStorage.getItem('sb_seen')) return done();
  sessionStorage.setItem('sb_seen', '1');
  el.onclick = hide; setTimeout(hide, 4500);
})();

// ---------- drifting bokeh sparkles (gold, teal, ember) ----------
(function sparkles() {
  const c = $('#sparkles'); if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const x = c.getContext('2d'), cols = ['251,231,166', '233,196,106', '120,200,210', '255,150,60', '255,255,255'];
  let W, H, dpr, P = [];
  const mk = () => ({ x: Math.random() * W, y: Math.random() * H, r: (Math.random() ** 3) * 9 + 0.6, c: cols[Math.random() * cols.length | 0],
    vy: -(Math.random() * 0.25 + 0.05), vx: (Math.random() - 0.5) * 0.12, a: Math.random() * 0.55 + 0.25, t: Math.random() * 6.28, s: Math.random() * 0.02 + 0.005 });
  const size = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    P = Array.from({ length: Math.min(90, Math.round(W * H / 9000)) }, mk); };
  size(); addEventListener('resize', size);
  (function tick() {
    x.clearRect(0, 0, W, H);
    for (const p of P) {
      p.x += p.vx; p.y += p.vy; p.t += p.s;
      if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
      const a = p.a * (0.55 + 0.45 * Math.sin(p.t));
      const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
      g.addColorStop(0, `rgba(${p.c},${a})`); g.addColorStop(0.4, `rgba(${p.c},${a * 0.45})`); g.addColorStop(1, `rgba(${p.c},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r * 2.2, 0, 6.283); x.fill();
    }
    document.hidden ? setTimeout(tick, 500) : requestAnimationFrame(tick);
  })();
})();

// ---------- render & events ----------
function render() { stopDictation(); LIVE.forEach(renderPage); setActive(); }
function renderPage(name) {
  const el = document.getElementById('p-' + name); if (!el || !views[name]) return;
  const y = el.scrollTop; el.innerHTML = views[name](); el.scrollTop = y;
  if (name === 'guides') loadGuides();
  if (name === 'reels') loadReels();
}
function setActive() { document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === current)); }
function scrollToPage(name, smooth = true) {
  const box = $('#view'), i = PAGES.indexOf(name); if (i < 0) return;
  box.scrollTo({ left: i * box.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}
function go(v) { current = v; setActive(); renderPage(v); scrollToPage(v); }

document.querySelector('nav').onclick = e => { const b = e.target.closest('button'); if (b) { if (b.dataset.view === 'guides') gFolder = null; go(b.dataset.view); } };
$('#settingsBtn').onclick = () => go('settings');

$('#view').addEventListener('change', e => {
  const id = e.target.dataset.practice;
  if (id) { const k = today(), d = new Set(S.done[k] || []); e.target.checked ? d.add(id) : d.delete(id); S.done[k] = [...d]; save('done'); render(); }
  if (e.target.dataset.item) {
    const kind = e.target.dataset.lt, L = LISTS[kind], day = kind === 'food' ? trSel : listDay;
    const d = new Set(S[L.log][day] || []);
    e.target.checked ? d.add(e.target.dataset.item) : d.delete(e.target.dataset.item); S[L.log][day] = [...d]; save(L.log);
    const y = scrollY; render(); scrollTo(0, y);
  }
  if ('editmode' in e.target.dataset) { S.prefs.editMode = e.target.checked; save('prefs'); }
  if (e.target.dataset.time) { const it = S.supps.find(i => i.id === e.target.dataset.time); it.time = e.target.value; save('supps'); const y = scrollY; render(); scrollTo(0, y); }
  if (e.target.id === 'importFile' && e.target.files[0]) {
    e.target.files[0].text().then(t => {
      try { const d = JSON.parse(t); KEYS.forEach(k => { if (d[k]) { S[k] = k === 'prefs' ? { ...d[k], admin: S.prefs.admin } : d[k]; save(k); } }); go('today'); }
      catch { alertMsg('That file is not a valid backup.'); }
    });
  }
});

$('#view').addEventListener('click', async e => {
  const t = e.target.closest('button,[data-day],[data-trday]'); if (!t) return;
  const d = t.dataset;
  if (d.day) { calSel = d.day; render(); return; }
  if (d.trday) { trSel = d.trday; render(); return; }
  if (d.trtab) { trTab = d.trtab; render(); return; }
  if (d.ics) return downloadICS(S.supps.find(i => i.id === d.ics));
  if (d.quick) { const k = today(); S.suppLog[k] = [...new Set([...(S.suppLog[k] || []), d.quick])]; save('suppLog'); return render(); }
  if (d.delItem) { const L = LISTS[d.lt], it = S[L.items].find(i => i.id === d.delItem); if (confirm(`Remove ${it.name}?`)) { S[L.items] = S[L.items].filter(i => i.id !== d.delItem); save(L.items); render(); } return; }
  if (d.ci) {
    const k = today(), c = S.checkins[k] = S.checkins[k] || {}, p = c[d.ci] = c[d.ci] || {}, v = +d.v;
    p[d.f] = p[d.f] === v ? 0 : v; save('checkins');
    const y = scrollY; render(); scrollTo(0, y); return;
  }
  if (d.delReel) { if (confirm('Remove this reel?')) { S.myReels = S.myReels.filter(r => r.id !== d.delReel); save('myReels'); loadReels(); } return; }
  if (d.nav) return go(d.nav);
  if (d.edit) return entryForm(S.journal.find(x => x.id === d.edit));
  if (d.delEntry) { if (confirm('Delete this entry?')) { S.journal = S.journal.filter(x => x.id !== d.delEntry); save('journal'); render(); } return; }
  if (d.delPractice) { S.practices = S.practices.filter(p => p.id !== d.delPractice); save('practices'); render(); return; }
  if (d.share) {
    if (navigator.share) { try { await navigator.share({ title: 'Reel', url: d.share }); } catch {} return; }
    try { await navigator.clipboard.writeText(d.share); alert('Link copied. Paste it into a message to share.'); } catch { alert(d.share); }
    return;
  }
  switch (d.act) {
    case 'newEntry': return entryForm({ date: d.date || today(), mood: 0, energy: 0, intention: '', text: '' });
    case 'cancel': return render();
    case 'prevM': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); return render();
    case 'nextM': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); return render();
    case 'trPrev': trMonth = new Date(trMonth.getFullYear(), trMonth.getMonth() - 1, 1); return render();
    case 'trNext': trMonth = new Date(trMonth.getFullYear(), trMonth.getMonth() + 1, 1); return render();
    case 'logMicro': S.doses[trSel] = { micro: true }; save('doses'); return render();
    case 'logGrams': { const g = parseFloat($('#grams').value); if (g > 0) { S.doses[trSel] = { grams: +g.toFixed(2) }; save('doses'); render(); } return; }
    case 'clearDose': delete S.doses[trSel]; save('doses'); return render();
    case 'addItem': { const L = LISTS[d.lt], v = $('#newItem').value.trim(); if (v) { S[L.items].push({ id: uid(), name: v, time: '' }); save(L.items); const y = scrollY; render(); scrollTo(0, y); } return; }
    case 'addReel': {
      const url = $('#reelUrl').value.trim(), title = $('#reelTitle').value.trim();
      if (!reelInfo(url)) { alert('Please paste a full link starting with https://'); return; }
      S.myReels.push({ id: uid(), url, title }); save('myReels'); return loadReels();
    }
    case 'shareReel': {
      const url = $('#reelUrl').value.trim(), title = $('#reelTitle').value.trim();
      if (!reelInfo(url)) { alert('Please paste a full link starting with https://'); return; }
      if (!sharedReels) { alert("The reel list didn't load. Check your connection and try again."); return; }
      const text = JSON.stringify([...sharedReels, title ? { title, url } : { url }], null, 2) + '\n';
      let copied = true; try { await navigator.clipboard.writeText(text); } catch { copied = false; }
      $('#reelSteps').innerHTML = `<div class="publish-steps"><p><b>${copied ? '✅ The new reel list is copied.' : 'Copy the text below first, then continue.'}</b></p>
        <ol><li>Tap the button below to open GitHub (sign in if asked).</li><li>Tap in the text box there, select all, and paste.</li><li>Press <b>Commit changes</b>.</li></ol>
        ${copied ? '' : `<textarea rows="6" readonly>${esc(text)}</textarea>`}
        <p class="muted" style="font-size:.8rem">Everyone will see the new reel a minute or two later.</p>
        <a class="btn" style="width:100%" href="https://github.com/${REPO}/edit/main/reels.json" target="_blank" rel="noopener">Open GitHub to paste</a></div>`;
      return;
    }
    case 'adminIn': {
      const site = await getSite();
      if (!site.adminHash) { alert('Admin sign-in is not set up yet.'); return; }
      if (await sha256($('#adminPw').value) !== site.adminHash) { alert('That passphrase is not right.'); return; }
      S.prefs.admin = true; save('prefs'); return render();
    }
    case 'adminOut': S.prefs.admin = false; S.prefs.editMode = false; save('prefs'); return render();
    case 'install': if (installEvt) { installEvt.prompt(); installEvt = null; } return;
    case 'lday': { const dt = new Date(listDay + 'T12:00'); dt.setDate(dt.getDate() + (+d.step)); listDay = dkey(dt); return render(); }
    case 'lnew': editing = { kind: d.kind, id: null }; return render();
    case 'ledit': editing = { kind: d.kind, id: d.id }; return render();
    case 'lcancel': editing = null; return render();
    case 'ldel': {
      const L = LISTS[d.kind];
      if (confirm('Remove this from your list?')) { S[L.items] = S[L.items].filter(i => i.id !== d.id); save(L.items); }
      editing = null; return render();
    }
    case 'lsave': {
      const kind = d.kind, L = LISTS[kind], name = $('#iName').value.trim();
      if (!name) { alert('Please type a name first.'); return; }
      const type = $('#iType').value, days = [...document.querySelectorAll('.wdc:checked')].map(c => +c.value);
      if (type === 'days' && !days.length) { alert('Tick at least one day of the week.'); return; }
      const every = Math.max(1, Math.min(365, parseInt($('#iEvery').value, 10) || 2));
      const list = S[L.items], prev = editing && editing.id ? list.find(i => i.id === editing.id) : null;
      const freq = { type, days: type === 'days' ? days : [], every, start: (prev && prev.freq && prev.freq.start) || today() };
      if (prev) { prev.name = name; prev.freq = freq; if (kind === 'supps') prev.time = $('#iTime').value || ''; }
      else list.push({ id: uid(), name, freq, time: kind === 'supps' ? ($('#iTime').value || '') : '' });
      save(L.items); editing = null; return render();
    }
    case 'addPractice': { const v = $('#newPractice').value.trim(); if (v) { S.practices.push({ id: uid(), name: v }); save('practices'); render(); } return; }
    case 'export': {
      const blob = new Blob([JSON.stringify(Object.fromEntries(KEYS.map(k => [k, k === 'prefs' ? { ...S.prefs, admin: false } : S[k]])), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shroom-buddies-backup-${today()}.json`; a.click(); return;
    }
    case 'import': return $('#importFile').click();
  }
});

listDay = today();
PAGES.forEach(n => { const d = document.createElement('div'); d.className = 'page'; d.id = 'p-' + n; $('#view').appendChild(d); });
function layoutVars() {
  document.documentElement.style.setProperty('--hdr', document.querySelector('header').offsetHeight + 'px');
  document.documentElement.style.setProperty('--nav', document.querySelector('nav').offsetHeight + 'px');
}
layoutVars(); addEventListener('resize', layoutVars);
let swipeT = null;
$('#view').addEventListener('scroll', () => {          // after a swipe settles, make that page current
  clearTimeout(swipeT);
  swipeT = setTimeout(() => {
    const box = $('#view'), name = PAGES[Math.round(box.scrollLeft / box.clientWidth)];
    if (name && name !== current) { current = name; setActive(); if (name === 'guides' || name === 'reels') renderPage(name); }
  }, 90);
});
render();
scrollToPage(current, false);
setInterval(() => { if (!$('#fText') && !$('#iName')) renderPage('today'); }, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
