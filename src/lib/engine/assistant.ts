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
  stage: "clarify" | "shortlist" | "empty" | "out_of_market" | "chat";
  profileConfidence: number;
  usedAi: boolean;
  conversationKind?: "travel_plan" | "chat" | "profile" | "meta";
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
 * Understand → if chat/profile/meta, reply conversationally
 * else Clarify → Stitch market → Rank → Personalized reply
 */
export async function runAssistantTurn(input: {
  message: string;
  priorBrief?: TravelEnquiryBrief | null;
  profile?: CustomerProfileView | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AssistantTurnResult> {
  const profile = input.profile ?? emptyProfile();
  const history = input.history || [];
  const understood = await understandWithAi({
    message: input.message,
    priorBrief: input.priorBrief,
    profile,
    history,
  });
  const brief = understood.brief;
  const kind = understood.conversationKind;
  const profileConf = profile.knowledgeConfidence;

  // —— Smart chat path: never force a trip funnel ——
  if (kind !== "travel_plan") {
    const fallback = buildChatFallback(kind, input.message, profile, history);
    const reply = await craftAssistantReply({
      stage: "chat",
      conversationKind: kind,
      userMessage: input.message,
      history,
      brief,
      profile,
      fallback,
    });
    return {
      reply,
      brief,
      shortlist: [],
      stage: "chat",
      conversationKind: kind,
      profileConfidence: profileConf,
      usedAi: understood.usedAi || isAiEnabled(),
      longTermPreferenceHints: null,
    };
  }

  const missing: string[] = [];
  if (!brief.destination && !brief.preferences?.vibe) missing.push("destination");
  if (!brief.durationDays) missing.push("duration");
  if (!brief.budgetMax && !brief.budgetMin) missing.push("budget");
  brief.missingInformation = [
    ...new Set([...(brief.missingInformation || []), ...missing]),
  ];

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

  const needClarify =
    brief.confidence < 0.55 ||
    stillMissing.includes("destination") ||
    (stillMissing.length >= 2 && !brief.destination);

  if (needClarify && stillMissing.length) {
    const fallback = buildClarifyReply(brief, profile, stillMissing);
    const reply = await craftAssistantReply({
      stage: "clarify",
      conversationKind: "travel_plan",
      userMessage: input.message,
      history,
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
      conversationKind: "travel_plan",
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
      conversationKind: "travel_plan",
      userMessage: input.message,
      history,
      brief,
      profile,
      fallback,
    });
    return {
      reply,
      brief,
      shortlist: [],
      stage: "empty",
      conversationKind: "travel_plan",
      profileConfidence: profileConf,
      usedAi: understood.usedAi || isAiEnabled(),
      longTermPreferenceHints: understood.longTermPreferenceHints,
    };
  }

  const shortlist = recommendOptions(options, brief, profile);
  const fallback = buildShortlistReply(brief, profile, shortlist, options.length);
  const reply = await craftAssistantReply({
    stage: "shortlist",
    conversationKind: "travel_plan",
    userMessage: input.message,
    history,
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
    conversationKind: "travel_plan",
    profileConfidence: profileConf,
    usedAi: understood.usedAi || isAiEnabled(),
    longTermPreferenceHints: understood.longTermPreferenceHints,
  };
}

function buildChatFallback(
  kind: "chat" | "profile" | "meta",
  message: string,
  profile: CustomerProfileView,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): string {
  const name = profile.displayName?.trim();
  const lower = message.toLowerCase();
  const priorUser = [...history]
    .reverse()
    .find((h) => h.role === "user")?.content;

  if (kind === "profile" || /name|naam|who am i|know me|remember/.test(lower)) {
    if (name) {
      const bits: string[] = [`You’re **${name}** on TripSaathi.`];
      if (profile.partyType) bits.push(`Usually ${profile.partyType} trips.`);
      if (profile.homeLocation) bits.push(`Home base: ${profile.homeLocation}.`);
      if (profile.preferredDestinations?.length) {
        bits.push(
          `On your radar: ${profile.preferredDestinations.slice(0, 3).join(", ")}.`,
        );
      }
      if (priorUser && !/name|naam/.test(priorUser.toLowerCase())) {
        bits.push(`Last you mentioned: “${priorUser.slice(0, 60)}${priorUser.length > 60 ? "…" : ""}”.`);
      }
      bits.push("Whenever you’re ready to plan, just throw me a destination.");
      return bits.join(" ");
    }
    return "I don’t have a name saved for you yet — update it in Preferences, or just tell me what to call you.";
  }

  if (kind === "meta") {
    return "I’m TripSaathi — your personal travel companion for India. I remember this chat on your device, search live listings, and shortlist what fits you. Chat anytime; when you want a trip, share destination, days, and budget.";
  }

  if (/thank|shukriya|thanks/.test(lower)) {
    return "Anytime. I’m right here in this thread whenever you want to continue.";
  }
  if (/hi|hello|hey|namaste|good (morning|afternoon|evening)/.test(lower)) {
    if (priorUser) {
      return `Hey${name ? ` ${name.split(" ")[0]}` : ""} — still here. We were on “${priorUser.slice(0, 48)}${priorUser.length > 48 ? "…" : ""}”. Want to pick that up?`;
    }
    return name
      ? `Hey ${name.split(" ")[0]} — good to see you. What’s on your mind?`
      : "Hey — good to see you. What’s on your mind?";
  }

  if (/samundar|sea|beach|ocean/.test(lower)) {
    return "Got it — you still haven’t seen the sea. When you’re ready, I can shortlist calm coastal stays (Goa, Kerala, Andaman…) around your usual budget.";
  }

  return "Got it — I’m following this thread. Tell me more, or share a destination whenever you want options.";
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
