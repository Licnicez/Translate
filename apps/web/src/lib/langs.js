export const LANGS = [
  ['th', 'ไทย', 'Thai'], ['en', 'English', 'English'], ['ja', '日本語', 'Japanese'], ['ko', '한국어', 'Korean'],
  ['zh-CN', '中文', 'Chinese'], ['es', 'Español', 'Spanish'], ['fr', 'Français', 'French'], ['de', 'Deutsch', 'German'],
  ['pt', 'Português', 'Portuguese'], ['ru', 'Русский', 'Russian'], ['hi', 'हिन्दी', 'Hindi'], ['id', 'Indonesia', 'Indonesian'],
  ['vi', 'Tiếng Việt', 'Vietnamese'], ['ar', 'العربية', 'Arabic'], ['it', 'Italiano', 'Italian'], ['tr', 'Türkçe', 'Turkish'],
];

export const langName = (code) => {
  const l = LANGS.find(([c]) => c === code);
  if (l) return l[2];
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; }
};

export function defaultLang() {
  try {
    const saved = localStorage.getItem('cv-lang');
    if (saved) return saved;
  } catch { /* storage blocked */ }
  const pref = (navigator.language || 'en').split('-')[0];
  return LANGS.some(([c]) => c === pref) ? pref : 'en';
}
