/**
 * Index of the line showing at time t, or -1.
 * segments are sorted by start; a line stays up to 0.3 s past its end to avoid flicker.
 */
export function activeIndex(segments, t) {
  let lo = 0, hi = segments.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (segments[m].start <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r >= 0 && t <= segments[r].end + 0.3 ? r : -1;
}

export const clock = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
