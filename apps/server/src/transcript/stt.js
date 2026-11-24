/**
 * Tier 2: speech-to-text for videos without captions (Groq Whisper / Deepgram).
 * Not built: it needs an audio source, and pulling audio from YouTube is against
 * YouTube's terms. See docs/ARCHITECTURE.md, step 8.
 */
export function speechToText() {
  return {
    name: 'stt',
    enabled: false,
    async get() {
      throw Object.assign(new Error('Speech-to-text is not set up.'), { code: 'no_captions' });
    },
  };
}
