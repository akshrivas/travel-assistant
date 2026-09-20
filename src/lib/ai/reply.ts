import { defaultModel, getOpenAI, isAiEnabled } from "@/lib/ai/client";
import { formatPrice } from "@/lib/engine/recommend";
import type {
  CustomerProfileView,
  RankedOption,
  TravelEnquiryBrief,
} from "@/lib/types/travel";

export async function craftAssistantReply(input: {
  stage: "clarify" | "shortlist" | "empty";
  brief: TravelEnquiryBrief;
  profile: CustomerProfileView;
  missing?: string[];
  shortlist?: RankedOption[];
  totalFound?: number;
  fallback: string;
}): Promise<string> {
  const openai = getOpenAI();
  if (!isAiEnabled() || !openai) return input.fallback;

  try {
    const system = `You are a sharp Personal Travel Assistant for India trips.
Tone: natural chat with a knowledgeable friend who actually compared the live market — not a call-center script, not a brochure.

Critical style rules:
- NEVER open with "Hi {name}", "Hey {name}", or "{name}," on mid-flow turns.
- Do NOT use the customer's first name unless they just introduced themselves or it adds clear warmth once in a long thread. Default: zero name usage.
- Be specific to THIS trip + THEIR prefs (party, pace, budget, avoidances) without name-dropping.
- Never invent hotels/prices/operators — only use provided shortlist data.
- Prefer concrete comparisons: rating/reviews, platform, budget fit, vibe match.
- Keep clarify asks to max 2 questions. No fluff.
- Shortlist intro: 2–4 sentences on why these fit, then stop (cards show details). Max ~90 words.
- Mention that prices/availability should be confirmed on the source link.
- English. Light **bold** ok. No emojis.`;

    const payload = {
      stage: input.stage,
      // Name available but model should almost never use it
      customerFirstName: input.profile.displayName || null,
      useName: false,
      customer: {
        home: input.profile.homeLocation,
        partyType: input.profile.partyType,
        usualBudget: [input.profile.budgetMin, input.profile.budgetMax],
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

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      temperature: 0.5,
      max_tokens: 280,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Write the next assistant message only (no preamble). Do not address the user by name:\n${JSON.stringify(payload)}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return input.fallback;
    return stripNameSpam(text, input.profile.displayName);
  } catch (err) {
    console.error("AI reply failed", err);
    return input.fallback;
  }
}

/** Soft guard if the model still greets by name mid-flow */
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
