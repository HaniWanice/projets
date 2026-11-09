// Same aggregation as the fast version does once at build time; here it runs in every visitor's browser.
var collator=function(a,b){return a.localeCompare(b,"fr",{sensitivity:"base"})};
window.catalogStats=function catalogStats(rows              )               {
  // 1. Écarter les références épuisées et dédoublonner par nom normalisé
  //    (sans accents ni casse) et prix, comme le ferait un import de fournisseur.
  const seen = new Set        ();
  const live               = [];
  for (const r of rows) {
    if (r.stock <= 0) continue;
    const key = `${r.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${r.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    live.push(r);
  }

  // 2. Trier par prix, puis par nom pour départager les ex æquo.
  live.sort((a, b) => a.price - b.price || collator(a.name, b.name));

  // 3. Médiane et comptage par catégorie.
  const mid = live.length >> 1;
  const median = live.length % 2 ? live[mid].price : (live[mid - 1].price + live[mid].price) / 2;
  const byCat                        = { cafe: 0, the: 0, ceramique: 0, maison: 0 };
  for (const r of live) byCat[r.cat]++;

  return { inStock: live.length, median: Math.round(median * 100) / 100, total: rows.length, byCat };
};