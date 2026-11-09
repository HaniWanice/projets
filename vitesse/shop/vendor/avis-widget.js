/* Faux widget d'avis tiers, pour la version naïve de la démo.
   Il imite ce que font certains scripts de marketing chargés dans <head> : s'exécuter
   de façon synchrone et occuper le fil principal pendant que le navigateur attend.
   Ici : une boucle de 150 ms, sans rien afficher. */
(function () {
  var t = Date.now();
  while (Date.now() - t < 150) {}
  window.avisWidget = { loaded: true };
})();
