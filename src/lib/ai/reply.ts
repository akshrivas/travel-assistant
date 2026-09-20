import { defaultModel, getOpenAI, isAiEnabled } from "@/lib/ai/client";
import { formatPrice } from "@/lib/engine/recommend";
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
  fallback: string;
}): Promise<string> {
  const openai = getOpenAI();
  if (!isAiEnabled() || !openai) return input.fallback;

  try {
    const system = `You are TripSaathi — a sharp personal travel companion for India.
Tone: natural chat with a smart friend. Not a call-center script. Not a brochure.

Core behaviour:
- Answer the user's ACTUAL message. Do not force trip planning.
- If they ask their name, prefs, or what you remember — answer from customer profile. Be specific.
- If they greet or make small talk — respond warmly in 1–2 sentences. You may lightly invite a trip idea, but never demand destination/duration/budget.
- Only ask trip-clarifying questions when stage is clarify AND they are clearly planning a trip.
- Never invent hotels/prices/operators — only use provided shortlist data.
- Do NOT open with "Hi {name}" every turn. Use their name only when they asked about it, or once for warmth if natural.
- English. Light **bold** ok. No emojis. Keep chat replies under ~60 words unless shortlist.`;

    const payload = {
      stage: input.stage,
      conversationKind: input.conversationKind || "travel_plan",
      userMessage: input.userMessage,
      customer: {
        displayName: input.profile.displayName || null,
        home: input.profile.homeLocation,
        partyType: input.profile.partyType,
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

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      temperature: input.stage === "chat" ? 0.6 : 0.45,
      max_tokens: input.stage === "chat" ? 160 : 280,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Write the next assistant message only (no preamble):\n${JSON.stringify(payload)}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return input.fallback;
    // Only strip greeting spam on travel turns — name answers need the name
    if (input.stage === "chat" && input.conversationKind === "profile") {
      return text;
    }
    return stripNameSpam(text, input.profile.displayName);
  } catch (err) {
    console.error("AI reply failed", err);
    return input.fallback;
  }
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
