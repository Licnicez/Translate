import { useEffect, useRef } from 'react';
import { clock } from '../lib/sync.js';

export default function Transcript({ segments, active, follow, showOriginal, pending, onSeek }) {
  const list = useRef(null);

  useEffect(() => {
    if (!follow || active < 0 || !list.current) return;
    const li = list.current.children[active];
    if (!li) return;
    const box = list.current;
    const top = li.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight / 2 + li.offsetHeight / 2;
    // Glide between neighbouring lines; jump straight there after a seek.
    const near = Math.abs(top - box.scrollTop) < box.clientHeight;
    const smooth = near && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }, [active, follow]);

  return (
    <div className="grid gap-3 min-w-0">
      <h2 className="text-title">transcript</h2>
      <ol ref={list} className="lines" tabIndex={0} aria-label="translated transcript, select a line to jump to it">
        {segments.map((s, i) => (
          <li key={s.index}>
            <button type="button" className="line" aria-current={i === active ? 'true' : undefined} onClick={() => onSeek(s.start)}>
              <time>{clock(s.start)}</time>
              <span>
                <span className="line__tr">{s.translated}</span>
                {showOriginal && <span className="line__src">{s.original}</span>}
              </span>
            </button>
          </li>
        ))}
        {pending && <li className="lines__pending">translating the next part</li>}
      </ol>
    </div>
  );
}
