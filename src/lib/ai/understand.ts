import { z } from "zod";
import { defaultModel, getOpenAI, isAiEnabled } from "@/lib/ai/client";
import {
  mergeBriefs,
  understandTravelEnquiry,
} from "@/lib/engine/understand";
import type {
  CustomerProfileView,
  TravelEnquiryBrief,
} from "@/lib/types/travel";

const briefSchema = z.object({
  intent: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  datesText: z.string().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  travellers: z.number().int().positive().optional().nullable(),
  partyType: z
    .enum(["solo", "couple", "family", "friends"])
    .optional()
    .nullable(),
  budgetMin: z.number().optional().nullable(),
  budgetMax: z.number().optional().nullable(),
  budgetCurrency: z.string().optional().nullable(),
  travelStyle: z.string().optional().nullable(),
  preferences: z.record(z.string(), z.unknown()).optional().nullable(),
  constraints: z.record(z.string(), z.unknown()).optional().nullable(),
  temporary: z.record(z.string(), z.unknown()).optional().nullable(),
  confidence: z.number().min(0).max(1),
  missingInformation: z.array(z.string()),
  /** Long-term preference hints only if user implied lasting preference */
  longTermPreferenceHints: z
    .object({
      partyType: z.string().optional().nullable(),
      pace: z.string().optional().nullable(),
      interests: z.array(z.string()).optional().nullable(),
      avoidances: z.array(z.string()).optional().nullable(),
      hotel: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export type AiUnderstandResult = {
  brief: TravelEnquiryBrief;
  longTermPreferenceHints?: z.infer<
    typeof briefSchema
  >["longTermPreferenceHints"];
  usedAi: boolean;
};

/**
 * Understand travel intent with LLM when available; else rule-based fallback.
 * Temporary trip constraints stay in `temporary` / trip brief — not auto profile writes.
 */
export async function understandWithAi(input: {
  message: string;
  priorBrief?: TravelEnquiryBrief | null;
  profile?: CustomerProfileView | null;
}): Promise<AiUnderstandResult> {
  const fallback = (() => {
    const extracted = understandTravelEnquiry(
      input.message,
      input.priorBrief ?? undefined,
    );
    const brief = input.priorBrief
      ? mergeBriefs(input.priorBrief, extracted)
      : extracted;
    return { brief, usedAi: false as const };
  })();

  const openai = getOpenAI();
  if (!isAiEnabled() || !openai) return fallback;

  try {
    const profile = input.profile;
    const system = `You are the understanding layer of a Personal Travel Assistant for India trips.
Extract a structured travel brief from the user message.
Rules:
- Prefer English field values.
- Budget numbers in INR absolute amounts (60000 not 60).
- If user says a one-off budget ("this time", "is baar", "for this trip"), put budget in temporary AND budgetMin/Max, do NOT treat as permanent.
- Only fill longTermPreferenceHints when user clearly states lasting preferences ("I usually...", "we always prefer...").
- missingInformation: only fields truly needed to search well: destination, duration, budget, travellers/party.
- confidence 0-1 reflecting how complete the brief is.
- Do not invent destinations the user didn't imply.
Return JSON only matching the schema.`;

    const userPayload = {
      message: input.message,
      priorBrief: input.priorBrief ?? null,
      customerProfile: profile
        ? {
            displayName: profile.displayName,
            homeLocation: profile.homeLocation,
            partyType: profile.partyType,
            typicalDuration: profile.typicalDuration,
            budgetMin: profile.budgetMin,
            budgetMax: profile.budgetMax,
            preferredDestinations: profile.preferredDestinations,
            preferences: profile.preferences,
            avoidances: profile.avoidances,
            knowledgeConfidence: profile.knowledgeConfidence,
          }
        : null,
    };

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = briefSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fallback;

    const d = parsed.data;
    const aiBrief: TravelEnquiryBrief = {
      intent: d.intent ?? undefined,
      destination: d.destination ?? undefined,
      datesText: d.datesText ?? undefined,
      durationDays: d.durationDays ?? undefined,
      travellers: d.travellers ?? undefined,
      partyType: d.partyType ?? undefined,
      budgetMin: d.budgetMin ?? undefined,
      budgetMax: d.budgetMax ?? undefined,
      budgetCurrency: d.budgetCurrency ?? "INR",
      travelStyle: d.travelStyle ?? undefined,
      preferences: d.preferences ?? {},
      constraints: d.constraints ?? {},
      temporary: d.temporary ?? {},
      confidence: d.confidence,
      missingInformation: d.missingInformation ?? [],
      rawText: input.message,
    };

    // Fill gaps from profile when user omitted known defaults (not temporary)
    if (!aiBrief.partyType && profile?.partyType) {
      aiBrief.partyType = profile.partyType;
    }
    if (
      aiBrief.budgetMax == null &&
      aiBrief.budgetMin == null &&
      !aiBrief.temporary?.budgetMax &&
      profile?.budgetMax
    ) {
      // Suggest using usual budget — mark soft, still ask if confidence low
      if ((profile.knowledgeConfidence ?? 0) >= 0.45) {
        aiBrief.budgetMin = profile.budgetMin ?? undefined;
        aiBrief.budgetMax = profile.budgetMax ?? undefined;
        aiBrief.missingInformation = (aiBrief.missingInformation || []).filter(
          (m) => m !== "budget",
        );
      }
    }

    const brief = input.priorBrief
      ? mergeBriefs(input.priorBrief, aiBrief)
      : aiBrief;

    return {
      brief,
      longTermPreferenceHints: d.longTermPreferenceHints ?? undefined,
      usedAi: true,
    };
  } catch (err) {
    console.error("AI understand failed, using rules", err);
    return fallback;
  }
}
