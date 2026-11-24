import { langName } from '../lib/langs.js';

export default function History({ items, onOpen }) {
  if (!items.length) return null;
  return (
    <section className="py-[var(--section-gap-s)]" aria-labelledby="recent-h">
      <div className="container grid gap-6">
        <h2 id="recent-h">watched lately</h2>
        <ul className="recent">
          {items.map((h) => (
            <li key={h.key}>
              <button type="button" className="recent__item" onClick={() => onOpen(h)}>
                <img src={`https://i.ytimg.com/vi/${h.videoId}/mqdefault.jpg`} alt="" width="320" height="180" loading="lazy" />
                <span className="recent__title">{h.title || 'YouTube video'}</span>
                <span className="recent__meta">in {langName(h.lang)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
