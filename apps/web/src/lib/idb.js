/**
 * IndexedDB: subtitles by (video, lang) and watch history.
 * Every call fails soft: private windows and blocked storage just skip caching.
 */
const DB = 'clipvoice', VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('subs')) db.createObjectStore('subs');
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(() => null);
  return dbp;
}

async function tx(store, mode, fn) {
  try {
    const db = await open();
    if (!db) return undefined;
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r?.result);
      t.onerror = () => reject(t.error);
    });
  } catch { return undefined; }
}

const subKey = (id, lang) => `${id}:${lang}`;

// v2: earlier saves could hold lines that were never translated (both translators
// down), so they are left behind and fetched again.
const SUBS_VERSION = 'v2:';

/** { meta, chunks: Segment[][] } or undefined */
export const getSubs = (id, lang) => tx('subs', 'readonly', (s) => s.get(SUBS_VERSION + subKey(id, lang)));

/** Saves only fully translated chunks; a chunk with untranslated lines is fetched again next time. */
export const putSubs = (id, lang, value) => tx('subs', 'readwrite', (s) => s.put({
  ...value,
  chunks: (value.chunks || []).map((c) => (c && !c.some((seg) => seg.untranslated) ? c : null)),
}, SUBS_VERSION + subKey(id, lang)));

export const addHistory = (entry) => tx('history', 'readwrite', (s) => s.put({ ...entry, key: subKey(entry.videoId, entry.lang), at: Date.now() }));
export async function listHistory(limit = 12) {
  const all = (await tx('history', 'readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => b.at - a.at).slice(0, limit);
}
export const removeHistory = (key) => tx('history', 'readwrite', (s) => s.delete(key));
