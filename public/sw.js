const SHELL_CACHE = "tc-shell-v61";
const ASSET_CACHE = "tc-assets-v61";
const THUMB_CACHE = "tc-thumbnails-v2";
const LIST_IMAGE_CACHE = "tc-list-images-v2";
const DETAIL_IMAGE_CACHE = "tc-detail-images-v2";
const SHELL_URLS = ["/catalogo-tecnico", "/offline", "/manifest.webmanifest", "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(SHELL_URLS);
  try {
    const response = await fetch("/catalogo-tecnico");
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((url) => url.startsWith("/assets/") || url.startsWith("/_next/"));
    const assetCache = await caches.open(ASSET_CACHE);
    await Promise.all([...new Set(assets)].map(async (url) => {
      try { const asset = await fetch(url); if (asset.ok) await assetCache.put(url, asset); } catch {}
    }));
  } catch {}
}

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tc-") && ![SHELL_CACHE, ASSET_CACHE, THUMB_CACHE, LIST_IMAGE_CACHE, DETAIL_IMAGE_CACHE].includes(key)).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CACHE_CATALOG_THUMBNAILS" && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheThumbnails(event.data.urls));
  }
});

async function cacheThumbnails(urls) {
  const cache = await caches.open(THUMB_CACHE);
  const missing = [];
  for (const url of urls) if (!(await cache.match(url))) missing.push(url);
  for (let index = 0; index < missing.length; index += 24) {
    await Promise.all(missing.slice(index, index + 24).map(async (url) => {
      try { const response = await fetch(url); if (response.ok) await cache.put(url, response); } catch {}
    }));
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/catalog-thumbnails/")) {
    event.respondWith(caches.open(THUMB_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  if (url.pathname.startsWith("/catalog-list-images/")) {
    event.respondWith(caches.open(LIST_IMAGE_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    }));
    return;
  }

  if (url.pathname.startsWith("/catalog-detail-images/")) {
    event.respondWith(caches.open(DETAIL_IMAGE_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }));
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (url.pathname.startsWith("/catalogo-tecnico") || url.pathname === "/offline") {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        if (url.pathname.startsWith("/catalogo-tecnico")) return (await cache.match("/catalogo-tecnico")) || (await cache.match("/offline"));
        return (await cache.match("/offline")) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/_next/") || /\.(?:css|js|woff2?|png|svg|webp)$/.test(url.pathname)) {
    event.respondWith(caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); return response; }).catch(() => cached);
      return cached || network;
    }));
  }
});
