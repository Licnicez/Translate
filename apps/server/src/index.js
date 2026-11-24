import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { config } from './config.js';
import { videoId } from './videoId.js';
import { getJob, cached } from './jobs.js';
import { translatorName } from './translate/index.js';

const app = new Hono();

const lang = (v) => (String(v || 'en').replace(/[^\w-]/g, '').slice(0, 8) || 'en');

app.get('/api/health', (c) => c.json({ ok: true, translator: translatorName }));

app.get('/api/transcript', async (c) => {
  const id = videoId(c.req.query('v'));
  if (!id) return c.json({ code: 'bad_url', message: 'That does not look like a YouTube link.' }, 400);
  const hit = await cached(id, lang(c.req.query('to')));
  if (!hit) return c.json({ code: 'not_cached' }, 404);
  return c.json({ ...hit.meta, cached: true, segments: hit.chunks.flat() });
});

app.get('/api/stream', (c) => {
  const id = videoId(c.req.query('v'));
  const to = lang(c.req.query('to'));
  const lastId = Number(c.req.header('last-event-id'));
  let next = Math.max(Number(c.req.query('from')) || 0, Number.isFinite(lastId) ? lastId + 1 : 0);

  return streamSSE(c, async (stream) => {
    const send = (event, data, id) => stream.writeSSE({ event, data: JSON.stringify(data), ...(id !== undefined && { id: String(id) }) });

    if (!id) { await send('error', { code: 'bad_url', message: 'That does not look like a YouTube link.', retryable: false }); return; }

    const job = getJob(id, to);
    let wake = () => {};
    const poke = () => wake();
    job.events.on('meta', poke); job.events.on('chunk', poke); job.events.on('end', poke);
    let closed = false;
    stream.onAbort(() => { closed = true; poke(); });
    const ping = setInterval(() => { stream.write(': ping\n\n').catch(() => {}); }, 15_000);

    try {
      let metaSent = false;
      while (!closed) {
        if (job.error) { await send('error', job.error); break; }
        if (!metaSent && job.meta) { await send('meta', job.meta); metaSent = true; }
        while (metaSent && job.chunks[next]) { await send('chunk', { chunk: next, segments: job.chunks[next] }, next); next++; }
        if (metaSent && job.done && next >= job.meta.totalChunks) { await send('done', { totalSegments: job.meta.totalSegments }); break; }
        await new Promise((r) => { wake = r; });
      }
    } finally {
      clearInterval(ping);
      job.events.off('meta', poke); job.events.off('chunk', poke); job.events.off('end', poke);
    }
  });
});

// The built PWA (npm run build). In dev, Vite serves it and proxies /api here.
app.use('/*', serveStatic({ root: '../web/dist' }));
app.get('*', serveStatic({ path: '../web/dist/index.html' }));

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`clipvoice api on http://localhost:${port} · translator: ${translatorName}`);
});
