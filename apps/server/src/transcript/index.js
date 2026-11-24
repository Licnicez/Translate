import { youtubeCaptions } from './youtube.js';
import { speechToText } from './stt.js';

const tiers = [youtubeCaptions(), speechToText()];

const NO_CAPTIONS = /disabled|not available|no transcripts|transcript is disabled/i;

/** Try each tier in order. Returns { lang, source, segments }. */
export async function getTranscript(videoId) {
  let last;
  for (const tier of tiers) {
    if (tier.enabled === false) continue;
    try {
      const r = await tier.get(videoId);
      if (r.segments.length) return { ...r, source: tier.name };
    } catch (e) {
      last = e;
    }
  }
  if (!last || NO_CAPTIONS.test(last.message) || last.code === 'no_captions') {
    throw Object.assign(new Error('This video has no captions to translate. Try one with captions or auto captions turned on.'), { code: 'no_captions', status: 422, retryable: false });
  }
  throw Object.assign(new Error('Could not read this video’s captions: ' + last.message), { code: 'transcript_failed', status: 502, retryable: true });
}
