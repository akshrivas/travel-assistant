import { discoverOptions } from "@/lib/adapters/registry";
import { understandWithAi } from "@/lib/ai/understand";
import { craftAssistantReply } from "@/lib/ai/reply";
import { isAiEnabled } from "@/lib/ai/client";
import { formatPrice, recommendOptions } from "@/lib/engine/recommend";
import type {
  CustomerProfileView,
  RankedOption,
  TravelEnquiryBrief,
} from "@/lib/types/travel";

export type AssistantTurnResult = {
  reply: string;
  brief: TravelEnquiryBrief;
  shortlist: RankedOption[];
  stage: "clarify" | "shortlist" | "empty" | "out_of_market";
  profileConfidence: number;
  usedAi: boolean;
  /** Safe long-term hints only — caller may merge carefully into profile */
  longTermPreferenceHints?: {
    partyType?: string | null;
    pace?: string | null;
    interests?: string[] | null;
    avoidances?: string[] | null;
    hotel?: string | null;
  } | null;
};

const emptyProfile = (): CustomerProfileView => ({
  knowledgeConfidence: 0.15,
  budgetCurrency: "INR",
  preferredLanguage: "en",
});

/**
 * Orchestration:
 * Understand (AI+rules) → Clarify if needed → Stitch market → Rank → Personalized reply
 */
export async function runAssistantTurn(input: {
  message: string;
  priorBrief?: TravelEnquiryBrief | null;
  profile?: CustomerProfileView | null;
}): Promise<AssistantTurnResult> {
  const profile = input.profile ?? emptyProfile();
  const understood = await understandWithAi({
    message: input.message,
    priorBrief: input.priorBrief,
    profile,
  });
  const brief = understood.brief;

  const missing: string[] = [];
  if (!brief.destination && !brief.preferences?.vibe) missing.push("destination");
  if (!brief.durationDays) missing.push("duration");
  if (!brief.budgetMax && !brief.budgetMin) missing.push("budget");
  brief.missingInformation = [...new Set([...(brief.missingInformation || []), ...missing])];

  // Recompute missing after profile soft-fill from AI layer
  const stillMissing = [...brief.missingInformation];
  if (brief.destination || brief.preferences?.vibe) {
    const i = stillMissing.indexOf("destination");
    if (i >= 0) stillMissing.splice(i, 1);
  }
  if (brief.durationDays) {
    const i = stillMissing.indexOf("duration");
    if (i >= 0) stillMissing.splice(i, 1);
  }
  if (brief.budgetMax != null || brief.budgetMin != null) {
    const i = stillMissing.indexOf("budget");
    if (i >= 0) stillMissing.splice(i, 1);
  }
  brief.missingInformation = stillMissing;

  const profileConf = profile.knowledgeConfidence;
  const needClarify =
    brief.confidence < 0.55 ||
    stillMissing.includes("destination") ||
    (stillMissing.length >= 2 && !brief.destination);

  if (needClarify && stillMissing.length) {
    const fallback = buildClarifyReply(brief, profile, stillMissing);
    const reply = await craftAssistantReply({
      stage: "clarify",
      brief,
      profile,
      missing: stillMissing,
      fallback,
    });
    return {
      reply,
      brief,
      shortlist: [],
      stage: "clarify",
      profileConfidence: profileConf,
      usedAi: understood.usedAi || isAiEnabled(),
      longTermPreferenceHints: understood.longTermPreferenceHints,
    };
  }

  const options = await discoverOptions(brief);
  if (!options.length) {
    const vibe = brief.preferences?.vibe;
    const fallback = brief.destination
      ? `Searched live India listings for ${brief.destination}, but nothing strong enough came back for that brief. Try a nearby area or a more flexible budget — I won’t invent inventory.`
      : vibe
        ? `I can search live ${String(vibe)} stays in India — which destination are you leaning toward?`
        : "Where in India, roughly how many days, and what’s the budget?";
    const reply = await craftAssistantReply({
      stage: "empty",
      brief,
      profile,
      fallback,
    });
    return {
      reply,
      brief,
      shortlist: [],
      stage: "empty",
      profileConfidence: profileConf,
      usedAi: understood.usedAi || isAiEnabled(),
      longTermPreferenceHints: understood.longTermPreferenceHints,
    };
  }

  const shortlist = recommendOptions(options, brief, profile);
  const fallback = buildShortlistReply(brief, profile, shortlist, options.length);
  const reply = await craftAssistantReply({
    stage: "shortlist",
    brief,
    profile,
    shortlist,
    totalFound: options.length,
    fallback,
  });

  return {
    reply,
    brief: { ...brief, confidence: Math.max(brief.confidence, 0.7) },
    shortlist,
    stage: "shortlist",
    profileConfidence: profileConf,
    usedAi: understood.usedAi || isAiEnabled(),
    longTermPreferenceHints: understood.longTermPreferenceHints,
  };
}

function buildClarifyReply(
  brief: TravelEnquiryBrief,
  profile: CustomerProfileView,
  missing: string[],
): string {
  const known: string[] = [];
  if (profile.partyType) known.push(`usually ${profile.partyType}`);
  if (profile.budgetMax) {
    known.push(
      `usual range ~${formatPrice(profile.budgetMin ?? 0, profile.budgetCurrency ?? "INR")}–${formatPrice(profile.budgetMax, profile.budgetCurrency ?? "INR")}`,
    );
  }

  const confLine =
    profile.knowledgeConfidence < 0.4
      ? "Need a couple of details so I can search the live market properly."
      : "Got your usual prefs — just need what’s missing for this trip.";

  const ask: string[] = [];
  if (missing.includes("destination")) ask.push("Where in India?");
  if (missing.includes("duration")) ask.push("How many days?");
  if (missing.includes("budget")) {
    ask.push(
      profile.budgetMax
        ? "Same budget band as usual, or different this time?"
        : "Rough budget for this trip?",
    );
  }

  return [
    confLine,
    known.length ? `(${known.join("; ")}.)` : null,
    brief.destination ? `${brief.destination} noted.` : null,
    ask.slice(0, 2).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function buildShortlistReply(
  brief: TravelEnquiryBrief,
  profile: CustomerProfileView,
  shortlist: RankedOption[],
  totalFound: number,
): string {
  const who =
    profile.knowledgeConfidence >= 0.5
      ? "based on what I know about you and this trip"
      : "based on this trip brief";

  const lines = shortlist.map((r, i) => {
    const price = formatPrice(r.option.price.amount, r.option.price.currency);
    const player = r.option.player
      ? ` · ${r.option.player.name} (${r.option.player.rating ?? "–"}★)`
      : "";
    return `${i + 1}. **${r.label ?? "Option"}** — ${r.option.destination}, ${r.option.durationDays} days, ${price}${player}\n   ${r.reason}`;
  });

  const budgetNote =
    brief.temporary?.budgetMax != null
      ? " (using this trip’s budget as temporary — not changing your long-term profile)"
      : "";

  return [
    `Compared ${totalFound} live listings and shortlisted ${shortlist.length} strong picks ${who}${budgetNote}:`,
    "",
    ...lines,
    "",
    "Prices/availability can change — confirm on the source link. Which one should I enquire about?",
  ].join("\n");
}
