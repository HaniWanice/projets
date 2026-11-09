/* ToDo Smart Équipe: tasks, meetings and presence for a small team, synced live.
   Storage: Firestore collection demos/<DEMO>/team (one document per task, meeting, presence ping or activity line,
   stored as a JSON payload). Without network it falls back to this browser (localStorage + BroadcastChannel,
   so two tabs still sync). Classic script on purpose: it also runs from a double-clicked file. */
(function () {
  'use strict';
  var TEAM = [
    { id: 'amaury', name: 'Amaury', c: 'var(--c1)' }, { id: 'hani', name: 'Hani', c: 'var(--c2)' }, { id: 'lynda', name: 'Lynda', c: 'var(--c3)' },
    { id: 'nathalie', name: 'Nathalie', c: 'var(--c4)' }, { id: 'sebastien', name: 'Sébastien', c: 'var(--c5)' }, { id: 'invite', name: 'Invité', c: 'var(--c6)' },
  ];
  var BY = {}; TEAM.forEach(function (m) { BY[m.id] = m; });
  var COLS = [['todo', 'À faire', 'var(--muted)'], ['doing', 'En cours', 'var(--accent)'], ['done', 'Terminé', 'var(--ok)']];
  var LABELS = ['Formation', 'Commercial', 'Administratif', 'Qualiopi', 'Site'];
  var H0 = 8, H1 = 19, HH = 52;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parseIso = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var monday = function (d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x; };
  var addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  var mins = function (t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; };
  var DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  var MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var fmtDay = function (s) { var d = parseIso(s); return DAYS[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
  var ago = function (t) { var s = Math.round((Date.now() - t) / 1000); return s < 10 ? 'à l’instant' : s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : s < 86400 ? 'il y a ' + Math.round(s / 3600) + ' h' : 'le ' + fmtDay(iso(new Date(t))); };
  var av = function (id, extra) { var m = BY[id] || BY.invite; return '<span class="av ' + (extra || '') + '" style="--c:' + m.c + '" title="' + esc(m.name) + '">' + esc(m.name.slice(0, 2)) + '</span>'; };

  /* ---------- Identity ---------- */
  var CLIENT = sessionStorage.getItem('eq.client') || uid(); sessionStorage.setItem('eq.client', CLIENT);
  var me = localStorage.getItem('eq.me') || (window.HW && HW.isAdmin ? 'hani' : '');

  /* ---------- Data layer ---------- */
  var docs = {}; var backend = null; var seeded = false;
  var listeners = [];
  function emit(changes) { listeners.forEach(function (f) { f(changes); }); }
  function localBackend() {
    var KEY = 'eq.local.v1', ch = 'BroadcastChannel' in window ? new BroadcastChannel('eq') : null;
    var read = function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
    var write = function (o) { localStorage.setItem(KEY, JSON.stringify(o)); if (ch) ch.postMessage('x'); };
    var push = function () { var o = read(); var changes = diff(o); docs = o; emit(changes); };
    if (ch) ch.onmessage = push;
    addEventListener('storage', function (e) { if (e.key === KEY) push(); });
    return { status: 'local', start: function () { push(); if (!Object.keys(docs).length) seed(); }, put: function (d) { var o = read(); o[d.id] = d; write(o); push(); }, del: function (id) { var o = read(); delete o[id]; write(o); push(); } };
  }
  function fireBackend(db) {
    var col = db.collection('demos').doc(HW.demo).collection('team');
    return {
      status: 'synced',
      start: function () {
        col.onSnapshot(function (snap) {
          var o = {};
          snap.forEach(function (d) { try { var v = JSON.parse(d.data().payload); o[v.id] = v; } catch (e) {} });
          var changes = diff(o); docs = o; emit(changes);
          if (!snap.metadata.fromCache && !snap.size && !seeded) seed();
        }, function () { switchToLocal(); });
      },
      put: function (d) { col.doc(d.id).set({ payload: JSON.stringify(d), at: Date.now() }).catch(function () {}); docs[d.id] = d; emit([{ d: d, kind: 'mine' }]); },
      del: function (id) { col.doc(id).delete().catch(function () {}); delete docs[id]; emit([]); },
    };
  }
  function diff(next) {
    var out = [];
    Object.keys(next).forEach(function (k) { var a = docs[k], b = next[k]; if (!a || a.at !== b.at) out.push({ d: b, kind: a ? 'changed' : 'added' }); });
    return out;
  }
  function switchToLocal() { if (backend && backend.status === 'local') return; backend = localBackend(); setSync('local'); backend.start(); }
  function put(d, act) {
    d.at = Date.now(); d.by = me || 'invite'; backend.put(d);
    if (act) backend.put({ type: 'act', id: 'a-' + uid(), text: act, by: d.by, at: Date.now() + 1 });
  }
  function setSync(s) { var el = $('#sync'); el.dataset.s = s; el.lastChild.textContent = s === 'synced' ? 'Synchronisé en direct' : s === 'local' ? 'Sur cet appareil' : 'Connexion…'; }

  function seed() {
    seeded = true;
    var w = monday(new Date());
    var day = function (n) { return iso(addDays(w, n)); };
    var T = [
      ['Préparer la session SSCT de jeudi', 'Relire le questionnaire préalable des élus et adapter les exemples.', 'doing', 'lynda', day(2), 'Formation'],
      ['Envoyer les conventions de formation signées', '', 'todo', 'nathalie', day(1), 'Administratif'],
      ['Rappeler les CSE qui votent en mars 2027', 'Liste exportée depuis l’outil de prospection.', 'todo', 'amaury', day(0), 'Commercial'],
      ['Mettre à jour le questionnaire préalable', '', 'todo', 'sebastien', day(4), 'Formation'],
      ['Préparer l’audit de surveillance Qualiopi', 'Rassembler les preuves des indicateurs.', 'todo', 'amaury', day(9), 'Qualiopi'],
      ['Mettre en ligne le nouveau site', 'Valider les textes avec Amaury.', 'doing', 'hani', day(3), 'Site'],
      ['Créer le support de la formation IA', '', 'doing', 'sebastien', day(7), 'Formation'],
      ['Relancer les devis sans réponse', '', 'done', 'amaury', day(-1), 'Commercial'],
      ['Envoyer le questionnaire de suivi', '', 'done', 'nathalie', day(-2), 'Formation'],
    ];
    T.forEach(function (t, i) { backend.put({ type: 'task', id: 't-' + uid(), title: t[0], desc: t[1], status: t[2], who: t[3], due: t[4], label: t[5], order: i, by: 'hani', at: Date.now() - 86400e3 + i }); });
    var E = [
      ['Point d’équipe de la semaine', 0, '09:00', '09:30', ['amaury', 'hani', 'lynda', 'nathalie', 'sebastien'], 'Visio'],
      ['Appel découverte avec un CSE', 0, '14:00', '15:00', ['amaury'], 'Téléphone'],
      ['Besoins du CSE d’une PME logistique', 1, '10:00', '11:30', ['amaury', 'nathalie'], 'Visio'],
      ['Préparer la formation SSCT', 2, '13:30', '15:00', ['lynda', 'sebastien'], 'Bureau'],
      ['Formation SSCT, jour 1', 3, '09:00', '17:00', ['lynda'], 'En salle'],
      ['Démo du nouveau site', 3, '11:00', '12:00', ['amaury', 'hani'], 'Visio'],
      ['Suivi après formation', 4, '10:00', '11:00', ['nathalie'], 'Téléphone'],
      ['Revue des prospects 2027', 4, '15:00', '16:00', ['amaury', 'hani'], 'Bureau'],
    ];
    E.forEach(function (e, i) { backend.put({ type: 'event', id: 'e-' + uid(), title: e[0], date: day(e[1]), start: e[2], end: e[3], who: e[4], place: e[5], by: 'hani', at: Date.now() - 86400e3 + i }); });
  }

  /* ---------- Render ---------- */
  var view = 'board', filter = 'all', week = monday(new Date());
  var tasks = function () { return Object.values(docs).filter(function (d) { return d.type === 'task'; }); };
  var events = function () { return Object.values(docs).filter(function (d) { return d.type === 'event'; }); };
  function renderPeople() {
    var online = {};
    Object.values(docs).forEach(function (d) { if (d.type === 'presence' && Date.now() - d.at < 45e3) online[d.who] = true; });
    if (me) online[me] = true;
    $('#people').innerHTML = TEAM.filter(function (m) { return m.id !== 'invite' || online.invite; }).map(function (m) { return av(m.id, online[m.id] ? 'on' : 'off'); }).join('');
  }
  function renderFilters() {
    $('#filters').innerHTML = '<button class="chip" data-f="all" aria-pressed="' + (filter === 'all') + '">Tout le monde</button>' +
      TEAM.filter(function (m) { return m.id !== 'invite'; }).map(function (m) { return '<button class="chip" data-f="' + m.id + '" aria-pressed="' + (filter === m.id) + '">' + av(m.id) + esc(m.name) + '</button>'; }).join('');
  }
  function renderBoard() {
    var today = iso(new Date());
    var list = tasks().filter(function (t) { return filter === 'all' || t.who === filter; });
    $('#board').innerHTML = COLS.map(function (c) {
      var items = list.filter(function (t) { return t.status === c[0]; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.at - b.at; });
      return '<section class="col" data-col="' + c[0] + '"><div class="col-head" style="--dot:' + c[2] + '"><b>' + c[1] + '</b><span>' + items.length + '</span></div><div class="cards">' +
        items.map(function (t) {
          var late = t.due && t.due < today && t.status !== 'done';
          return '<article class="task' + (t.status === 'done' ? ' done' : '') + '" data-id="' + t.id + '" tabindex="0"><h3>' + esc(t.title) + '</h3><div class="meta">' + av(t.who) +
            (t.due ? '<span class="due' + (late ? ' late' : '') + '">' + (late ? 'En retard, ' : '') + fmtDay(t.due) + '</span>' : '') + (t.label ? '<span class="label">' + esc(t.label) + '</span>' : '') + '</div></article>';
        }).join('') + '</div><button class="add-inline" type="button" data-add="' + c[0] + '">+ Ajouter une tâche</button></section>';
    }).join('');
  }
  function renderAgenda() {
    var days = [0, 1, 2, 3, 4].map(function (i) { return addDays(week, i); });
    var today = iso(new Date());
    $('#weekLabel').textContent = 'Semaine du ' + days[0].getDate() + ' ' + MONTHS[days[0].getMonth()];
    var evs = events();
    var clash = {};
    evs.forEach(function (a) { evs.forEach(function (b) { if (a !== b && a.date === b.date && mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end) && a.who.some(function (w) { return b.who.indexOf(w) >= 0; })) clash[a.id] = true; }); });
    var h = '<div class="corner"></div>' + days.map(function (d) { return '<div class="dh' + (iso(d) === today ? ' today' : '') + '">' + DAYS[(d.getDay() + 6) % 7] + '<small>' + d.getDate() + ' ' + MONTHS[d.getMonth()] + '</small></div>'; }).join('');
    h += '<div class="hours" style="height:' + (H1 - H0) * HH + 'px">' + Array.from({ length: H1 - H0 }, function (_, i) { return '<span style="top:' + i * HH + 'px">' + (H0 + i) + ' h</span>'; }).join('') + '</div>';
    days.forEach(function (d) {
      var ds = iso(d);
      var dayEvs = evs.filter(function (e) { return e.date === ds && (filter === 'all' || e.who.indexOf(filter) >= 0); }).sort(function (a, b) { return mins(a.start) - mins(b.start); });
      // Overlapping meetings share the column side by side: each gets a lane, and the group width is split.
      var laneEnd = [], lane = {}, group = {};
      dayEvs.forEach(function (e) { var l = 0; while (laneEnd[l] > mins(e.start)) l++; laneEnd[l] = mins(e.end); lane[e.id] = l; });
      dayEvs.forEach(function (e) { group[e.id] = 1 + Math.max.apply(null, dayEvs.filter(function (o) { return mins(o.start) < mins(e.end) && mins(e.start) < mins(o.end); }).map(function (o) { return lane[o.id]; })); });
      var inner = dayEvs.map(function (e) {
        var top = (mins(e.start) - H0 * 60) / 60 * HH, hgt = Math.max(22, (mins(e.end) - mins(e.start)) / 60 * HH - 2);
        var m = BY[e.who[0]] || BY.invite;
        return '<div class="ev' + (clash[e.id] ? ' clash' : '') + '" data-id="' + e.id + '" style="top:' + top + 'px;height:' + hgt + 'px;--c:' + m.c + ';left:calc(' + (lane[e.id] / group[e.id] * 100) + '% + 4px);right:auto;width:calc(' + (100 / group[e.id]) + '% - 8px)"><b>' + esc(e.title) + '</b><span>' + e.start + ' à ' + e.end + (e.place ? ', ' + esc(e.place) : '') + '</span>' +
          (hgt > 60 ? '<div class="avs">' + e.who.map(function (w) { return av(w); }).join('') + '</div>' : '') + '</div>';
      }).join('');
      var now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
      var line = ds === today && nowM > H0 * 60 && nowM < H1 * 60 ? '<div class="now" style="top:' + (nowM - H0 * 60) / 60 * HH + 'px"></div>' : '';
      h += '<div class="day' + (ds === today ? ' today' : '') + '" data-date="' + ds + '" style="height:' + (H1 - H0) * HH + 'px;--hh:' + HH + 'px">' + line + inner + '</div>';
    });
    $('#cal').innerHTML = h;
  }
  function renderFeed() {
    var acts = Object.values(docs).filter(function (d) { return d.type === 'act'; }).sort(function (a, b) { return b.at - a.at; }).slice(0, 30);
    $('#feed').innerHTML = acts.length ? acts.map(function (a) { return '<li data-id="' + a.id + '">' + av(a.by) + '<span><b>' + esc((BY[a.by] || BY.invite).name) + '</b> ' + esc(a.text) + '</span><small>' + ago(a.at) + '</small></li>'; }).join('') : '<li><span></span><span>Rien pour l’instant. Ajoutez une tâche : elle apparaîtra ici, chez tout le monde.</span></li>';
  }
  function render(changes) {
    renderPeople(); renderFilters();
    if (view === 'board') renderBoard(); else if (view === 'agenda') renderAgenda(); else renderFeed();
    (changes || []).forEach(function (c) {
      if (c.kind !== 'changed' && c.kind !== 'added') return;
      if (!initial && c.d.by !== me && (c.d.type === 'task' || c.d.type === 'event')) {
        var el = document.querySelector('[data-id="' + c.d.id + '"]');
        if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      }
      if (!initial && c.d.type === 'act' && c.d.by !== me && Date.now() - c.d.at < 15e3) toast((BY[c.d.by] || BY.invite).name + ' ' + c.d.text);
    });
  }
  var initial = true;
  listeners.push(function (changes) { render(changes); if (Object.keys(docs).length) initial = false; });
  var tt = 0;
  function toast(t) { var el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove('on'); }, 3200); }

  /* ---------- Interactions ---------- */
  $('#views').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    view = b.dataset.v;
    $$('#views button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'v-' + view; });
    render();
  });
  document.addEventListener('click', function (e) {
    var f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; render(); }
  });
  $('#prevW').addEventListener('click', function () { week = addDays(week, -7); renderAgenda(); });
  $('#nextW').addEventListener('click', function () { week = addDays(week, 7); renderAgenda(); });
  $('#todayW').addEventListener('click', function () { week = monday(new Date()); renderAgenda(); });

  // Task dialog
  var dt = $('#dlgTask'), ft = $('#formTask');
  function openTask(t, status) {
    var isNew = !t; t = t || { type: 'task', id: 't-' + uid(), title: '', desc: '', status: status || 'todo', who: me && me !== 'invite' ? me : 'amaury', due: '', label: 'Formation', order: Date.now() };
    ft.dataset.id = t.id; ft.dataset.isnew = isNew ? '1' : '';
    $('#tTitle').textContent = isNew ? 'Nouvelle tâche' : 'Modifier la tâche';
    ft.elements.title.value = t.title; ft.elements.desc.value = t.desc || ''; ft.elements.status.value = t.status; ft.elements.who.value = t.who; ft.elements.due.value = t.due || ''; ft.elements.label.value = t.label || '';
    $('#tDel').hidden = isNew;
    ft._task = t; dt.showModal(); ft.elements.title.focus();
  }
  ft.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.submitter && e.submitter.value === 'cancel') return dt.close();
    var t = Object.assign({}, ft._task, { title: ft.elements.title.value.trim(), desc: ft.elements.desc.value.trim(), status: ft.elements.status.value, who: ft.elements.who.value, due: ft.elements.due.value, label: ft.elements.label.value });
    if (!t.title) return ft.elements.title.focus();
    var before = docs[t.id];
    var act = !before ? 'a ajouté « ' + t.title + ' »' : before.status !== t.status ? 'a passé « ' + t.title + ' » en ' + COLS.filter(function (c) { return c[0] === t.status; })[0][1].toLowerCase() : 'a modifié « ' + t.title + ' »';
    put(t, act); dt.close();
  });
  $('#tDel').addEventListener('click', function () { var t = ft._task; backend.del(t.id); put({ type: 'act', id: 'a-' + uid(), text: 'a supprimé « ' + t.title + ' »' }); dt.close(); });

  // Board: click to edit, drag between columns (pointer events: mouse, pen and touch)
  var drag = null;
  $('#board').addEventListener('pointerdown', function (e) {
    var card = e.target.closest('.task'); if (!card || e.button > 0) return;
    drag = { id: card.dataset.id, card: card, x: e.clientX, y: e.clientY, moved: false };
  });
  addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) {
      drag.moved = true; var r = drag.card.getBoundingClientRect();
      drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
      drag.ghost = drag.card.cloneNode(true); drag.ghost.classList.add('ghost'); drag.ghost.style.width = r.width + 'px'; document.body.appendChild(drag.ghost);
      drag.card.classList.add('dragging');
    }
    drag.ghost.style.left = (e.clientX - drag.dx) + 'px'; drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
    var col = document.elementFromPoint(e.clientX, e.clientY); col = col && col.closest('.col');
    $$('.col').forEach(function (c) { c.classList.toggle('drop', c === col); });
  });
  addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.moved) { openTask(docs[d.id]); return; }
    d.ghost.remove(); d.card.classList.remove('dragging');
    var col = $('.col.drop'); $$('.col').forEach(function (c) { c.classList.remove('drop'); });
    var t = docs[d.id];
    if (col && t && col.dataset.col !== t.status) {
      var label = COLS.filter(function (c) { return c[0] === col.dataset.col; })[0][1].toLowerCase();
      put(Object.assign({}, t, { status: col.dataset.col, order: Date.now() }), 'a passé « ' + t.title + ' » en ' + label);
    }
  });
  $('#board').addEventListener('keydown', function (e) { var c = e.target.closest('.task'); if (c && e.key === 'Enter') openTask(docs[c.dataset.id]); });
  $('#board').addEventListener('click', function (e) { var a = e.target.closest('[data-add]'); if (a) openTask(null, a.dataset.add); });
  $('#newTask').addEventListener('click', function () { openTask(null, 'todo'); });

  // Meeting dialog
  var de = $('#dlgEvent'), fe = $('#formEvent');
  function whoBoxes(sel) { return TEAM.filter(function (m) { return m.id !== 'invite'; }).map(function (m) { return '<label><input type="checkbox" name="who" value="' + m.id + '"' + (sel.indexOf(m.id) >= 0 ? ' checked' : '') + '>' + av(m.id) + esc(m.name) + '</label>'; }).join(''); }
  function openEvent(ev, date, start) {
    var isNew = !ev;
    ev = ev || { type: 'event', id: 'e-' + uid(), title: '', date: date || iso(new Date()), start: start || '10:00', end: start ? pad(Math.min(H1, +start.split(':')[0] + 1)) + ':' + start.split(':')[1] : '11:00', who: [me && me !== 'invite' ? me : 'amaury'], place: 'Visio' };
    fe._ev = ev; $('#eTitle').textContent = isNew ? 'Nouveau rendez-vous' : 'Modifier le rendez-vous';
    fe.elements.title.value = ev.title; fe.elements.date.value = ev.date; fe.elements.start.value = ev.start; fe.elements.end.value = ev.end; fe.elements.place.value = ev.place || '';
    $('#eWho').innerHTML = whoBoxes(ev.who); $('#eDel').hidden = isNew; checkClash(); de.showModal(); fe.elements.title.focus();
  }
  function formEvent() { return Object.assign({}, fe._ev, { title: fe.elements.title.value.trim(), date: fe.elements.date.value, start: fe.elements.start.value, end: fe.elements.end.value, place: fe.elements.place.value.trim(), who: $$('input[name="who"]:checked', fe).map(function (i) { return i.value; }) }); }
  function checkClash() {
    var e = formEvent(), w = $('#eWarn');
    var hit = events().filter(function (o) { return o.id !== e.id && o.date === e.date && e.start && e.end && mins(e.start) < mins(o.end) && mins(o.start) < mins(e.end) && o.who.some(function (x) { return e.who.indexOf(x) >= 0; }); })[0];
    w.hidden = !hit;
    if (hit) { var who = hit.who.filter(function (x) { return e.who.indexOf(x) >= 0; }).map(function (x) { return BY[x].name; }).join(', '); w.textContent = who + ' a déjà « ' + hit.title + ' » de ' + hit.start + ' à ' + hit.end + '.'; }
  }
  fe.addEventListener('input', checkClash); fe.addEventListener('change', checkClash);
  fe.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.submitter && e.submitter.value === 'cancel') return de.close();
    var ev = formEvent();
    if (!ev.title) return fe.elements.title.focus();
    if (!ev.who.length) ev.who = [me || 'invite'];
    if (mins(ev.end) <= mins(ev.start)) { fe.elements.end.focus(); return; }
    put(ev, (docs[ev.id] ? 'a déplacé ou modifié le rendez-vous « ' : 'a planifié « ') + ev.title + ' » le ' + fmtDay(ev.date) + ' à ' + ev.start);
    de.close();
  });
  $('#eDel').addEventListener('click', function () { var ev = fe._ev; backend.del(ev.id); put({ type: 'act', id: 'a-' + uid(), text: 'a annulé « ' + ev.title + ' »' }); de.close(); });
  $('#cal').addEventListener('click', function (e) {
    var ev = e.target.closest('.ev'); if (ev) return openEvent(docs[ev.dataset.id]);
    var day = e.target.closest('.day'); if (!day) return;
    var y = e.clientY - day.getBoundingClientRect().top, m = Math.floor((y / HH * 60) / 30) * 30 + H0 * 60;
    openEvent(null, day.dataset.date, pad(Math.floor(m / 60)) + ':' + pad(m % 60));
  });
  $('#newEvent').addEventListener('click', function () { openEvent(null); });

  // Identity
  var sel = $('#meSel');
  sel.innerHTML = '<option value="">Qui êtes-vous ?</option>' + TEAM.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
  sel.value = me;
  var meAv = function () { $('#meAv').outerHTML = '<span id="meAv">' + av(me || 'invite') + '</span>'; };
  meAv();
  sel.addEventListener('change', function () { me = sel.value; localStorage.setItem('eq.me', me); meAv(); ping(); render(); });
  if (!me) { $('#dlgWho').showModal(); }
  $('#whoPick').innerHTML = TEAM.map(function (m) { return '<button class="btn" type="button" data-me="' + m.id + '">' + av(m.id) + esc(m.name) + '</button>'; }).join('');
  $('#whoPick').addEventListener('click', function (e) { var b = e.target.closest('[data-me]'); if (!b) return; me = b.dataset.me; sel.value = me; localStorage.setItem('eq.me', me); meAv(); $('#dlgWho').close(); ping(); render(); });

  // Presence ping
  function ping() { if (backend && me) backend.put({ type: 'presence', id: 'p-' + CLIENT, who: me, at: Date.now() }); }
  setInterval(function () { ping(); renderPeople(); if (view === 'board' || view === 'activity') { if (view === 'activity') renderFeed(); } }, 15000);

  // Admin: reset the demo data
  if (window.HW && HW.isAdmin) {
    $('#reset').hidden = false;
    $('#reset').addEventListener('click', function () {
      if (!confirm('Remettre les tâches et rendez-vous de démonstration ? Les ajouts seront effacés pour tout le monde.')) return;
      Object.keys(docs).forEach(function (id) { backend.del(id); }); seeded = false; setTimeout(seed, 400); toast('Données de démonstration remises.');
    });
  }

  /* ---------- Start ---------- */
  setSync('connecting');
  var started = false;
  var startLocal = function () { if (started) return; started = true; backend = localBackend(); setSync('local'); backend.start(); ping(); };
  var timer = setTimeout(startLocal, 5000);
  if (window.HW && HW.ready) HW.ready.then(function (db) {
    if (started) return; clearTimeout(timer); started = true;
    backend = fireBackend(db); setSync('synced'); backend.start(); ping();
  }).catch(startLocal); else startLocal();
})();
