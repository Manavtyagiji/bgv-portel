// src/utils/idbCache.js
// Async get/set for large record sets in IndexedDB.
// localStorage caps at ~5 MB and silently fails on 12k-record payloads;
// IndexedDB has no practical size limit and is the right tool for caching
// the full clientsData object between sessions.

const DB_NAME    = "bgv_cache_db";
const DB_STORE   = "cache";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "k" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function idbGet(key) {
  try {
    const db  = await openDB();
    const tx  = db.transaction(DB_STORE, "readonly");
    const st  = tx.objectStore(DB_STORE);
    const req = st.get(key);
    const rec = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    db.close();
    return rec?.v ?? null;
  } catch (e) {
    console.warn("idbGet failed:", e?.message);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   WRITE WORKER
   idbSet() used to run indexedDB.put() directly on the main thread. Browsers
   internally structured-clone + serialize the payload before it can be
   written to disk, and for a large clientsData object (thousands of records)
   that clone/serialize step is synchronous and can block the main thread for
   several seconds — long enough to trigger the browser's "Page Unresponsive"
   watchdog. Moving the actual write into a dedicated Worker means that cost
   happens on a background thread instead, so the tab never freezes no matter
   how large the dataset grows.

   Same inline-Blob worker pattern already used for search filtering in
   MyTable.jsx — no new dependency, no separate file, no Vite worker config.
════════════════════════════════════════════════════════════════════════════ */
const CACHE_WORKER_SRC = `
const DB_NAME    = "bgv_cache_db";
const DB_STORE   = "cache";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "k" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

self.onmessage = async (e) => {
  const { type, key, value } = e.data || {};
  if (type !== "SET") return;
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    const st = tx.objectStore(DB_STORE);
    st.put({ k: key, v: value });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("idbSet (worker) failed:", err && err.message);
  }
};
`;

let cacheWorker = null;
let cacheWorkerFailed = false;

function getCacheWorker() {
  if (cacheWorker || cacheWorkerFailed) return cacheWorker;
  if (typeof Worker === "undefined") { cacheWorkerFailed = true; return null; }
  try {
    const blob = new Blob([CACHE_WORKER_SRC], { type: "application/javascript" });
    const url  = URL.createObjectURL(blob);
    cacheWorker = new Worker(url);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn("idbSet worker unavailable, falling back to main-thread write:", e?.message);
    cacheWorkerFailed = true;
    cacheWorker = null;
  }
  return cacheWorker;
}

export async function idbSet(key, value) {
  const worker = getCacheWorker();

  if (worker) {
    try {
      worker.postMessage({ type: "SET", key, value });
      return;
    } catch (e) {
      // postMessage can throw if value isn't structured-cloneable in a way
      // the worker path expects — fall through to the direct write below.
      console.warn("idbSet postMessage failed, falling back to main-thread write:", e?.message);
    }
  }

  // Fallback: no Worker support (or it failed to start) — write directly,
  // exactly as before.
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    const st = tx.objectStore(DB_STORE);
    st.put({ k: key, v: value });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("idbSet failed:", e?.message);
  }
}
