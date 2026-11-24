import { config } from '../config.js';
import { gemini } from './gemini.js';
import { google } from './google.js';

const primary = config.geminiKey ? gemini() : null;

export const translatorName = primary ? primary.name : google.name;

const retry = async (fn, tries = 2) => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i + 1 >= tries) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
};

/**
 * Translate one chunk of segments. Timestamps never leave the server; the answer
 * is joined back by index, and any line the model skipped is filled by the fallback.
 * Returns { segments, sourceLang }.
 */
export async function translateChunk(segments, to, context, { first = false } = {}) {
  let map = new Map();
  let sourceLang = '';

  // No retry here: a slow or busy Gemini hands the chunk to the fallback instead of
  // holding playback. The first chunk gets a short deadline so the video starts quickly.
  if (primary) {
    try { map = await primary.translate(segments, to, context, { timeoutMs: first ? 8_000 : 30_000 }); }
    catch (e) { console.warn('[translate] gemini failed, using fallback:', e.name === 'TimeoutError' ? 'timed out' : e.message.slice(0, 120)); }
  }

  const missing = segments.filter((s) => !map.has(s.index));
  const untranslated = new Set();
  if (missing.length) {
    try {
      const r = await retry(() => google.translate(missing.map((s) => s.original), to));
      sourceLang = r.sourceLang;
      missing.forEach((s, i) => map.set(s.index, r.lines[i] || s.original));
    } catch (e) {
      // Both translators down for this chunk: show the original lines rather than
      // failing the whole video. The run is marked so it is not cached.
      console.warn('[translate] fallback failed too, keeping the original lines:', e.message);
      missing.forEach((s) => untranslated.add(s.index));
    }
  }

  return {
    sourceLang,
    fellBack: (!!primary && missing.length > 0) || untranslated.size > 0,
    // `untranslated` lines carry the original text; clients show it once and never store the chunk.
    segments: segments.map((s) => (untranslated.has(s.index)
      ? { ...s, translated: s.original, untranslated: true }
      : { ...s, translated: map.get(s.index) })),
  };
}
