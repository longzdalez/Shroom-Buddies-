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
let current = 'today', calMonth = new Date(), calSel = today(), trMonth = new Date(), trSel = today();

const views = {
  today() {
    const k = today(), done = S.done[k] || [];
    const n = S.practices.filter(p => done.includes(p.id)).length;
    const todays = S.journal.filter(e => e.date === k);
    const pct = S.practices.length ? Math.round(n / S.practices.length * 100) : 0, st = streak();
    const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return `${quoteHTML()}
      <div class="greet">✦ ${greet}, buddy ✦</div>
      <div class="card hero">
        <div class="ring" style="--p:${pct}"><div><b>${pct}%</b><small>TODAY</small></div></div>
        <div><div class="date">${nice(k)}</div>
          <div class="muted">${n} of ${S.practices.length} practices done</div>
          <div class="chips"><span class="chip">🔥 ${st} day streak</span><span class="chip">📓 ${S.journal.length} entries</span></div></div></div>
      ${checkinHTML(k)}
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
      const k = `${y}-${z(m + 1)}-${z(d)}`, hasJ = S.journal.some(e => e.date === k), p = (S.done[k] || []).length, ds = S.doses[k];
      cells += `<div class="day ${k === today() ? 'today' : ''} ${k === calSel ? 'sel' : ''}" data-day="${k}">${d}
        <div class="dots">${hasJ ? '📓' : ''}${p ? '🌱' : ''}${ds ? '🍄' : ''}</div></div>`;
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
        <div class="muted">Practices: ${done.length ? S.practices.filter(p => done.includes(p.id)).map(p => esc(p.name)).join(', ') : 'none'}</div>
        ${ents.map(e => `<div style="margin-top:10px">${entryHTML(e)}</div>`).join('')}
        <button class="small" data-act="newEntry" data-date="${calSel}" style="margin-top:10px">+ Entry for this day</button></div>
      ${graphHTML(y, m)}`;
  },
  tracker() {
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
  },
  guides() { loadGuides(); return '<div class="card muted">Loading guides…</div>'; },
  settings() {
    return `<div class="card howto"><h2>How to use Shroom Buddies</h2>
        <ol>
          <li><b>🌱 Today</b> – tap your mood and energy in the morning and again in the afternoon, then tick off each practice as you do it.</li>
          <li><b>📓 Journal</b> – write how you feel, your intention for the day and anything you noticed.</li>
          <li><b>🍄 Tracker</b> – tap a day, then press <b>Microdose</b> or type how many grams and press <b>Save</b>.</li>
          <li><b>📅 Calendar</b> – tap any day to see everything you logged. Scroll down for your graph and to see which days you felt best.</li>
          <li><b>📖 Guides</b> – read the guides.</li>
          <li><b>⚙️ Settings</b> – add or remove practices, and press <b>Export</b> now and then to save a backup.</li>
        </ol>
        <p class="muted">Everything is kept only on this phone. To install it, open the app in your browser and choose <b>Add to Home Screen</b>.</p></div>
      <div class="card"><h2>Daily practices</h2>
        ${S.practices.map(p => `<div class="practice"><span style="flex:1">${esc(p.name)}</span>
          <button class="ghost small" data-del-practice="${p.id}">Remove</button></div>`).join('')}
        <div class="row" style="margin-top:8px"><input id="newPractice" placeholder="Add a practice"><button data-act="addPractice" style="flex:0">Add</button></div></div>
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
  const links = ampm + [cmp('🍄 Mushroom days', x => !!x.dose)].concat(S.practices.map(p => cmp(esc(p.name), x => (S.done[x.k] || []).includes(p.id)))).join('');
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
function render() {
  $('#view').innerHTML = views[current]();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === current));
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
      try { const d = JSON.parse(t); ['journal', 'practices', 'done', 'doses', 'checkins'].forEach(k => { if (d[k]) { S[k] = d[k]; save(k); } }); go('today'); }
      catch { alertMsg('That file is not a valid backup.'); }
    });
  }
});

$('#view').addEventListener('click', e => {
  const t = e.target.closest('button,[data-day],[data-trday]'); if (!t) return;
  const d = t.dataset;
  if (d.day) { calSel = d.day; render(); return; }
  if (d.trday) { trSel = d.trday; render(); return; }
  if (d.ci) {
    const k = today(), c = S.checkins[k] = S.checkins[k] || {}, p = c[d.ci] = c[d.ci] || {}, v = +d.v;
    p[d.f] = p[d.f] === v ? 0 : v; save('checkins');
    const y = scrollY; render(); scrollTo(0, y); return;
  }
  if (d.nav) return go(d.nav);
  if (d.edit) return entryForm(S.journal.find(x => x.id === d.edit));
  if (d.delEntry) { if (confirm('Delete this entry?')) { S.journal = S.journal.filter(x => x.id !== d.delEntry); save('journal'); render(); } return; }
  if (d.delPractice) { S.practices = S.practices.filter(p => p.id !== d.delPractice); save('practices'); render(); return; }
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
    case 'addPractice': { const v = $('#newPractice').value.trim(); if (v) { S.practices.push({ id: uid(), name: v }); save('practices'); render(); } return; }
    case 'export': {
      const blob = new Blob([JSON.stringify({ journal: S.journal, practices: S.practices, done: S.done, doses: S.doses, checkins: S.checkins }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shroom-buddies-backup-${today()}.json`; a.click(); return;
    }
    case 'import': return $('#importFile').click();
  }
});

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
