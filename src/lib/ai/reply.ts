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
    const system = `You are a warm, concise Personal Travel Assistant (India beachhead).
Voice: helpful travel companion, not a salesperson. Customer benefit first.
Rules:
- Use the customer's name if known.
- Reference what you already know about them when relevant (party type, pace, budget range, avoidances).
- Distinguish "this trip" constraints from long-term prefs — don't imply one-off budget is permanent.
- Never invent hotels, prices, or operators not in the provided shortlist/data.
- For shortlist: briefly introduce why these ~3 fit THIS customer, then the structured cards will show details — keep prose tight (max ~120 words before they see cards).
- For clarify: ask at most 2 missing things; sound smart not interrogative.
- English replies.
- No markdown tables. Light **bold** ok for option labels if helpful.`;

    const payload = {
      stage: input.stage,
      customer: {
        name: input.profile.displayName,
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
        reason: s.reason,
        source: s.option.source.name,
      })),
      totalFound: input.totalFound,
    };

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      temperature: 0.5,
      max_tokens: 350,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Write the assistant chat message for this turn:\n${JSON.stringify(payload)}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    return text || input.fallback;
  } catch (err) {
    console.error("AI reply failed", err);
    return input.fallback;
  }
}
