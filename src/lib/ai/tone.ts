/**
 * Detect how the user is speaking / feeling so replies can match.
 */

export type ReplyLanguage = "en" | "hi" | "hinglish";
export type ReplyMood =
  | "excited"
  | "curious"
  | "casual"
  | "frustrated"
  | "warm"
  | "neutral";

const DEVANAGARI = /[\u0900-\u097F]/;

/** Rough language of the latest message (overrides profile when clear). */
export function detectMessageLanguage(text: string): ReplyLanguage | null {
  const t = text.trim();
  if (!t) return null;
  if (DEVANAGARI.test(t)) return "hi";

  const hinglishCue =
    /\b(hai|hain|nahi|nahin|kya|kyun|kaise|kab|mein|me|abhi|yaar|bhai|matlab|toh|tha|thi|the|chahiye|jaana|ghumna|samundar|bahut|thoda|accha|acha|sahi|bilkul|please|yaar)\b/i.test(
      t,
    );
  const englishCue =
    /\b(the|and|for|with|what|where|how|please|trip|budget|days|family|couple)\b/i.test(
      t,
    );

  if (hinglishCue) return "hinglish";
  if (englishCue) return "en";
  return null;
}

export function resolveReplyLanguage(
  message: string,
  preferred?: string | null,
): ReplyLanguage {
  const detected = detectMessageLanguage(message);
  if (detected) return detected;
  if (preferred === "hi") return "hi";
  if (preferred === "hinglish" || preferred === "hi-en") return "hinglish";
  return "en";
}

export function detectMood(text: string): ReplyMood {
  const t = text.toLowerCase();
  if (
    /!{2,}|\b(excited|can't wait|so excited|woo+|yay|amazing|finally|bahut excited|mazza)\b/.test(
      t,
    ) ||
    /😃|😄|🎉|🔥|✨/.test(text)
  ) {
    return "excited";
  }
  if (
    /\b(frustrated|annoyed|again|not working|galat|bekar|nonsense|kya bakwas|har baar)\b/i.test(
      t,
    ) ||
    /😡|😤/.test(text)
  ) {
    return "frustrated";
  }
  if (
    /\b(thanks|thank you|shukriya|dhanyavad|sweet|kind|miss you|love)\b/i.test(t) ||
    /❤️|🙏|😊/.test(text)
  ) {
    return "warm";
  }
  if (
    /\b(what|why|how|kaise|kya|kyun|batao|explain|samjha)\b/i.test(t) ||
    /\?/.test(t)
  ) {
    return "curious";
  }
  if (
    /\b(yaar|bhai|ok|okay|cool|chill|bas|theek|thik|hmm)\b/i.test(t) ||
    /😂|🤣|😅/.test(text)
  ) {
    return "casual";
  }
  return "neutral";
}

export function languageInstruction(lang: ReplyLanguage): string {
  switch (lang) {
    case "hi":
      return "Reply in natural Hindi (Devanagari). Keep it conversational, not formal textbook Hindi.";
    case "hinglish":
      return "Reply in natural Hinglish (Roman Hindi + English mix), like a smart Indian friend texts. Do NOT use Devanagari unless the user did.";
    default:
      return "Reply in clear, natural English.";
  }
}

export function moodInstruction(mood: ReplyMood): string {
  switch (mood) {
    case "excited":
      return "Match their energy — warm and upbeat, still concise. No corporate tone.";
    case "frustrated":
      return "Be calm, helpful, and direct. Acknowledge the friction briefly; fix/help without defensiveness.";
    case "warm":
      return "Be warm and human; a light friendly tone is fine.";
    case "curious":
      return "Be clear and specific; answer the question first, then offer one gentle next step if useful.";
    case "casual":
      return "Keep it light and conversational — short sentences, no brochure voice.";
    default:
      return "Stay natural and steady; mirror their energy without going flat or hype.";
  }
}
