// Register the service worker so the app works offline and installs nicely.
// Kept in its own file (not inline) so the CSP can block inline scripts.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {
      // Silent failure — offline support is nice-to-have, not required
    });
  });
}
