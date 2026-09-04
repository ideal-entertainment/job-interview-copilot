const OPENERS =
  /^(who|what|when|where|why|how|can|could|would|will|do|does|did|is|are|have|has|tell|describe|explain|walk|give|share|talk)\b/i

export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 8) return false
  if (/\?\s*$/.test(trimmed)) return true
  if (OPENERS.test(trimmed)) return true
  return /\b(tell me|walk me|give me an example|talk about|how would you|what would you)\b/i.test(
    trimmed
  )
}

export function needsTranslation(sourceLanguage: string, displayLanguage: string): boolean {
  if (!displayLanguage || displayLanguage === 'auto') return false
  if (sourceLanguage && sourceLanguage !== 'auto' && sourceLanguage === displayLanguage) return false
  return true
}

export function languageLabel(id: string): string {
  const names: Record<string, string> = {
    auto: 'the original language',
    en: 'English',
    es: 'Spanish',
    de: 'German',
    fr: 'French',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    pt: 'Portuguese',
    it: 'Italian',
    ar: 'Arabic',
    hi: 'Hindi',
    ru: 'Russian'
  }
  return names[id] || id
}
