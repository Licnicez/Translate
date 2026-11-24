/**
 * Fallback: Google Translate's free endpoint. Literal, weak on slang, no key needed.
 * It rate-limits (429) when hit hard, so requests share a small pool, back off on
 * 429/5xx, and a block whose line count comes back wrong is split in halves
 * rather than resent line by line (a 2-hour video stays at tens of requests).
 */
const MAX_PARALLEL = 2;
let active = 0;
const queue = [];
const slot = () => new Promise((resolve) => {
  if (active < MAX_PARALLEL) { active++; resolve(); } else queue.push(resolve);
});
const release = () => { const next = queue.shift(); if (next) next(); else active--; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Circuit breaker: once Google says "too many requests", stop asking for a while.
// Retrying through a block only extends it (it can last hours).
const PAUSE_MS = 15 * 60_000;
let pausedUntil = 0;
export const googlePaused = () => pausedUntil > Date.now();

async function gtx(text, to) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' + encodeURIComponent(to);
  for (let attempt = 0; ; attempt++) {
    if (googlePaused()) throw new Error('google translate paused after rate limiting');
    await slot();
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'q=' + encodeURIComponent(text),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      res = { ok: false, status: 0, error: e };
    } finally { release(); }

    if (res.ok) {
      const data = await res.json();
      return { text: data[0].map((p) => p[0]).join(''), from: data[2] || '' };
    }
    if (res.status === 429 || res.url?.includes('/sorry/')) {
      if (!googlePaused()) console.warn(`[google] rate limited; pausing Google for ${PAUSE_MS / 60000} min`);
      pausedUntil = Date.now() + PAUSE_MS;
      throw new Error('google translate 429');
    }
    const retryable = res.status === 0 || res.status >= 500;
    if (!retryable || attempt >= 4) throw new Error('google translate ' + (res.status || res.error?.message));
    await sleep(1500 * 2 ** attempt + Math.random() * 500); // 1.5 s, 3 s, 6 s, 12 s
  }
}

async function translateBlock(lines, to) {
  const r = await gtx(lines.join('\n'), to);
  const parts = r.text.split('\n');
  if (parts.length === lines.length) return { lines: parts.map((p) => p.trim()), sourceLang: r.from };
  if (lines.length === 1) return { lines: [r.text.replace(/\n+/g, ' ').trim()], sourceLang: r.from };
  const mid = lines.length >> 1;
  const a = await translateBlock(lines.slice(0, mid), to);
  const b = await translateBlock(lines.slice(mid), to);
  return { lines: [...a.lines, ...b.lines], sourceLang: r.from || a.sourceLang };
}

export const google = {
  name: 'google-free',
  /** lines: string[] → { lines: string[], sourceLang } */
  translate: (lines, to) => translateBlock(lines, to),
};
