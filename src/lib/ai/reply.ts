import { defaultModel, getOpenAI, isAiEnabled } from "@/lib/ai/client";
import { formatPrice } from "@/lib/engine/recommend";
import {
  detectMood,
  languageInstruction,
  moodInstruction,
  resolveReplyLanguage,
  type ReplyLanguage,
  type ReplyMood,
} from "@/lib/ai/tone";
import type {
  CustomerProfileView,
  RankedOption,
  TravelEnquiryBrief,
} from "@/lib/types/travel";

export async function craftAssistantReply(input: {
  stage: "clarify" | "shortlist" | "empty" | "chat";
  brief: TravelEnquiryBrief;
  profile: CustomerProfileView;
  missing?: string[];
  shortlist?: RankedOption[];
  totalFound?: number;
  userMessage?: string;
  conversationKind?: "travel_plan" | "chat" | "profile" | "meta";
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  fallback: string;
}): Promise<string> {
  const openai = getOpenAI();
  const msg = input.userMessage || "";
  const lang = resolveReplyLanguage(msg, input.profile.preferredLanguage);
  const mood = detectMood(msg);

  if (!isAiEnabled() || !openai) {
    return localizeFallback(input.fallback, lang);
  }

  try {
    const system = `You are TripSaathi — a sharp personal travel companion for India.
Tone: natural chat with a smart friend continuing an ongoing conversation.

Language (mandatory):
${languageInstruction(lang)}

Mood (mandatory):
${moodInstruction(mood)}

Core behaviour:
- You HAVE conversation history. Use it. Refer to what they already said when relevant.
- Never pretend this is a brand-new chat if history exists.
- Answer the user's ACTUAL latest message in context of prior turns.
- Match their language AND mood — if they write Hinglish casually, reply the same way.
- Do not force trip planning. If they chat, chat back.
- If they ask name/prefs/what you remember — use customer profile + history.
- Only ask trip-clarifying questions when stage is clarify AND they are clearly planning a trip.
- Never invent hotels/prices/operators — only use provided shortlist data.
- Never ask check-in/out dates, guest counts, or room types to "book" yourself — we are not an OTA. Trip details come from the trip brief form; hotel pick → enquire/connect only.
- When the user names a stay from the shortlist, confirm the lock and point to enquiry/connect — do not start a booking questionnaire.
- Do NOT open with "Hi {name}" every turn.
- Light **bold** ok. Emojis only if the user used them. Chat replies under ~70 words unless shortlist.`;

    const payload = {
      stage: input.stage,
      conversationKind: input.conversationKind || "travel_plan",
      replyLanguage: lang,
      replyMood: mood,
      userMessage: input.userMessage,
      recentHistory: (input.history || []).slice(-12),
      customer: {
        displayName: input.profile.displayName || null,
        home: input.profile.homeLocation,
        partyType: input.profile.partyType,
        preferredLanguage: input.profile.preferredLanguage,
        usualBudget: [input.profile.budgetMin, input.profile.budgetMax],
        preferredDestinations: input.profile.preferredDestinations,
        preferences: input.profile.preferences,
        avoidances: input.profile.avoidances,
        knowledgeConfidence: input.profile.knowledgeConfidence,
      },
      tripBrief: input.brief,
      missing: input.missing ?? input.brief.missingInformation,
      shortlist: (input.shortlist || []).map((s) => ({
        label: s.label,
        destination: s.option.destination,
        days: s.option.durationDays,
        price: formatPrice(s.option.price.amount, s.option.price.currency),
        stay: s.option.stay?.name,
        player: s.option.player?.name,
        rating: s.option.player?.rating,
        reviews: s.option.player?.reviewCount,
        reliability: s.option.player?.reliabilityNote,
        reason: s.reason,
        source: s.option.source.name,
        url: s.option.source.url,
      })),
      totalFound: input.totalFound,
    };

    const historyMsgs = (input.history || []).slice(-10).map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    }));

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      temperature: input.stage === "chat" ? 0.6 : 0.45,
      max_tokens: input.stage === "chat" ? 200 : 300,
      messages: [
        { role: "system", content: system },
        ...historyMsgs,
        {
          role: "user",
          content: `Latest user message to answer (match language=${lang}, mood=${mood}):\n${msg}\n\nContext JSON:\n${JSON.stringify(payload)}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return localizeFallback(input.fallback, lang);
    if (input.stage === "chat" && input.conversationKind === "profile") {
      return text;
    }
    return stripNameSpam(text, input.profile.displayName);
  } catch (err) {
    console.error("AI reply failed", err);
    return localizeFallback(input.fallback, lang);
  }
}

function localizeFallback(text: string, lang: ReplyLanguage): string {
  if (lang === "en") return text;
  // Keep English fallback if we can't translate offline — AI path is primary
  return text;
}

function stripNameSpam(text: string, displayName?: string | null): string {
  if (!displayName) return text;
  const name = displayName.trim();
  if (name.length < 2) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`^(hi|hey|hello)\\s+${escaped}[,!.\\-–—]*\\s*`, "i"), "")
    .replace(new RegExp(`^${escaped}[,!.\\-–—]\\s*`, "i"), "")
    .trim();
}

export type { ReplyLanguage, ReplyMood };
