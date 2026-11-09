/* Shop markup, shared by both versions: the build runs it once for the fast page (HTML written ahead of
   time), the slow page runs it in the visitor's browser after downloading its data. Same code, same result. */
(function (g) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var nb = ' ';
  var eur = function (n) { return n.toFixed(2).replace('.', ',') + nb + '€'; };
  var note = function (n) { return n.toFixed(1).replace('.', ','); };
  var thousands = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var discount = function (was, price) { return Math.round((1 - price / was) * 100); };
  var stars = function (v) { return '<span class="stars" role="img" aria-label="Note de ' + note(v) + ' sur 5" style="--v:' + (v / 5 * 100) + '%">★★★★★</span>'; };

  function card(S, p, ph) {
    var cat = S.categories.filter(function (c) { return c.id === p.cat; })[0].label;
    var badge = p.was ? '<span class="badge promo-badge">-' + discount(p.was, p.price) + ' %</span>' : p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '';
    return '<article class="card" data-cat="' + p.cat + '">' + badge +
      '<a class="card-img" href="#produits" tabindex="-1" aria-hidden="true">' + ph(p.photo, 'card') + '</a>' +
      '<div class="card-body"><p class="card-cat">' + esc(cat) + '</p><h3 class="card-name"><a href="#produits">' + esc(p.name) + '</a></h3>' +
      '<p class="rating">' + stars(p.rating) + '<span>' + note(p.rating) + ' (' + p.count + ')</span></p>' +
      '<p class="price"><b>' + eur(p.price) + '</b>' + (p.was ? '<s>' + eur(p.was) + '</s>' : '') + '</p>' +
      '<button class="btn sm" type="button">Ajouter au panier</button></div></article>';
  }

  // d = { site, cards, stats, reviews, tips } ; null parts render their loading placeholder.
  function page(d, ph) {
    var S = d.site;
    var h = '';
    h += '<div class="promo">' + esc(S.promo) + '</div>';
    h += '<header class="hdr"><div class="hdr-in wrap"><a class="logo" href="#">' + esc(S.brand.name) + '</a><nav class="nav" aria-label="Catégories">' +
      S.categories.map(function (c) { return '<a href="#produits">' + esc(c.label) + '</a>'; }).join('') + '</nav>' +
      '<button class="cart-btn" type="button" aria-label="Ouvrir le panier, 0 article">Panier <span class="count" aria-hidden="true">0</span></button></div></header>';
    h += '<main>';
    h += '<section class="hero" aria-labelledby="hero-title"><div class="hero-img">' + ph('hero-filtre', 'hero') + '</div><div class="hero-in wrap">' +
      '<p class="hero-eyebrow">' + esc(S.hero.eyebrow) + '</p><h1 id="hero-title">' + esc(S.hero.title) + '</h1><p class="lead">' + esc(S.hero.text) + '</p>' +
      '<div class="hero-cta"><a class="btn light" href="#produits">Voir la boutique</a><a class="btn line-light" href="#histoire">Notre histoire</a></div></div></section>';
    h += '<ul class="reassure wrap">' + S.reassurance.map(function (r) { return '<li><b>' + esc(r.title) + '</b>' + esc(r.text) + '</li>'; }).join('') + '</ul>';
    h += '<section class="tiles wrap" aria-label="Parcourir par catégorie">' + S.categories.map(function (c) {
      return '<a class="tile" href="#produits"><span class="ph">' + ph(c.photo, 'tile') + '</span><span class="tile-txt"><b>' + esc(c.label) + '</b><span>' + esc(c.text) + '</span></span></a>';
    }).join('') + '</section>';
    h += '<section class="sec wrap" id="produits" aria-labelledby="boutique-title"><div class="sec-head"><h2 id="boutique-title">La boutique</h2><p role="status">' +
      (d.stats ? thousands(d.stats.inStock) + ' références en stock, prix médian ' + eur(d.stats.median) : 'Chargement du catalogue…') + '</p></div>' +
      '<div class="tabs" role="tablist" aria-label="Filtrer les produits par catégorie"><button class="tab" role="tab" aria-selected="true">Tout</button>' +
      S.categories.map(function (c) { return '<button class="tab" role="tab" aria-selected="false">' + esc(c.label) + '</button>'; }).join('') + '</div>' +
      (d.cards ? '<div class="grid" id="grille">' + d.cards.map(function (p) { return card(S, p, ph); }).join('') + '</div>' : '<div class="grid wait" id="grille">Chargement des produits…</div>') + '</section>';
    h += '<section class="story wrap" id="histoire" aria-labelledby="histoire-title"><div class="story-img">' + ph('histoire-salle', 'story') + '</div><div><h2 id="histoire-title">' + esc(S.story.title) + '</h2>' +
      S.story.paragraphs.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
      '<ul class="points">' + S.story.points.map(function (p) { return '<li><b>' + esc(p.title) + '</b><span>' + esc(p.text) + '</span></li>'; }).join('') + '</ul></div></section>';
    h += '<section class="sec wrap" aria-labelledby="avis-title"><div class="sec-head"><h2 id="avis-title">Ce que disent nos clients</h2><span class="avis-badge">' + stars(S.reviewsTotal.rating) + ' ' + note(S.reviewsTotal.rating) + ' sur 5, ' + thousands(S.reviewsTotal.count) + ' avis vérifiés</span></div>' +
      (d.reviews ? '<div class="avis-grid">' + d.reviews.map(function (r) {
        return '<article class="avis">' + stars(r.rating) + '<h3>' + esc(r.title) + '</h3><p>' + esc(r.text) + '</p><footer><b>' + esc(r.author) + '</b>, ' + esc(r.city) + '. ' + esc(r.date) + (r.productName ? ', ' + esc(r.productName) : '') + '</footer></article>';
      }).join('') + '</div>' : '<p class="loading-line">Chargement des avis…</p>') + '</section>';
    h += '<section class="sec wrap" aria-labelledby="journal-title"><div class="sec-head"><h2 id="journal-title">Le journal</h2><p>Trois conseils de l’atelier</p></div>' +
      (d.tips ? '<div class="tips">' + d.tips.map(function (t) {
        return '<a class="tip" href="#journal"><div class="tip-img">' + ph(t.photo, 'tip') + '</div><h3>' + esc(t.title) + '</h3><p>' + esc(t.text) + '</p><small>' + t.minutes + ' min de lecture</small></a>';
      }).join('') + '</div>' : '<p class="loading-line">Chargement des articles…</p>') + '</section>';
    h += '<section class="news" aria-labelledby="news-title"><div class="news-in wrap"><div><h2 id="news-title">' + esc(S.newsletter.title) + '</h2><p>' + esc(S.newsletter.text) + '</p></div>' +
      '<form class="news-form" onsubmit="return false"><label class="sr" for="nl">Adresse e-mail</label><input id="nl" type="email" placeholder="votre@email.fr"><button class="btn" type="submit">S’inscrire</button></form></div></section>';
    h += '</main>';
    h += '<footer class="ftr"><div class="ftr-in wrap"><div><a class="logo" href="#">' + esc(S.brand.name) + '</a><p>' + esc(S.brand.tagline) + '.</p><p>Atelier et expédition à Lyon (69001)</p></div>' +
      S.footer.columns.map(function (c) { return '<nav aria-label="' + esc(c.title) + '"><h2>' + esc(c.title) + '</h2><ul>' + c.links.map(function (l) { return '<li><a href="#">' + esc(l) + '</a></li>'; }).join('') + '</ul></nav>'; }).join('') +
      '</div><div class="ftr-base wrap"><ul>' + S.footer.legal.map(function (l) { return '<li><a href="#">' + esc(l) + '</a></li>'; }).join('') + '</ul><span>Paiement : ' + S.footer.payments.join(', ') + '</span></div>' +
      '<p class="ftr-note wrap">' + esc(S.footer.note) + '</p></footer>';
    return h;
  }
  g.ShopRender = { page: page, esc: esc };
})(typeof window !== 'undefined' ? window : globalThis);
