// Builds the two versions of the demo shop for the speed lab, from the portfolio's data and photos.
// Run: node vitesse/_build/build.mjs   (needs sharp in %TEMP%\qtools, and the portfolio repo next door)
// Same markup for both (render.js is shared by this build and by the slow page in the browser):
// the only differences are the ones a performance job makes.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import vm from 'node:vm';
import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const SHOP = path.join(OUT, 'shop');
const PF = path.resolve(OUT, '../../site portfolio/portfolio1');
const sharp = createRequire(path.join(process.env.QTOOLS || path.join(os.tmpdir(), 'qtools'), 'package.json'))('sharp');

// 1. Export the shop data from the portfolio's TypeScript (Node strips the types itself).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shopdata-'));
for (const f of ['site', 'products', 'catalog', 'stats', 'types']) {
  const src = fs.readFileSync(path.join(PF, 'src/lib/demo', f + '.ts'), 'utf8').replace(/from "\.\/(\w+)"/g, 'from "./$1.ts"');
  fs.writeFileSync(path.join(tmp, f + '.ts'), src);
}
fs.writeFileSync(path.join(tmp, 'export.ts'), `import * as site from './site.ts'; import { cards, homeReviews, tips } from './products.ts';
import { catalog } from './catalog.ts'; import { catalogStats } from './stats.ts'; import fs from 'node:fs';
const all = catalog();
fs.writeFileSync(process.argv[2], JSON.stringify({ site: { brand: site.brand, promo: site.promo, categories: site.categories, hero: site.hero, reassurance: site.reassurance,
  story: site.story, newsletter: site.newsletter, footer: site.footer, reviewsTotal: site.reviewsTotal, photoAlt: site.photoAlt },
  cards, reviews: homeReviews(), tips, catalog: all, stats: catalogStats(all), statsSrc: catalogStats.toString() }));`);
const dataFile = path.join(tmp, 'data.json');
execFileSync(process.execPath, [path.join(tmp, 'export.ts'), dataFile], { stdio: 'inherit' });
const D = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
fs.rmSync(tmp, { recursive: true });

fs.rmSync(SHOP, { recursive: true, force: true });
for (const d of ['img/orig', 'img/opt', 'fonts', 'data', 'vendor']) fs.mkdirSync(path.join(SHOP, d), { recursive: true });

// 2. Assets: original photos (slow), resized WebP (fast), fonts, the blocking widget, the shop CSS.
const used = [...new Set(['hero-filtre', 'histoire-salle', ...D.site.categories.map((c) => c.photo), ...D.cards.map((c) => c.photo), ...D.tips.map((t) => t.photo)])];
const SIZES = { hero: 1600, tile: 560, card: 560, story: 960, tip: 720 };
const dims = {};
for (const k of used) {
  const src = path.join(PF, 'public/demo/shop', k + '.jpg');
  fs.copyFileSync(src, path.join(SHOP, 'img/orig', k + '.jpg'));
  for (const [kind, w] of Object.entries(SIZES)) {
    const out = path.join(SHOP, 'img/opt', `${k}-${kind}.webp`);
    const info = await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: 70 }).toFile(out);
    dims[`${k}-${kind}`] = [info.width, info.height];
  }
}
for (const f of fs.readdirSync(path.join(PF, 'public/demo/fonts'))) {
  let s = fs.readFileSync(path.join(PF, 'public/demo/fonts', f));
  if (f.endsWith('.css')) s = Buffer.from(s.toString().replaceAll('/demo/fonts/', ''));
  fs.writeFileSync(path.join(SHOP, 'fonts', f), s);
}
fs.copyFileSync(path.join(PF, 'public/demo/vendor/avis-widget.js'), path.join(SHOP, 'vendor/avis-widget.js'));
fs.copyFileSync(path.join(PF, 'src/app/(demo)/demo.css'), path.join(SHOP, 'shop.css'));

// 3. Data files for the slow page: the WHOLE catalogue (8 000 rows) although 16 are shown.
const js = (name, v) => fs.writeFileSync(path.join(SHOP, 'data', name), `window.${name.split('.')[0].toUpperCase()}=${JSON.stringify(v)};`);
js('catalog.js', D.catalog); js('reviews.js', D.reviews); js('tips.js', D.tips);
fs.writeFileSync(path.join(SHOP, 'stats.js'), `// Same aggregation as the fast version does once at build time; here it runs in every visitor's browser.\nvar collator=function(a,b){return a.localeCompare(b,"fr",{sensitivity:"base"})};
window.catalogStats=${D.statsSrc};`);
fs.writeFileSync(path.join(SHOP, 'site.js'), `window.SITE=${JSON.stringify(D.site)};`);

