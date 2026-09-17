/* sw.js — service worker de la app instalable (PWA), 15 sep 2026.
   Cachea SOLO la aplicación (páginas, JS, CSS, logo, iconos). NUNCA el
   contenido protegido ni nada de Supabase/Vercel API (decisión de Diego:
   el contenido se sirve siempre en línea, con sesión). HTML: red primero
   con respaldo en caché; estáticos: caché primero con actualización en
   segundo plano. Sin conexión y sin caché → página offline mínima. */
var VERSION = 'paideia-app-v2';
var SHELL = ['/panel.html', '/crm-shell.js', '/crm-shell.css', '/auth.js', '/flow-status.js', '/protect.js', '/contenido.js', '/visor-diapositivas.js', '/visor-diapositivas.css',
             '/Logos/Logo%20Paideia%20Tech%20-%20trimmed.png', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.json'];

self.addEventListener('install', function (ev) {
    ev.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL).catch(function () { /* algún recurso faltante no impide instalar */ }); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (ev) {
    ev.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});

function esMismoOrigen(url) { return url.origin === self.location.origin; }
function esProtegido(url) {
    return !esMismoOrigen(url) || url.pathname.indexOf('/api/') === 0;
}

self.addEventListener('fetch', function (ev) {
    var req = ev.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (esProtegido(url)) return; /* Supabase, APIs, CDNs: nunca se cachean aquí */
    var esHtml = req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname === '/';
    if (esHtml) {
        ev.respondWith(fetch(req).then(function (res) {
            var copia = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); return res;
        }).catch(function () {
            return caches.match(req).then(function (hit) {
                return hit || new Response('<!DOCTYPE html><html lang="es"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="font-family:sans-serif;background:#f4f6fb;color:#0f1428;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px"><div><h1>Sin conexión</h1><p>Tu material y tu progreso se cargan en línea. Revisa tu internet e intenta de nuevo.</p><button onclick="location.reload()" style="padding:12px 20px;border:0;border-radius:10px;background:#0070e0;color:#fff;font-weight:700">Reintentar</button></div></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            });
        }));
        return;
    }
    ev.respondWith(caches.match(req).then(function (hit) {
        var red = fetch(req).then(function (res) {
            if (res && res.ok) { var copia = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); }
            return res;
        }).catch(function () { return hit; });
        return hit || red;
    }));
});
