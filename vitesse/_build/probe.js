/* Measurement probe, inlined in both shop pages. Native browser APIs only (PerformanceObserver), no library.
   Sends to the parent page: time until all the content is there, first paint, largest paint, main-thread blocking. */
(function () {
  var m = { kind: window.KIND, fcp: null, lcp: null, tbt: 0, ready: null };
  var watch = function (type, cb) { try { new PerformanceObserver(function (l) { l.getEntries().forEach(cb); }).observe({ type: type, buffered: true }); } catch (e) {} };
  var send = function (final) { try { parent.postMessage({ source: 'vitesse', final: final, m: m }, '*'); } catch (e) {} };
  watch('paint', function (e) { if (e.name === 'first-contentful-paint') m.fcp = e.startTime; });
  watch('largest-contentful-paint', function (e) { m.lcp = e.startTime; });
  watch('longtask', function (e) { m.tbt += Math.max(0, e.duration - 50); });
  watch('mark', function (e) {
    if (e.name !== 'contenu-pret' || m.ready) return;
    m.ready = e.startTime; send(false);
    setTimeout(function () { send(true); }, 1200); // let late long tasks land in the blocking total
  });
})();
