const CACHE_NAME = 'prayer-app-cache-v5'; // Increment cache version for manifest changes
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json', // Ensure manifest is cached
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/data/outcome.json', 
    '/sounds/bell.mp3' // Cache the prayer prompts
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});