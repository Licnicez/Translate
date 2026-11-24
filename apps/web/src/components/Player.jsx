import { useEffect, useRef, useState } from 'react';
import { loadYouTubeApi } from '../lib/youtube.js';

/**
 * The YouTube player with the dual subtitle over it (or under it on small screens).
 * Reports the playhead every 150 ms through onTime; playerRef gets { seek(t) }.
 */
export default function Player({ videoId, line, waiting, showSubs, showOriginal, onTime, onTitle, onError, playerRef, children }) {
  const host = useRef(null);
  const stage = useRef(null);
  const [full, setFull] = useState(false); // pseudo-fullscreen
  const [realFull, setRealFull] = useState(false);

  useEffect(() => {
    let player, timer, dead = false;
    const el = document.createElement('div');
    host.current.replaceChildren(el);
    loadYouTubeApi().then((YT) => {
      if (dead) return;
      player = new YT.Player(el, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, cc_load_policy: 0, fs: 0, iv_load_policy: 3 },
        events: {
          onApiChange: () => { hideYtCaptions(player); },
          // The captions module loads when playback starts if the viewer has CC on in YouTube.
          onStateChange: (e) => { if (e.data === 1 || e.data === 3) hideYtCaptions(player); },
          onReady: () => {
            // YouTube's own captions would sit under ours; switch them off.
            hideYtCaptions(player);
            const title = player.getVideoData?.().title;
            if (title) onTitle?.(title);
            timer = setInterval(() => { if (player.getCurrentTime) onTime(player.getCurrentTime()); }, 150);
          },
          onError: (e) => onError?.(e.data === 101 || e.data === 150 ? 'The owner of this video does not allow it to play on other sites. The subtitles still work in the transcript.' : 'The video could not play.'),
        },
      });
      playerRef.current = {
        seek: (t) => { player.seekTo?.(t, true); player.playVideo?.(); },
      };
    }).catch((e) => onError?.(e.message));
    return () => { dead = true; clearInterval(timer); try { player?.destroy(); } catch { /* already gone */ } playerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    const sync = () => setRealFull(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('no-scroll', full);
    if (!full) return;
    const esc = (e) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('no-scroll'); };
  }, [full]);

  const toggleFull = () => {
    if (realFull) return document.exitFullscreen();
    if (full) return setFull(false);
    // iPhone Safari has no element fullscreen, and native video fullscreen hides overlays.
    if (document.fullscreenEnabled && stage.current.requestFullscreen) {
      stage.current.requestFullscreen().catch(() => setFull(true));
      // Some embedded browsers neither enter fullscreen nor reject: fall back.
      setTimeout(() => { if (!document.fullscreenElement) setFull(true); }, 500);
    } else setFull(true);
  };

  const subs = (cls) => (
    <div className={'subs ' + cls} data-empty={!line && !waiting} aria-hidden="true">
      {line ? (
        <>
          <span className="subs__tr">{line.translated}</span>
          {showOriginal && !line.untranslated && <span className="subs__src">{line.original}</span>}
        </>
      ) : waiting ? <span className="subs__wait">translating this part</span> : null}
    </div>
  );

  return (
    <div className="grid gap-3">
      <div ref={stage} className={'stage' + (full || realFull ? ' is-full' : '')}>
        <div className="screen">
          <div ref={host} className="absolute inset-0" />
          {showSubs && subs('subs--over')}
        </div>
        <div className="stage__exit">
          <button className="pill" type="button" onClick={toggleFull}>exit fullscreen</button>
        </div>
      </div>
      {showSubs && subs('subs--below')}
      <div className="flex flex-wrap gap-2">
        {children}
        <button className="pill" type="button" onClick={toggleFull}>fullscreen</button>
      </div>
    </div>
  );
}

/** YouTube shows its own captions when the viewer has them on; they would sit under ours. */
function hideYtCaptions(player) {
  try { player.setOption?.('captions', 'track', {}); } catch { /* no captions module */ }
  try { player.unloadModule?.('captions'); player.unloadModule?.('cc'); } catch { /* not loaded */ }
}
