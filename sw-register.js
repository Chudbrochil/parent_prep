// Register the service worker so the app works offline and installs nicely.
// Kept in its own file (not inline) so the CSP can block inline scripts.
//
// Use an absolute path so registration works correctly even when the page
// was loaded from a rewritten URL like /s/sunny-elmo-park (otherwise the
// browser would try to register /s/sw.js which doesn't exist).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      // Silent failure — offline support is nice-to-have, not required
    });
  });
}
