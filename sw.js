/* Offline copy. Saves every file on the first visit. With a signal the newest
   files load; with no signal the saved files open. Change VERSION on each update. */
var VERSION = 'workout-20261030b';
var FILES = [
  './', 'index.html', 'styles.css?v=20261030b', 'content.js?v=20261030b', 'app.js?v=20261030b',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(r).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || caches.match('index.html'); });
    })
  );
});
