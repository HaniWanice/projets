/* SLOW VERSION, on purpose. Each mistake below is common on real shops:
   1. Everything is built in the browser: the server sends an empty page.
   2. Data arrives in a CASCADE: the catalogue, THEN the reviews, THEN the articles; each waits for the previous one.
   3. The whole catalogue (8 000 rows) is downloaded to show 16 products, and the "N items, median price" line
      is recomputed in every visitor's browser.
   4. Original 2000 px photos, no dimensions, no lazy loading.
   5. Fonts behind a chain of three stylesheets, and a third-party script that blocks the page (see lente.html).
   The ?r= parameter defeats the cache so every run is a first visit. */
(function () {
  var run = new URLSearchParams(location.search).get('r') || String(Date.now());
  var app = document.getElementById('app');
  var load = function (src) { return new Promise(function (ok) { var s = document.createElement('script'); s.src = src + '?r=' + run; s.onload = s.onerror = ok; document.body.appendChild(s); }); };
  var ph = function (key, kind) { return '<img src="img/orig/' + key + '.jpg?r=' + run + '" alt="' + (kind === 'tile' ? '' : ShopRender.esc(SITE.photoAlt[key])) + '">'; };
  var d = { site: SITE, cards: null, stats: null, reviews: null, tips: null };
  var draw = function () { app.innerHTML = ShopRender.page(d, ph); };
  draw();
  load('data/catalog.js').then(function () {
    d.stats = catalogStats(window.CATALOG);
    d.cards = window.CATALOG.filter(function (r) { return r.featured; }).map(function (r) { return r.featured; });
    draw();
    return load('data/reviews.js');
  }).then(function () {
    d.reviews = window.REVIEWS; draw();
    return load('data/tips.js');
  }).then(function () {
    d.tips = window.TIPS; draw();
    var h = app.querySelector('.hero-img img');
    return h.complete ? null : new Promise(function (r) { h.onload = h.onerror = r; });
  }).then(function () { requestAnimationFrame(function () { requestAnimationFrame(function () { performance.mark('contenu-pret'); }); }); });
})();
