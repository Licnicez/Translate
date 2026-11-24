import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { cache, cacheKey } from './cache.js';
import { getTranscript } from './transcript/index.js';
import { mergeSegments } from './merge.js';
import { translateChunk, translatorName } from './translate/index.js';

/**
 * One job per (video, lang): it extracts, merges and translates once, and any
 * number of streams (a reconnect, a second tab) read from it.
 * Chunk 0 goes first and alone so playback can start; the rest run in parallel.
 */
const jobs = new Map();

export function getJob(videoId, to) {
  const key = cacheKey(videoId, to, translatorName);
  let job = jobs.get(key);
  if (!job) {
    job = createJob(key, videoId, to);
    jobs.set(key, job);
    job.events.once('end', () => setTimeout(() => jobs.delete(key), 60_000));
  }
  return job;
}

function createJob(key, videoId, to) {
  const events = new EventEmitter();
  events.setMaxListeners(100);
  const job = { events, meta: null, chunks: [], done: false, error: null };

  const fail = (e) => {
    job.error = { code: e.code || 'translate_failed', message: e.message, retryable: e.retryable ?? true };
    events.emit('error-event', job.error);
    events.emit('end');
  };

  (async () => {
    const hit = await cache.get(key);
    if (hit) {
      job.meta = { ...hit.meta, cached: true };
      events.emit('meta', job.meta);
      hit.chunks.forEach((c, i) => { job.chunks[i] = c; events.emit('chunk', i); });
      job.done = true; events.emit('done'); events.emit('end');
      return;
    }

    const t = await getTranscript(videoId);
    const segs = mergeSegments(t.segments);
    // A short first chunk (about the first 30 s) so the video can start in a few seconds.
    const first = Math.min(8, config.chunkSize);
    const groups = [segs.slice(0, first)];
    for (let i = first; i < segs.length; i += config.chunkSize) groups.push(segs.slice(i, i + config.chunkSize));

    job.meta = {
      videoId, targetLang: to, sourceLang: t.lang, source: t.source,
      totalSegments: segs.length, totalChunks: groups.length,
      duration: segs.at(-1)?.end || 0, cached: false, translator: translatorName,
    };
    events.emit('meta', job.meta);

    const run = async (i) => {
      const context = i > 0 ? groups[i - 1].slice(-3).map((s) => s.original) : [];
      const r = await translateChunk(groups[i], to, context, { first: i === 0 });
      if (!job.meta.sourceLang && r.sourceLang) job.meta.sourceLang = r.sourceLang;
      if (r.fellBack) job.fellBack = true;
      job.chunks[i] = r.segments;
      events.emit('chunk', i);
    };

    await run(0);
    let next = 1;
    const worker = async () => { while (next < groups.length) await run(next++); };
    await Promise.all(Array.from({ length: Math.min(config.concurrency, groups.length - 1) }, worker));

    job.done = true;
    // A run that partly fell back to Google is served but not kept, so a later
    // request can get the full Gemini translation.
    if (!job.fellBack) await cache.set(key, { meta: job.meta, chunks: job.chunks });
    events.emit('done');
    events.emit('end');
  })().catch((e) => { console.error('[job]', videoId, to, e.message); jobs.delete(key); fail(e); });

  return job;
}

/** Finished result from the cache, or null. */
export async function cached(videoId, to) {
  return cache.get(cacheKey(videoId, to, translatorName));
}
