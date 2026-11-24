import { apiUrl, API_HEADERS } from './api.js';

/**
 * Open the translation stream for (video, lang), resuming after `have` chunks.
 * Reads Server-Sent Events with fetch rather than EventSource, because tunnels such
 * as ngrok's free plan need a request header EventSource cannot send.
 * Reconnects with backoff on a dropped connection, always asking only for the
 * chunks it does not have yet. Returns a function that closes it.
 */
export function openStream({ video, lang, have = 0, onMeta, onChunk, onDone, onError, onStatus }) {
  let next = have, closed = false, tries = 0, timer = 0, ctrl = null;

  const handle = (event, data) => {
    if (event === 'meta') { tries = 0; onStatus?.('live'); onMeta?.(data); }
    else if (event === 'chunk') {
      if (data.chunk < next) return;
      next = data.chunk + 1;
      onChunk?.(data);
    } else if (event === 'done') { closed = true; onDone?.(data); }
    else if (event === 'error') {
      if (data.retryable && tries < 3) return 'retry';
      closed = true;
      onError?.(data);
    }
  };

  const connect = async () => {
    if (closed) return;
    ctrl = new AbortController();
    try {
      const res = await fetch(apiUrl('/api/stream', { v: video, to: lang, from: String(next) }), {
        headers: { accept: 'text/event-stream', ...API_HEADERS }, signal: ctrl.signal,
      });
      if (!res.ok || !res.body || !/event-stream/.test(res.headers.get('content-type') || '')) throw new Error('bad response');

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value.replace(/\r\n/g, '\n');
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          let event = 'message', data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue; // keep-alive comment
          if (handle(event, JSON.parse(data)) === 'retry') { ctrl.abort(); return retry(); }
          if (closed) { ctrl.abort(); return; }
        }
      }
      // The server ended the stream without `done`: pick up again.
      retry();
    } catch {
      if (!closed) retry();
    }
  };

  const retry = () => {
    if (closed) return;
    tries++;
    if (tries > 6) { closed = true; onError?.({ code: 'offline', message: 'Lost the connection to the server. Check your connection and try again.' }); return; }
    onStatus?.('reconnecting');
    timer = setTimeout(connect, Math.min(1000 * 2 ** (tries - 1), 15000));
  };

  connect();
  return () => { closed = true; clearTimeout(timer); ctrl?.abort(); };
}
