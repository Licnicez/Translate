import { useEffect, useRef, useState } from 'react';
import { getServer, setServer, checkServer, normalize, sameOriginApi } from '../lib/api.js';

/** Address of the clipvoice server (e.g. a tunnel to a home PC) and its access code. */
export default function ServerSettings({ open, onClose, reason }) {
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useEffect(() => {
    if (!open) return;
    const s = getServer();
    setUrl(s.url); setCode(s.code); setMsg({ text: reason || '', bad: !!reason });
    setTimeout(() => first.current?.focus(), 0);
  }, [open, reason]);

  if (!open) return null;

  // Opened from the server itself (Docker, or its tunnel address): only the code is needed.
  const local = sameOriginApi();

  const save = async (e) => {
    e.preventDefault();
    const server = { url: local ? '' : normalize(url), code: code.trim() };
    setBusy(true); setMsg({ text: 'Checking the server…', bad: false });
    try {
      const h = await checkServer(server);
      setServer(server);
      setMsg({ text: `Connected. Translating with ${h.translator === 'gemini' ? 'Gemini' : 'Google Translate'}.`, bad: false });
      setTimeout(onClose, 700);
    } catch (err) {
      setMsg({ text: err.message, bad: true });
    } finally { setBusy(false); }
  };

  return (
    <section className="container pb-6" aria-labelledby="srv-h">
      <form className="grid gap-4 max-w-[62rem] rounded-card bg-paper-2 p-6" onSubmit={save} noValidate>
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="srv-h" className="text-title">{local ? 'access code' : 'server settings'}</h2>
          <button type="button" className="pill" onClick={onClose}>close</button>
        </div>
        <p className="text-sm text-ink-2 max-w-[60ch]">
          {local
            ? 'This server is private. Enter its access code, the ACCESS_CODE line in the server’s .env file. Saved in this browser only.'
            : 'This site needs your clipvoice server, the Docker app on your PC reached through its tunnel address. Saved in this browser only.'}
        </p>
        <div className={'grid gap-2 ' + (local ? 'md:grid-cols-[minmax(0,1fr)_auto]' : 'md:grid-cols-[minmax(0,1fr)_14rem_auto]')}>
          {!local && <>
            <label className="visually-hidden" htmlFor="srv-url">server address</label>
            <input id="srv-url" ref={first} className="field" type="url" inputMode="url" autoComplete="off" spellCheck="false"
              placeholder="https://your-name.ngrok-free.dev" value={url} onChange={(e) => setUrl(e.target.value)} />
          </>}
          <label className="visually-hidden" htmlFor="srv-code">access code</label>
          <input id="srv-code" ref={local ? first : undefined} className="field" type="password" autoComplete="off" placeholder="access code"
            value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn--primary" type="submit" disabled={busy} aria-busy={busy || undefined}>{busy ? 'checking' : 'save'}</button>
        </div>
        <p role="status" aria-live="polite" className={'min-h-[1lh] text-sm ' + (msg.bad ? 'text-error' : 'text-muted')}>{msg.text}</p>
      </form>
    </section>
  );
}
