// =====================================
// SERVICE WORKER FINAL
// =====================================

const CACHE_NAME = "abbq-stock-v9";

const urlsToCache = [

    "./",

    "./index.html",
    "./input.html",
    "./history.html",
    "./detail_history.html",

    "./style.css",

    "./app.js",
    "./input.js",
    "./history.js",
    "./detail_history.js",
    "./export.js",

    "./manifest.json",

    "./abbq_logo.png",

    "./libraries/xlsx.full.min.js",

    "./database/daily_frontliner.json",
    "./database/daily_kitchen.json",
    "./database/wm_frontliner.json",
    "./database/wm_kitchen.json"

];

// ===========================
// INSTALL
// ===========================

self.addEventListener("install", event => {

    self.skipWaiting();

    event.waitUntil(

        caches.open(CACHE_NAME)

            .then(cache => {

                return cache.addAll(urlsToCache);

            })

    );

});

// ===========================
// ACTIVATE
// ===========================

self.addEventListener("activate", event => {

    event.waitUntil(

        caches.keys()

            .then(keys => {

                return Promise.all(

                    keys.map(key => {

                        if (key !== CACHE_NAME) {

                            return caches.delete(key);

                        }

                    })

                );

            })

    );

    self.clients.claim();

});

// ===========================
// FETCH
// ===========================

self.addEventListener("fetch", event => {

    event.respondWith(

        caches.match(event.request)

            .then(response => {

                return response || fetch(event.request);

            })

    );

});
