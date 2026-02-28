/**
 * sw.js – SupplyChain-Direct Service Worker
 * Strategy: Cache-First for static assets, Network-First for API calls.
 * Background Sync: re-submits queued shortage reports when connectivity is restored.
 */

const CACHE_NAME = "scd-cache-v1";

// Static assets to pre-cache on install
const PRECACHE_URLS = [
    "/",
    "/login",
    "/static/css/variables.css",
    "/static/css/main.css",
    "/static/css/dashboard.css",
    "/static/js/auth.js",
    "/static/js/shop.js",
    "/static/js/admin.js",
    "/static/js/driver.js",
    "/static/manifest.json",
    "/static/images/icon-192.png",
    "/static/images/icon-512.png",
];

// ============================================================
// INSTALL – Pre-cache static assets
// ============================================================
self.addEventListener("install", (event) => {
    console.log("[SW] Installing…");
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ============================================================
// ACTIVATE – Clean old caches
// ============================================================
self.addEventListener("activate", (event) => {
    console.log("[SW] Activating…");
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

// ============================================================
// FETCH – Cache-First for static, Network-First for API
// ============================================================
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip cross-origin requests (CDN tiles, fonts, etc.)
    if (url.origin !== location.origin) return;

    // API calls → Network-first, fallback to cache
    if (url.pathname.startsWith("/api/")) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Static assets → Cache-first, fallback to network
    event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // Offline and not in cache — return a basic offline page
        return new Response("Offline", { status: 503, statusText: "Service Unavailable" });
    }
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        // Cache successful GET responses
        if (response.ok && request.method === "GET") {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
        });
    }
}

// ============================================================
// BACKGROUND SYNC – Replay queued shortage reports
// ============================================================
self.addEventListener("sync", (event) => {
    if (event.tag === "sync-reports") {
        console.log("[SW] Background Sync: replaying queued reports…");
        event.waitUntil(replayQueuedReports());
    }
});

async function replayQueuedReports() {
    return new Promise((resolve, reject) => {
        const openDB = indexedDB.open("scd-offline", 1);
        openDB.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("pending-reports")) {
                db.createObjectStore("pending-reports", { autoIncrement: true });
            }
        };
        openDB.onsuccess = async (e) => {
            const db = e.target.result;
            const tx = db.transaction("pending-reports", "readwrite");
            const store = tx.objectStore("pending-reports");
            const getAllReq = store.getAll();
            const getAllKeysReq = store.getAllKeys();

            getAllReq.onsuccess = async () => {
                const items = getAllReq.result;
                const keys = getAllKeysReq.result;

                for (let i = 0; i < items.length; i++) {
                    try {
                        const res = await fetch("/api/reports", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(items[i]),
                        });
                        if (res.ok) {
                            // Remove from IndexedDB after successful send
                            const delTx = db.transaction("pending-reports", "readwrite");
                            delTx.objectStore("pending-reports").delete(keys[i]);
                            console.log(`[SW] Synced report #${keys[i]}`);
                        }
                    } catch (err) {
                        console.warn("[SW] Sync failed for report:", err);
                    }
                }
                resolve();
            };
            getAllReq.onerror = () => reject(getAllReq.error);
        };
        openDB.onerror = () => reject(openDB.error);
    });
}
