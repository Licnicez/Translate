const END = /[.!?。！？…]["')\]]?$/;

/**
 * Merge fragmented caption pieces into readable sentences, keeping the first
 * piece's start and the last piece's end. Auto captions have no punctuation,
 * so length, duration and pauses also close a sentence.
 */
export function mergeSegments(pieces, { maxChars = 140, maxSeconds = 7, pauseSeconds = 1.2 } = {}) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur) { out.push(cur); cur = null; } };

  for (const p of pieces) {
    if (cur) {
      const gap = p.start - cur.end;
      const tooLong = cur.text.length + p.text.length + 1 > maxChars || p.end - cur.start > maxSeconds;
      if (gap > pauseSeconds || tooLong) flush();
    }
    if (!cur) cur = { start: p.start, end: p.end, text: p.text };
    else { cur.text += ' ' + p.text; cur.end = Math.max(cur.end, p.end); }
    if (END.test(cur.text)) flush();
  }
  flush();

  // Auto-caption pieces overlap; stop each line where the next one begins.
  for (let i = 0; i < out.length - 1; i++) out[i].end = Math.max(out[i].start + 0.5, Math.min(out[i].end, out[i + 1].start));
  return out.map((s, index) => ({ index, start: round(s.start), end: round(s.end), original: s.text }));
}

const round = (n) => Math.round(n * 1000) / 1000;
