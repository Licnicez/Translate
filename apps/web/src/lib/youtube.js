/** Same rules as the server: the 11-character id from any YouTube link shape. */
export function videoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

/** Find a YouTube link inside shared text ("Check this out https://youtu.be/…"). */
export function linkFromShare(params) {
  for (const k of ['url', 'text', 'title']) {
    const v = params.get(k);
    if (!v) continue;
    const m = v.match(/https?:\/\/\S*(?:youtube\.com|youtu\.be)\S*/);
    if (m) return m[0];
    if (videoId(v)) return v;
  }
  return null;
}

let ready;
export function loadYouTubeApi() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ready = null; reject(new Error('Could not load the YouTube player. Check your connection.')); };
    document.head.append(s);
  });
  return ready;
}
