import { YoutubeTranscript } from 'youtube-transcript';

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

/**
 * The library takes the first caption track, which is often a viewer translation.
 * Reorder so the spoken language comes first: a human track in that language,
 * then the auto-caption (asr) track, then YouTube's default track.
 */
function pickSpokenTrack(baseFetch) {
  return async (url, init) => {
    const res = await baseFetch(url, init);
    if (!String(url).includes('/youtubei/v1/player') || !res.ok) return res;
    const data = await res.json();
    const r = data?.captions?.playerCaptionsTracklistRenderer;
    const tracks = r?.captionTracks;
    if (Array.isArray(tracks) && tracks.length > 1) {
      const asr = tracks.find((t) => t.kind === 'asr');
      const audio = r.audioTracks?.[r.defaultAudioTrackIndex ?? 0];
      const fallback = tracks[audio?.defaultCaptionTrackIndex ?? r.captionTracks.indexOf(tracks[0])] || tracks[0];
      const spoken = (asr || fallback).languageCode;
      const rank = (t) => (t.languageCode === spoken && t.kind !== 'asr' ? 0 : t === asr ? 1 : t === fallback ? 2 : 3);
      r.captionTracks = [...tracks].sort((a, b) => rank(a) - rank(b));
    }
    return new Response(JSON.stringify(data), { status: res.status, headers: { 'content-type': 'application/json' } });
  };
}

/**
 * Tier 1: the video's own captions or auto captions.
 * `fetchImpl` is the seam for a residential proxy or a third-party transcript API.
 */
export function youtubeCaptions({ fetchImpl = fetch } = {}) {
  const fetchFn = pickSpokenTrack(fetchImpl);
  return {
    name: 'captions',
    async get(videoId) {
      const raw = await YoutubeTranscript.fetchTranscript(videoId, { fetch: fetchFn });
      return {
        lang: raw[0]?.lang || '',
        segments: raw
          .map((s) => ({
            start: s.offset / 1000,
            end: (s.offset + s.duration) / 1000,
            text: decode(s.text).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim(),
          }))
          .filter((s) => s.text),
      };
    },
  };
}
