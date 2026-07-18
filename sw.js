"use strict";

const SCOPE_KEY = new URL(self.registration.scope).pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "root";
const LEGACY_SCOPED_CACHE_PATTERN = new RegExp(`^budget-minus-${SCOPE_KEY}-v\\d+$`);
const CACHE_PREFIX = `budget-minus-${SCOPE_KEY}--`;
const CACHE_VERSION = `${CACHE_PREFIX}v18`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=18",
  "./app.js?v=18",
  "./db.js?v=18",
  "./manifest.webmanifest?v=18",
  "./icons/icon.svg?v=18"
];

function scopedUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL.map(scopedUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_VERSION && (key.startsWith(CACHE_PREFIX) || LEGACY_SCOPED_CACHE_PATTERN.test(key)))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const fallback = await cache.match(scopedUrl("./index.html"));
    if (fallback) return fallback;
    throw error;
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.status === 200 && response.type !== "opaque") {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  event.respondWith(handleAsset(event.request));
});
