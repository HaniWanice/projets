/* Live layer shared by every page of the demo.
   - Reads the admin's choices (which projects are shown) and applies them, even on a link sent days ago.
   - Presenter mode: the admin's browser broadcasts where it is (page, scroll, clicks, Qualyz settings);
     visitors' browsers follow along.
   Storage: Firestore (Firebase project todo-1d5e9), documents demos/<DEMO>/state/{config,live}.
   Trust: every write is signed with the admin's private key (ECDSA P-256). Visitors only apply payloads whose
   signature matches the public key below, so a visitor cannot steer the demo even by writing to the database.
   Works without network (file://, offline): everything is shown, nothing syncs. */
(function () {
  'use strict';
  var SCRIPT = document.currentScript;
  var ROOT = new URL('../', SCRIPT.src).href;
  var FIREBASE = {
    apiKey: 'AIzaSyCVDixlbRMMSVDmN3nIInLjzFvHISNWjQw', authDomain: 'todo-1d5e9.firebaseapp.com', projectId: 'todo-1d5e9',
    storageBucket: 'todo-1d5e9.firebasestorage.app', messagingSenderId: '749734012798', appId: '1:749734012798:web:34d125edcb702d342db52f',
  };
  var DEMO = 'hani-a75639390d67e0cc1a6a870c89462c54371b';
  var PUB = { kty: 'EC', crv: 'P-256', x: 'OLispJTFSzX5XONBGA48KNdicApGbW5h632Yoagk6nA', y: 'gGHwckU44bvu5u6mJRT71sOf3CZvh1UXi9IvBqn-_gI' };
  var FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var PROJECTS = ['vitesse', 'equipe', 'prospection', 'qualyz'];

  var html = document.documentElement;
  var project = html.getAttribute('data-project') || '';
  var store = function (k, v) { try { if (v === null) localStorage.removeItem(k); else if (v !== undefined) localStorage.setItem(k, v); return localStorage.getItem(k); } catch (e) { return null; } };
  var adminD = store('hw.admin.d');
  var isAdmin = !!adminD;
  var broadcasting = isAdmin && store('hw.broadcast') === '1';
  var enc = new TextEncoder();
  var b64 = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); };
  var unb64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  var rel = function () { var p = location.href.split('#')[0].slice(ROOT.length); return p.replace(/(^|\/)index\.html$/, '$1'); };

  var listeners = { config: [], status: [] };
  var HW = window.HW = {
    root: ROOT, project: project, isAdmin: isAdmin, demo: DEMO, status: 'local',
    config: readCachedConfig(),
    onConfig: function (cb) { listeners.config.push(cb); cb(HW.config); },
    onStatus: function (cb) { listeners.status.push(cb); cb(HW.status); },
    db: null,
  };
  function readCachedConfig() {
    try { return JSON.parse(store('hw.config') || 'null') || { visible: {} }; } catch (e) { return { visible: {} }; }
  }
  HW.isVisible = function (p) { return !HW.config.visible || HW.config.visible[p] !== false; };
  function setStatus(s) { HW.status = s; listeners.status.forEach(function (f) { f(s); }); }

  /* ---------- Visitors never see the Qualyz customizer ---------- */
  if (!isAdmin) {
    var st = document.createElement('style');
    st.textContent = '[data-s="prod-perso"]{display:none!important}';
    document.head.appendChild(st);
  }

  /* ---------- Crypto ---------- */
  var pubKey = crypto.subtle ? crypto.subtle.importKey('jwk', PUB, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']) : null;
  var prvKey = isAdmin && crypto.subtle ? crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: PUB.x, y: PUB.y, d: adminD }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']).catch(function () { return null; }) : null;
  function verify(doc) {
    if (!doc || typeof doc.payload !== 'string' || typeof doc.sig !== 'string' || !pubKey) return Promise.resolve(null);
    return pubKey.then(function (k) { return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, unb64(doc.sig), enc.encode(doc.payload)); })
      .then(function (ok) { return ok ? JSON.parse(doc.payload) : null; }).catch(function () { return null; });
  }
  function sign(obj) {
    var payload = JSON.stringify(obj);
    return prvKey.then(function (k) {
      if (!k) throw new Error('code administrateur invalide');
      return crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, enc.encode(payload));
    }).then(function (s) { return { payload: payload, sig: b64(s), at: Date.now() }; });
  }

  /* ---------- Firestore (loaded lazily, classic scripts so file:// works) ---------- */
  function load(src) { return new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
  var dbReady = (location.protocol === 'file:' && !navigator.onLine) ? Promise.reject(new Error('offline')) :
    load(FB + 'firebase-app-compat.js').then(function () { return load(FB + 'firebase-firestore-compat.js'); }).then(function () {
      var app = firebase.apps.filter(function (a) { return a.name === 'hw'; })[0] || firebase.initializeApp(FIREBASE, 'hw');
      var db = app.firestore();
      HW.db = db;
      return db;
    });
  HW.ready = dbReady;
  var docRef = function (db, name) { return db.collection('demos').doc(DEMO).collection('state').doc(name); };

  /* ---------- Config: which projects are shown ---------- */
  function applyConfig(cfg) {
    HW.config = cfg || { visible: {} };
    store('hw.config', JSON.stringify(HW.config));
    listeners.config.forEach(function (f) { f(HW.config); });
    gate();
  }
  function gate() { ready(gateNow); }
  function gateNow() {
    if (!project) return;
    var hidden = !HW.isVisible(project);
    var el = document.getElementById('hw-gate');
    if (hidden && isAdmin) { badge('Masqué pour les visiteurs'); return; }
    if (!hidden) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'hw-gate';
    el.innerHTML = '<div><p>Ce projet n’est pas présenté pour le moment.</p><a href="' + ROOT + '">Voir les autres projets</a></div>';
    document.body.appendChild(el);
  }
  HW.setConfig = function (cfg) {
    return dbReady.then(function (db) { return sign(cfg).then(function (d) { return docRef(db, 'config').set(d); }); }).then(function () { applyConfig(cfg); });
  };

  dbReady.then(function (db) {
    setStatus('connecting');
    docRef(db, 'config').onSnapshot(function (snap) {
      setStatus('synced');
      verify(snap.data()).then(function (cfg) { if (cfg) applyConfig(cfg); });
    }, function () { setStatus('error'); });
    docRef(db, 'live').onSnapshot(function (snap) { verify(snap.data()).then(onLive); }, function () {});
  }).catch(function () { setStatus('local'); });

  /* ---------- Live: presenter side ---------- */
  var state = null, seq = 0, timer = 0, lastSent = 0;
  function persoNow() {
    var o = {};
    for (var i = 0; i < html.attributes.length; i++) {
      var a = html.attributes[i];
      if (/^data-(palette|typo|scale|hero|media|motion|intro|filigrane|colibri|mascottes|v-[a-z-]+)$/.test(a.name)) o[a.name.slice(5)] = a.value;
    }
    return o;
  }
  function push(patch) {
    if (!broadcasting) return;
    state = Object.assign(state || { on: true }, patch, { on: true });
    var wait = Math.max(0, 300 - (Date.now() - lastSent));
    clearTimeout(timer);
    timer = setTimeout(function () {
      lastSent = Date.now();
      var snap = Object.assign({}, state, { t: Date.now() });
      dbReady.then(function (db) { return sign(snap).then(function (d) { return docRef(db, 'live').set(d); }); }).catch(function () {});
    }, wait);
  }
  HW.setBroadcast = function (on) {
    broadcasting = isAdmin && on;
    store('hw.broadcast', on ? '1' : null);
    if (on) push({ path: rel(), scroll: 0, perso: persoNow() });
    else dbReady.then(function (db) { return sign({ on: false, t: Date.now() }).then(function (d) { return docRef(db, 'live').set(d); }); }).catch(function () {});
    pill();
  };
  HW.isBroadcasting = function () { return broadcasting; };
  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
      parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }
  if (broadcasting) {
    var y0 = function () { var max = document.documentElement.scrollHeight - innerHeight; return max > 0 ? +(scrollY / max).toFixed(4) : 0; };
    addEventListener('load', function () { push({ path: rel(), scroll: y0(), perso: persoNow() }); });
    push({ path: rel(), scroll: y0(), perso: persoNow() });
    addEventListener('scroll', function () { push({ scroll: y0() }); }, { passive: true });
    new MutationObserver(function () { push({ perso: persoNow() }); }).observe(html, { attributes: true });
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('button, summary, [role="tab"], [data-mirror]');
      if (!el || el.closest('form, [data-no-mirror], [data-s="prod-perso"], #hw-pill')) return;
      push({ click: { sel: cssPath(el), n: ++seq + Date.now() } });
    }, true);
  }

  /* ---------- Live: visitor side ---------- */
  var following = store('hw.follow') !== '0';
  var lastClick = null;
  function onLive(s) {
    if (isAdmin) return;
    if (!s || !s.on || Date.now() - (s.t || 0) > 6 * 3600e3) { banner(false); return; }
    banner(true);
    if (!following) return;
    if (s.path != null && s.path !== rel()) { location.href = ROOT + s.path; return; }
    if (s.perso) {
      Object.keys(s.perso).forEach(function (k) { html.setAttribute('data-' + k, s.perso[k]); });
    }
    if (typeof s.scroll === 'number') {
      var max = document.documentElement.scrollHeight - innerHeight;
      scrollTo({ top: s.scroll * max, behavior: 'smooth' });
    }
    if (s.click) {
      if (lastClick === null) lastClick = s.click.n; // a click made before this page opened is not replayed
      else if (s.click.n !== lastClick) {
        lastClick = s.click.n;
        var el = document.querySelector(s.click.sel);
        if (el) el.click();
      }
    }
  }

  /* ---------- Small UI: visitor banner, presenter pill ---------- */
  var css = document.createElement('style');
  css.textContent = '#hw-banner,#hw-pill{position:fixed;z-index:2147483000;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 10px 8px 14px;border-radius:999px;background:#14181f;color:#fff;font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px -12px rgb(0 0 0/.5)}' +
    '#hw-banner[hidden],#hw-pill[hidden]{display:none}#hw-banner i,#hw-pill i{width:8px;height:8px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 0 0 rgb(255 77 77/.6);animation:hwp 1.6s infinite}' +
    '#hw-banner button,#hw-pill button,#hw-pill a{border:0;border-radius:999px;padding:6px 12px;background:rgb(255 255 255/.14);color:#fff;font:inherit;cursor:pointer;text-decoration:none}' +
    '#hw-pill{left:16px;transform:none}#hw-pill.off i{background:#8a919c;animation:none}' +
    '#hw-gate{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;background:rgb(246 244 240/.96);font:500 18px/1.5 system-ui,sans-serif;color:#14181f;text-align:center}#hw-gate a{display:inline-block;margin-top:12px;padding:10px 18px;border-radius:999px;background:#14181f;color:#fff;text-decoration:none}' +
    '#hw-back{position:fixed;z-index:2147482500;right:16px;bottom:16px;padding:9px 14px;border-radius:999px;background:rgb(20 24 31/.82);color:#fff;font:600 13px system-ui,sans-serif;text-decoration:none;backdrop-filter:blur(8px)}#hw-back:hover{background:#14181f}' +
    '#hw-badge{position:fixed;z-index:2147483000;top:12px;right:12px;padding:6px 12px;border-radius:999px;background:#ffb020;color:#14181f;font:600 12px system-ui,sans-serif}' +
    '@keyframes hwp{70%{box-shadow:0 0 0 8px rgb(255 77 77/0)}100%{box-shadow:0 0 0 0 rgb(255 77 77/0)}}@media (prefers-reduced-motion:reduce){#hw-banner i,#hw-pill i{animation:none}}';
  document.head.appendChild(css);
  function ready(f) { if (document.body) f(); else document.addEventListener('DOMContentLoaded', f); }
  function banner(on) {
    ready(function () {
      var b = document.getElementById('hw-banner');
      if (!b) {
        b = document.createElement('div'); b.id = 'hw-banner'; b.setAttribute('role', 'status');
        b.innerHTML = '<i></i><span></span><button type="button"></button>';
        b.querySelector('button').addEventListener('click', function () { following = !following; store('hw.follow', following ? '1' : '0'); banner(true); });
        document.body.appendChild(b);
      }
      b.hidden = !on;
      b.querySelector('span').textContent = following ? 'En direct avec Hani' : 'Hani présente en direct';
      b.querySelector('button').textContent = following ? 'Explorer librement' : 'Suivre';
    });
  }
  function pill() {
    if (!isAdmin) return;
    ready(function () {
      var p = document.getElementById('hw-pill');
      if (!p) {
        p = document.createElement('div'); p.id = 'hw-pill';
        p.innerHTML = '<i></i><span></span><button type="button"></button><a href="' + ROOT + 'admin.html">Admin</a>';
        p.querySelector('button').addEventListener('click', function () { HW.setBroadcast(!broadcasting); });
        document.body.appendChild(p);
      }
      p.classList.toggle('off', !broadcasting);
      p.querySelector('span').textContent = broadcasting ? 'Diffusion en direct' : 'Diffusion coupée';
      p.querySelector('button').textContent = broadcasting ? 'Couper' : 'Diffuser';
    });
  }
  function badge(t) { ready(function () { var b = document.getElementById('hw-badge'); if (!b) { b = document.createElement('div'); b.id = 'hw-badge'; document.body.appendChild(b); } b.textContent = t; }); }
  // Pages that have no way back of their own (the Qualyz site, Mandat) get a small link to the project list.
  if (html.hasAttribute('data-back')) ready(function () {
    var b = document.createElement('a'); b.id = 'hw-back'; b.href = ROOT; b.textContent = '← Tous les projets'; b.setAttribute('data-no-mirror', '');
    document.body.appendChild(b);
  });
  pill();
  gate();
  HW.PROJECTS = PROJECTS;
})();
