
const CACHE='abbq-v2';
const FILES=['./','./index.html','./app.js','./manifest.json','./abbq_logo.png'];

self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));
});

self.addEventListener('fetch',e=>{
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