// 4. Pages.
const render = fs.readFileSync(path.join(HERE, 'render.js'), 'utf8');
fs.writeFileSync(path.join(SHOP, 'render.js'), render);
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(render, ctx);
const R = ctx.window.ShopRender;
const probe = fs.readFileSync(path.join(HERE, 'probe.js'), 'utf8');

const optPh = (key, kind) => {
  const k = SIZES[kind] ? kind : 'card'; const [w, h] = dims[`${key}-${k}`];
  const hero = kind === 'hero';
  return `<img src="img/opt/${key}-${k}.webp" width="${w}" height="${h}" alt="${kind === 'tile' ? '' : R.esc(D.site.photoAlt[key])}" decoding="async"${hero ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
};
const fastBody = R.page({ site: D.site, cards: D.cards, stats: D.stats, reviews: D.reviews, tips: D.tips }, optPh);
const fontsFast = `@font-face{font-family:"Gambarino";src:url(fonts/gambarino.woff2) format("woff2");font-display:swap}
@font-face{font-family:"General Sans";src:url(fonts/general-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"General Sans";src:url(fonts/general-600.woff2) format("woff2");font-weight:600;font-display:swap}`;
fs.writeFileSync(path.join(SHOP, 'rapide.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maison Brume (version rapide)</title>
<link rel="preload" href="img/opt/hero-filtre-hero.webp" as="image" fetchpriority="high">
<link rel="preload" href="fonts/general-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/gambarino.woff2" as="font" type="font/woff2" crossorigin>
<style>${fontsFast}</style><link rel="stylesheet" href="shop.css">
<script>window.KIND="rapide";${probe}</script></head>
<body><div class="shell">${fastBody}</div>
<script>(function(){var h=document.querySelector('.hero-img img');(h.complete?Promise.resolve():new Promise(function(r){h.onload=h.onerror=r})).then(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){performance.mark('contenu-pret')})})})})()</script>
</body></html>`);

fs.writeFileSync(path.join(SHOP, 'lente.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maison Brume (version lente)</title>
<script>window.KIND="lente";${probe}</script>
<link rel="stylesheet" href="shop.css">
<link rel="stylesheet" href="fonts/naive-1.css">
<script src="vendor/avis-widget.js"></script>
</head>
<body><div class="shell" id="app"><p style="padding:40px">Chargement…</p></div>
<script src="site.js"></script><script src="render.js"></script><script src="stats.js"></script>
<script src="lente.js"></script>
</body></html>`);
fs.copyFileSync(path.join(HERE, 'lente.js'), path.join(SHOP, 'lente.js'));

// 5. What each page downloads in total (file:// cannot report sizes, so it is computed here).
const size = (rel) => fs.statSync(path.join(SHOP, rel)).size;
const slowFiles = ['lente.html', 'shop.css', 'fonts/naive-1.css', 'fonts/naive-2.css', 'fonts/naive-3.css', 'vendor/avis-widget.js', 'site.js', 'render.js', 'stats.js', 'lente.js', 'data/catalog.js', 'data/reviews.js', 'data/tips.js',
  ...fs.readdirSync(path.join(SHOP, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => 'fonts/' + f), ...used.map((k) => `img/orig/${k}.jpg`)];
const fastImgs = [...new Set([...fastBody.matchAll(/img\/opt\/[\w-]+\.webp/g)].map((m) => m[0]))];
const fastFiles = ['rapide.html', 'shop.css', 'fonts/general-400.woff2', 'fonts/general-600.woff2', 'fonts/gambarino.woff2', ...fastImgs];
const sum = (l) => l.reduce((s, f) => s + size(f), 0);
fs.writeFileSync(path.join(OUT, 'manifest.js'), `window.MANIFEST=${JSON.stringify({ lente: { bytes: sum(slowFiles), requests: slowFiles.length }, rapide: { bytes: sum(fastFiles), requests: fastFiles.length }, rows: D.catalog.length, shown: D.cards.length })};`);
console.log('lente', (sum(slowFiles) / 1e6).toFixed(2), 'Mo /', slowFiles.length, 'fichiers ; rapide', (sum(fastFiles) / 1e6).toFixed(2), 'Mo /', fastFiles.length, 'fichiers');

// 6. Keep only the resized photos the fast page actually uses.
for (const f of fs.readdirSync(path.join(SHOP, 'img/opt'))) if (!fastImgs.includes('img/opt/' + f)) fs.rmSync(path.join(SHOP, 'img/opt', f));
