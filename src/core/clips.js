// User-supplied clips, stored in IndexedDB.
//
// Why IndexedDB and not chrome.storage.local: the latter only stores
// JSON-serialisable values, so a video would have to be base64'd — a third
// bigger, and decoded on every read. IndexedDB stores a Blob natively and hands
// one straight back to a <video> via an object URL.
//
// Both extension pages share one origin, so a clip added in Settings is
// immediately visible to the gate.
//
// Everything above the DB boundary is a pure function so test/clips.test.js can
// exercise it in Node, which has no IndexedDB.

const DB_NAME = "focus-gate-clips";
const DB_VERSION = 1;
// Metadata and bytes live in separate stores so listing clips in Settings does
// not have to read every video into memory just to show its name.
const META_STORE = "clips";
const BLOB_STORE = "blobs";

// Hard ceiling per clip. Not a storage limit — IndexedDB would take far more —
// but a clip is decoration on a screen that must appear instantly, and one this
// large is a mistake rather than a preference.
export const MAX_CLIP_BYTES = 40 * 1024 * 1024;

// Above this the file still works but is worth a word: the whole point is a
// short loop, and 10 MB is already a generous 30 seconds.
export const LARGE_CLIP_BYTES = 10 * 1024 * 1024;

// What a <video> in Chromium will actually play. Checked against the file's
// declared type before anything is stored, so an unplayable file is refused at
// the point the user can still do something about it.
//
// Matched against the type with its parameters stripped: a file off disk gets a
// bare type from the OS, but a Blob out of MediaRecorder carries its codecs
// ("video/webm;codecs=vp9,opus") and is just as playable.
const PLAYABLE = /^video\/(mp4|webm|ogg|quicktime|x-m4v)$/i;

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  // One decimal, but not a pointless one: the limit reads "40 MB", not "40.0 MB".
  const mb = (n / (1024 * 1024)).toFixed(1);
  return `${mb.endsWith(".0") ? mb.slice(0, -2) : mb} MB`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// `file` only needs { name, size, type }, so this is testable without a real
// File. Returns { ok } or { ok: false, reason }.
export function baseMimeType(type) {
  return String(type || "").split(";")[0].trim().toLowerCase();
}

export function validateClipFile(file) {
  if (!file) return { ok: false, reason: "No file." };
  if (!PLAYABLE.test(baseMimeType(file.type))) {
    return {
      ok: false,
      reason: file.type
        ? `${file.type} is not a video this browser can play. Use MP4 or WebM.`
        : "That file has no video type. Use MP4 or WebM.",
    };
  }
  if (!file.size) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_CLIP_BYTES) {
    const size = formatBytes(file.size);
    const limit = formatBytes(MAX_CLIP_BYTES);
    return {
      ok: false,
      // A file a hair over the line rounds to the same figure as the limit, and
      // "40 MB is over the 40 MB limit" tells the reader nothing.
      reason:
        size === limit
          ? `That is just over the ${limit} limit. Shorten it, or compress on upload.`
          : `${size} is over the ${limit} limit. Shorten it, or compress on upload.`,
    };
  }
  return { ok: true, large: file.size > LARGE_CLIP_BYTES };
}

// --- The database -----------------------------------------------------------

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((err) => {
    dbPromise = null; // let a later call retry
    throw err;
  });
  return dbPromise;
}

function tx(db, stores, mode) {
  const transaction = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return { transaction, done };
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listClips() {
  const db = await openDb();
  const { transaction } = tx(db, [META_STORE], "readonly");
  const all = await request(transaction.objectStore(META_STORE).getAll());
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export async function getClipBlob(id) {
  const db = await openDb();
  const { transaction } = tx(db, [BLOB_STORE], "readonly");
  return request(transaction.objectStore(BLOB_STORE).get(id));
}

export async function addClip(blob, meta) {
  const db = await openDb();
  const record = {
    id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: meta.name || "clip",
    size: blob.size,
    type: blob.type || meta.type || "video/mp4",
    durationSec: meta.durationSec || 0,
    width: meta.width || 0,
    height: meta.height || 0,
    addedAt: Date.now(),
  };
  const { transaction, done } = tx(db, [META_STORE, BLOB_STORE], "readwrite");
  transaction.objectStore(META_STORE).put(record);
  transaction.objectStore(BLOB_STORE).put(blob, record.id);
  await done;
  return record;
}

export async function deleteClip(id) {
  const db = await openDb();
  const { transaction, done } = tx(db, [META_STORE, BLOB_STORE], "readwrite");
  transaction.objectStore(META_STORE).delete(id);
  transaction.objectStore(BLOB_STORE).delete(id);
  await done;
}

// How much room there is. Reported by the browser for the whole origin, so it
// is an estimate and deliberately presented as one.
export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0 };
  } catch {
    return null;
  }
}

// --- Reading a file's own metadata ------------------------------------------

// Duration and dimensions come from the file itself rather than being trusted
// from anywhere else. Also doubles as a decode check: a file the browser cannot
// actually open rejects here rather than failing silently at the gate.
export function probeVideo(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const cleanup = () => URL.revokeObjectURL(url);
    video.addEventListener("loadedmetadata", () => {
      const info = {
        durationSec: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(info);
    });
    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("The browser could not decode that file."));
    });
    video.src = url;
  });
}
