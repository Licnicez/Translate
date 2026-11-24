import { LANGS } from '../lib/langs.js';

export default function LinkForm({ link, setLink, lang, setLang, busy, error, status, onSubmit }) {
  return (
    <form className="w-full max-w-[62rem]" noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_13rem_auto]">
        <label className="visually-hidden" htmlFor="link">YouTube link</label>
        <input
          id="link" className="field" type="url" inputMode="url" autoComplete="off" spellCheck="false"
          placeholder="https://www.youtube.com/watch?v=..." value={link} onChange={(e) => setLink(e.target.value)}
          aria-invalid={error ? 'true' : undefined} aria-describedby="help" required
        />
        <label className="visually-hidden" htmlFor="lang">translate into</label>
        <select id="lang" className="field" value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGS.map(([code, native, en]) => (
            <option key={code} value={code}>{native === en ? en : `${native} · ${en}`}</option>
          ))}
        </select>
        <button className="btn btn--primary" type="submit" disabled={busy} aria-busy={busy || undefined}>
          {busy ? 'starting' : 'translate'}
        </button>
      </div>
      <p id="help" role="status" aria-live="polite" className={'mt-3 min-h-[1lh] text-sm ' + (error ? 'text-error' : 'text-muted')}>
        {error || status}
      </p>
    </form>
  );
}
