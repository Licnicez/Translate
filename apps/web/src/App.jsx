import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LinkForm from './components/LinkForm.jsx';
import Player from './components/Player.jsx';
import Transcript from './components/Transcript.jsx';
import History from './components/History.jsx';
import { defaultLang, langName } from './lib/langs.js';
import { videoId, linkFromShare } from './lib/youtube.js';
import { activeIndex, clock } from './lib/sync.js';
import { openStream } from './lib/stream.js';
import { getSubs, putSubs, addHistory, listHistory } from './lib/idb.js';
import { needsServer, checkServer, getServer } from './lib/api.js';
import ServerSettings from './components/ServerSettings.jsx';

/** Chunks arrive in order, but a gap would break the sync search: only use the contiguous run. */
const contiguous = (chunks) => {
  const out = [];
  for (let i = 0; i < chunks.length && chunks[i]; i++) out.push(chunks[i]);
  return out;
};

export default function App() {
  const [link, setLink] = useState('');
  const [lang, setLang] = useState(defaultLang);
  const [current, setCurrent] = useState(null); // { id, lang }
  const [meta, setMeta] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [conn, setConn] = useState('');
  const [time, setTime] = useState(0);
  const [title, setTitle] = useState('');
  const [showSubs, setShowSubs] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);
  const [follow, setFollow] = useState(true);
  const [history, setHistory] = useState([]);
  const playerRef = useRef(null);
  const deskRef = useRef(null);

  const segments = useMemo(() => contiguous(chunks).flat(), [chunks]);
  const active = useMemo(() => activeIndex(segments, time), [segments, time]);
  const translatedUntil = segments.at(-1)?.end ?? 0;
  const waiting = !!meta && !done && time > translatedUntil;

  useEffect(() => { listHistory().then(setHistory); }, []);

  const [settings, setSettings] = useState({ open: false, reason: '' });
  const pending = useRef(null); // a video waiting for the server to be set up
  const askServer = useCallback((reason) => setSettings({ open: true, reason }), []);

  const start = useCallback((input, to) => {
    const id = videoId(input);
    if (!id) { setError('That does not look like a YouTube link. Paste the address of a video.'); return; }
    try { localStorage.setItem('cv-lang', to); } catch { /* storage blocked */ }
    setError('');
    if (needsServer()) {
      pending.current = { input, to };
      askServer('Add your server’s address first, then the video starts.');
      return;
    }
    setCurrent({ id, lang: to, n: Date.now() });
    const qs = new URLSearchParams({ v: id, to });
    window.history.replaceState(null, '', '/?' + qs);
  }, []);

  // Deep links (/?v=…&to=…) and the share target (/share?url=…&text=…).
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const shared = location.pathname === '/share' ? linkFromShare(p) : null;
    const v = shared || p.get('v');
    if (!v) return;
    const to = p.get('to') || defaultLang();
    setLink(shared || 'https://www.youtube.com/watch?v=' + v);
    setLang(to);
    start(v, to);
  }, [start]);

  // Load what IndexedDB has, then stream only the chunks still missing.
  useEffect(() => {
    if (!current) return;
    const { id, lang: to } = current;
    let close = () => {}, cancelled = false;
    let metaNow = null, chunksNow = [];

    setMeta(null); setChunks([]); setDone(false); setTime(0); setTitle(''); setConn('');

    const save = () => putSubs(id, to, { meta: metaNow, chunks: chunksNow });

    (async () => {
      const stored = await getSubs(id, to);
      if (cancelled) return;
      if (stored?.meta) {
        metaNow = stored.meta; chunksNow = contiguous(stored.chunks || []);
        setMeta(metaNow); setChunks(chunksNow);
        if (chunksNow.length >= metaNow.totalChunks) { setDone(true); return; }
      }
      // Fail fast with a clear reason when the server (often a home PC) is off or locked.
      try { await checkServer(); } catch (e) {
        if (cancelled) return;
        setError(e.message);
        if (e.code === 'unauthorized') { pending.current = { input: id, to }; askServer(e.message); }
        return;
      }
      if (cancelled) return;
      close = openStream({
        video: id, lang: to, have: chunksNow.length,
        onStatus: setConn,
        onMeta: (m) => {
          metaNow = m; setMeta(m); save();
          addHistory({ videoId: id, lang: to }).then(() => listHistory().then(setHistory));
        },
        onChunk: ({ chunk, segments: segs }) => {
          chunksNow = [...chunksNow]; chunksNow[chunk] = segs;
          setChunks(chunksNow); save();
        },
        onDone: () => { setDone(true); setConn(''); },
        onError: (e) => {
          setError(e.message); setConn('');
          if (e.code === 'unauthorized') { pending.current = { input: id, to }; askServer(e.message); }
        },
      });
    })();

    return () => { cancelled = true; close(); };
  }, [current, askServer]);

  const closeSettings = () => {
    setSettings({ open: false, reason: '' });
    const p = pending.current;
    pending.current = null;
    if (p && !needsServer()) start(p.input, p.to);
  };

  useEffect(() => {
    if (meta && deskRef.current && chunks.length <= 1) {
      deskRef.current.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    // only when a new video's first lines land
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.videoId, meta?.targetLang]);

  const onTitle = useCallback((t) => {
    setTitle(t);
    if (current) addHistory({ videoId: current.id, lang: current.lang, title: t }).then(() => listHistory().then(setHistory));
  }, [current]);

  const busy = !!current && !meta && !error;
  const status = !current ? ''
    : !meta ? 'Reading the captions. The video starts as soon as the first lines are translated.'
    : conn === 'reconnecting' ? 'Connection dropped. Reconnecting and picking up where it stopped.'
    : '';
  const progress = meta ? (done ? 1 : Math.min(1, chunks.filter(Boolean).length / Math.max(1, meta.totalChunks))) : 0;
  const summary = meta && (done
    ? `${meta.totalSegments} lines, ${langName(meta.sourceLang) || 'original'} to ${langName(meta.targetLang)}.`
    : `Translated up to ${clock(translatedUntil)} of ${clock(meta.duration)}.`);

  return (
    <>
      <a className="skip" href="#main">skip to content</a>
      <header className="bar">
        <div className="container flex items-center justify-between min-h-16">
          <a className="mark" href="/" aria-label="clipvoice home">clipvoice</a>
          <nav className="flex items-center gap-6" aria-label="site">
            <a className="navlink" href="#about">what you get</a>
            <button type="button" className="navlink cursor-pointer bg-transparent border-0 p-0" aria-expanded={settings.open}
              onClick={() => (settings.open ? closeSettings() : askServer(''))}>
              {getServer().url ? 'server' : 'set up server'}
            </button>
          </nav>
        </div>
      </header>

      <main id="main">
        {settings.open && <div className="pt-6"><ServerSettings open reason={settings.reason} onClose={closeSettings} /></div>}
        <section className="pt-10 pb-8 md:pt-16">
          <div className="container grid gap-6 justify-items-start">
            <h1 className="max-w-[14ch]">paste a clip, watch it translated</h1>
            <p className="lead">Drop in a YouTube link and read along in your own language.</p>
            <LinkForm link={link} setLink={setLink} lang={lang} setLang={setLang} busy={busy} error={error} status={status} onSubmit={() => start(link, lang)} />
          </div>
        </section>

        {current && meta && (
          <section ref={deskRef} className="pt-6 pb-[var(--section-gap-s)] scroll-mt-20" aria-label="translated video">
            <div className="container grid gap-8 items-start lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <div className="grid gap-4 min-w-0">
                <Player
                  videoId={current.id} line={segments[active]} waiting={waiting}
                  showSubs={showSubs} showOriginal={showOriginal}
                  onTime={setTime} onTitle={onTitle} onError={setError} playerRef={playerRef}
                >
                  <button className="pill" type="button" aria-pressed={showSubs} onClick={() => setShowSubs((v) => !v)}>subtitles</button>
                  <button className="pill" type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>original line</button>
                  <button className="pill" type="button" aria-pressed={follow} onClick={() => setFollow((v) => !v)}>follow along</button>
                </Player>
                <div className="grid gap-2">
                  <div className="progress" role="progressbar" aria-label="translation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                    <span style={{ transform: `scaleX(${progress})` }} />
                  </div>
                  <p className="text-sm text-muted">{title ? title + '. ' : ''}{summary}</p>
                </div>
              </div>
              <Transcript
                segments={segments} active={active} follow={follow} showOriginal={showOriginal}
                pending={!done} onSeek={(t) => playerRef.current?.seek(t)}
              />
            </div>
          </section>
        )}

        <History items={history} onOpen={(h) => { setLink('https://www.youtube.com/watch?v=' + h.videoId); setLang(h.lang); start(h.videoId, h.lang); }} />

        <section id="about" className="py-[var(--section-gap-s)]">
          <div className="container grid gap-8 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <h2>what you get</h2>
            <ul className="rows">
              <li><h3>it starts right away</h3><p>The first minute is translated first, so the video plays while the rest catches up.</p></li>
              <li><h3>two lines on the video</h3><p>Your language on top and the original under it, at the moment each is spoken.</p></li>
              <li><h3>a transcript you can jump around</h3><p>Select any line and the video seeks to it.</p></li>
              <li><h3>share from the YouTube app</h3><p>Install clipvoice, then share a video to it from YouTube on your phone.</p></li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="bg-paper-2 py-16">
        <div className="container grid gap-4">
          <p className="foot__big">clipvoice</p>
          <p className="text-sm text-muted max-w-[60ch]">Captions come from YouTube. The video plays from YouTube. Translations are machine made and can miss.</p>
        </div>
      </footer>
    </>
  );
}
