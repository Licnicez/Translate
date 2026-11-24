/** Pull the 11-character video id out of any YouTube link shape, or a bare id. */
export function videoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : 'https://' + s);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return valid(u.pathname.slice(1, 12));
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return valid(u.searchParams.get('v'));
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch { /* not a url */ }
  return null;
}

const valid = (id) => (/^[\w-]{11}$/.test(id) ? id : null);
