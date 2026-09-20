import { z } from "zod";
import { defaultModel, getOpenAI, isAiEnabled } from "@/lib/ai/client";
import {
  detectConversationKind,
  mergeBriefs,
  understandTravelEnquiry,
} from "@/lib/engine/understand";
import type {
  CustomerProfileView,
  TravelEnquiryBrief,
} from "@/lib/types/travel";

const briefSchema = z.object({
  conversationKind: z
    .enum(["travel_plan", "chat", "profile", "meta"])
    .optional()
    .nullable(),
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
  conversationKind: "travel_plan" | "chat" | "profile" | "meta";
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
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AiUnderstandResult> {
  const ruleKind = detectConversationKind(input.message);
  const fallback = (() => {
    const extracted = understandTravelEnquiry(
      input.message,
      input.priorBrief ?? undefined,
    );
    const brief = input.priorBrief
      ? mergeBriefs(input.priorBrief, extracted)
      : extracted;
    const kind =
      (extracted.preferences?.conversationKind as AiUnderstandResult["conversationKind"]) ||
      ruleKind;
    return { brief, conversationKind: kind, usedAi: false as const };
  })();

  const openai = getOpenAI();
  if (!isAiEnabled() || !openai) return fallback;

  try {
    const profile = input.profile;
    const system = `You are the understanding layer of a Personal Travel Assistant (India).
First classify conversationKind, THEN extract a travel brief only if relevant.
You receive recent conversation history — use it so follow-ups stay coherent
(e.g. user said they haven't seen the sea → beach interest).

conversationKind:
- travel_plan — planning / refining a trip
- profile — name, prefs, what you remember
- meta — what you are / how you work
- chat — greetings, thanks, general talk, wishes without a concrete trip ask yet

Critical rules:
- If NOT travel_plan: confidence=0, missingInformation=[], do NOT invent trip field needs.
- Prefer English field values. Budget in INR absolute (60000 not 60).
- Carry forward destinations/vibe implied by recent history when user is clearly continuing that thread.
- Do not invent destinations the user didn't imply.
Return JSON only.`;

    const userPayload = {
      message: input.message,
      heuristicKind: ruleKind,
      recentHistory: (input.history || []).slice(-10),
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
      temperature: 0.15,
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
    // Prefer heuristic when it clearly says non-travel — don't let model force trip funnel
    const conversationKind: AiUnderstandResult["conversationKind"] =
      ruleKind !== "travel_plan"
        ? ruleKind
        : d.conversationKind || ruleKind;

    if (conversationKind !== "travel_plan") {
      const brief = input.priorBrief
        ? mergeBriefs(input.priorBrief, {
            intent: conversationKind,
            confidence: 0,
            missingInformation: [],
            preferences: { conversationKind },
            rawText: input.message,
          })
        : {
            intent: conversationKind,
            confidence: 0,
            missingInformation: [],
            preferences: { conversationKind },
            budgetCurrency: "INR",
            rawText: input.message,
          };
      return {
        brief,
        conversationKind,
        longTermPreferenceHints: undefined,
        usedAi: true,
      };
    }

    const aiBrief: TravelEnquiryBrief = {
      intent: d.intent ?? "leisure_trip",
      destination: d.destination ?? undefined,
      datesText: d.datesText ?? undefined,
      durationDays: d.durationDays ?? undefined,
      travellers: d.travellers ?? undefined,
      partyType: d.partyType ?? undefined,
      budgetMin: d.budgetMin ?? undefined,
      budgetMax: d.budgetMax ?? undefined,
      budgetCurrency: d.budgetCurrency ?? "INR",
      travelStyle: d.travelStyle ?? undefined,
      preferences: {
        ...(d.preferences ?? {}),
        conversationKind: "travel_plan",
      },
      constraints: d.constraints ?? {},
      temporary: d.temporary ?? {},
      confidence: d.confidence,
      missingInformation: d.missingInformation ?? [],
      rawText: input.message,
    };

    if (!aiBrief.partyType && profile?.partyType) {
      aiBrief.partyType = profile.partyType;
    }
    if (
      aiBrief.budgetMax == null &&
      aiBrief.budgetMin == null &&
      !aiBrief.temporary?.budgetMax &&
      profile?.budgetMax &&
      (profile.knowledgeConfidence ?? 0) >= 0.45
    ) {
      aiBrief.budgetMin = profile.budgetMin ?? undefined;
      aiBrief.budgetMax = profile.budgetMax ?? undefined;
      aiBrief.missingInformation = (aiBrief.missingInformation || []).filter(
        (m) => m !== "budget",
      );
    }

    const brief = input.priorBrief
      ? mergeBriefs(input.priorBrief, aiBrief)
      : aiBrief;

    return {
      brief,
      conversationKind: "travel_plan",
      longTermPreferenceHints: d.longTermPreferenceHints ?? undefined,
      usedAi: true,
    };
  } catch (err) {
    console.error("AI understand failed, using rules", err);
    return fallback;
  }
}
