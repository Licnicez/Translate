/**
 * Open the translation stream for (video, lang), resuming after `have` chunks.
 * Reconnects with backoff on a dropped connection, always asking only for the
 * chunks it does not have yet. Returns a function that closes it.
 */
export function openStream({ video, lang, have = 0, onMeta, onChunk, onDone, onError, onStatus }) {
  let next = have, es = null, closed = false, tries = 0, timer = 0;

  const connect = () => {
    if (closed) return;
    const qs = new URLSearchParams({ v: video, to: lang, from: String(next) });
    es = new EventSource('/api/stream?' + qs);

    es.addEventListener('meta', (e) => { tries = 0; onStatus?.('live'); onMeta?.(JSON.parse(e.data)); });
    es.addEventListener('chunk', (e) => {
      const d = JSON.parse(e.data);
      if (d.chunk < next) return;
      next = d.chunk + 1;
      onChunk?.(d);
    });
    es.addEventListener('done', (e) => { closed = true; es.close(); onDone?.(JSON.parse(e.data)); });
    // A server-sent `error` event carries data; a dropped connection does not.
    es.addEventListener('error', (e) => {
      if (e.data) {
        const err = JSON.parse(e.data);
        es.close();
        if (err.retryable && tries < 3) return retry();
        closed = true;
        onError?.(err);
        return;
      }
      es.close();
      retry();
    });
  };

  const retry = () => {
    if (closed) return;
    tries++;
    if (tries > 6) { closed = true; onError?.({ code: 'offline', message: 'Lost the connection to the server. Check your connection and try again.' }); return; }
    onStatus?.('reconnecting');
    timer = setTimeout(connect, Math.min(1000 * 2 ** (tries - 1), 15000));
  };

  connect();
  return () => { closed = true; clearTimeout(timer); es?.close(); };
}
