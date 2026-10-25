// Service worker: guarda la app en el teléfono para que funcione sin internet.
//
// - VERSION debe ser igual a la de js/version.js (dev/preparar-publicacion.py la copia).
//   El teléfono solo detecta una versión nueva si este archivo cambia,
//   por eso el número va escrito aquí y no en la dirección.
// - Si agregas un archivo nuevo a la app, súmalo a FILES.
//   (dev/revisar-sw.py avisa si falta alguno).

const VERSION = "1.0.24";
const CACHE = `show-up-${VERSION}`;
const FONT_CACHE = "show-up-fonts";

const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "css/theme.css",
  "css/app.css",
  "js/app.js",
  "js/backup.js",
  "js/chart.js",
  "js/data/care.js",
  "js/data/core-diy.js",
  "js/data/coverage.js",
  "js/data/catalog.js",
  "js/data/exercises-en.js",
  "js/data/exercises.js",
  "js/data/quotes-en.js",
  "js/data/quotes.js",
  "js/db.js",
  "js/deload.js",
  "js/export.js",
  "js/generator.js",
  "js/goals.js",
  "js/i18n.js",
  "js/i18n/en.js",
  "js/i18n/es.js",
  "js/progression.js",
  "js/period.js",
  "js/pwa.js",
  "js/quotes.js",
  "js/records.js",
  "js/screens/core.js",
  "js/screens/day.js",
  "js/screens/exercise-form.js",
  "js/screens/exercise.js",
  "js/screens/goals.js",
  "js/screens/history.js",
  "js/screens/home.js",
  "js/screens/library.js",
  "js/screens/period.js",
  "js/screens/profile.js",
  "js/screens/session.js",
  "js/screens/wizard.js",
  "js/stats.js",
  "js/store.js",
  "js/supersets.js",
  "js/theme.js",
  "js/ui.js",
  "js/units.js",
  "js/version.js",
];

// Instalar: descarga y guarda todos los archivos de esta versión.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: "reload" }))))
  );
});

// Activar: borra las versiones anteriores guardadas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("show-up-") && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// La app pide activar la versión nueva cuando tocas "Actualizar".
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Tipografía de Google Fonts: se guarda la primera vez que se carga con internet.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok || response.type === "opaque") cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Abrir la app (navegación): siempre la página guardada.
  if (request.mode === "navigate") {
    event.respondWith(caches.match("index.html", { cacheName: CACHE }).then((cached) => cached || fetch(request)));
    return;
  }

  // Resto de archivos: primero lo guardado; si no está, de internet (y se guarda).
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
    )
  );
});
