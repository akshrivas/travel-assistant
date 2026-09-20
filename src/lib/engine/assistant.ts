import { discoverOptions } from "@/lib/adapters/registry";
import {
  mergeBriefs,
  understandTravelEnquiry,
} from "@/lib/engine/understand";
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
};

const emptyProfile = (): CustomerProfileView => ({
  knowledgeConfidence: 0.15,
  budgetCurrency: "INR",
  preferredLanguage: "en",
});

/**
 * M1 orchestration:
 * Understand → (ask if needed) → Stitch market → Compare → Shortlist
 */
export async function runAssistantTurn(input: {
  message: string;
  priorBrief?: TravelEnquiryBrief | null;
  profile?: CustomerProfileView | null;
}): Promise<AssistantTurnResult> {
  const profile = input.profile ?? emptyProfile();
  const extracted = understandTravelEnquiry(input.message, input.priorBrief ?? undefined);
  const brief = input.priorBrief
    ? mergeBriefs(input.priorBrief, extracted)
    : extracted;

  // Recompute missing on merged
  const missing: string[] = [];
  if (!brief.destination && !brief.preferences?.vibe) missing.push("destination");
  if (!brief.durationDays) missing.push("duration");
  if (!brief.budgetMax && !brief.budgetMin) missing.push("budget");
  brief.missingInformation = missing;

  const profileConf = profile.knowledgeConfidence;
  const needClarify =
    brief.confidence < 0.55 ||
    missing.includes("destination") ||
    (missing.length >= 2 && !brief.destination);

  if (needClarify && missing.length) {
    return {
      reply: buildClarifyReply(brief, profile, missing),
      brief,
      shortlist: [],
      stage: "clarify",
      profileConfidence: profileConf,
    };
  }

  const options = await discoverOptions(brief);
  if (!options.length) {
    const vibe = brief.preferences?.vibe;
    if (!brief.destination && vibe) {
      return {
        reply: `I can look for ${String(vibe)} trips in India — which destination are you leaning toward, or should I shortlist a few strong regions?`,
        brief: { ...brief, missingInformation: ["destination"] },
        shortlist: [],
        stage: "clarify",
        profileConfidence: profileConf,
      };
    }
    return {
      reply: brief.destination
        ? `I searched available India market sources for ${brief.destination}, but I don’t have strong options yet for that brief. Share a nearby destination or a flexible budget and I’ll try again — I won’t invent inventory.`
        : "Tell me where in India you’d like to go (or a vibe like beach / mountains), roughly how many days, and your budget — I’ll compare what’s available.",
      brief,
      shortlist: [],
      stage: "empty",
      profileConfidence: profileConf,
    };
  }

  const shortlist = recommendOptions(options, brief, profile);
  const reply = buildShortlistReply(brief, profile, shortlist, options.length);

  return {
    reply,
    brief: { ...brief, confidence: Math.max(brief.confidence, 0.7) },
    shortlist,
    stage: "shortlist",
    profileConfidence: profileConf,
  };
}

function buildClarifyReply(
  brief: TravelEnquiryBrief,
  profile: CustomerProfileView,
  missing: string[],
): string {
  const known: string[] = [];
  if (profile.displayName) known.push(`I know you as ${profile.displayName}`);
  if (profile.partyType) known.push(`you usually travel ${profile.partyType}`);
  if (profile.budgetMax) {
    known.push(
      `your usual range is around ${formatPrice(profile.budgetMin ?? 0, profile.budgetCurrency ?? "INR")}–${formatPrice(profile.budgetMax, profile.budgetCurrency ?? "INR")}`,
    );
  }

  const confLine =
    profile.knowledgeConfidence < 0.4
      ? "You’re new to me — I need a couple of details to recommend well."
      : "I already know some of what you usually prefer; I just need what’s missing for this trip.";

  const ask: string[] = [];
  if (missing.includes("destination")) {
    ask.push("Where in India do you want to go?");
  }
  if (missing.includes("duration")) ask.push("How many days?");
  if (missing.includes("budget")) {
    ask.push(
      profile.budgetMax
        ? "Is this trip within your usual budget, or a different amount this time?"
        : "What’s your approximate budget for this trip?",
    );
  }
  if (missing.includes("travellers") && !brief.partyType) {
    ask.push("Solo, couple, family, or friends?");
  }

  const parts = [
    confLine,
    known.length ? `So far: ${known.join("; ")}.` : null,
    brief.destination ? `Destination noted: ${brief.destination}.` : null,
    ask.slice(0, 2).join(" "),
  ];
  return parts.filter(Boolean).join(" ");
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
    const fresh = ` · checked ${new Date(r.option.source.lastCheckedAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    return `${i + 1}. **${r.label ?? "Option"}** — ${r.option.destination}, ${r.option.durationDays} days, ${price}${player}\n   ${r.reason}${fresh}\n   Source: ${r.option.source.name}`;
  });

  const budgetNote =
    brief.temporary?.budgetMax != null
      ? " (using this trip’s budget as temporary — not changing your long-term profile)"
      : "";

  return [
    `I compared ${totalFound} available options from market sources and shortlisted ${shortlist.length} strong deals ${who}${budgetNote}:`,
    "",
    ...lines,
    "",
    "Prices and inclusions are as reported by sources and subject to confirmation. Tell me which option interests you and I’ll help you enquire/connect — I don’t invent inventory; I stitch what’s already working.",
  ].join("\n");
}
