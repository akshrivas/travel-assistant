import { discoverOptions } from "@/lib/adapters/registry";
import { understandWithAi } from "@/lib/ai/understand";
import { craftAssistantReply } from "@/lib/ai/reply";
import { isAiEnabled } from "@/lib/ai/client";
import { formatPrice, recommendOptions } from "@/lib/engine/recommend";
import {
  briefReadyForSearch,
  softFillFromProfile,
} from "@/lib/engine/trip-form";
import type {
  CustomerProfileView,
  RankedOption,
  TravelEnquiryBrief,
} from "@/lib/types/travel";

export type AssistantTurnResult = {
  reply: string;
  brief: TravelEnquiryBrief;
  shortlist: RankedOption[];
  stage:
    | "clarify"
    | "shortlist"
    | "empty"
    | "out_of_market"
    | "chat"
    | "trip_form";
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
 * Understand → chat OR destination→trip form OR search→shortlist
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
  let brief = softFillFromProfile(understood.brief, profile);
  const kind = understood.conversationKind;
  const profileConf = profile.knowledgeConfidence;

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

  // No destination yet — ask only for that (form comes after lock)
  if (!brief.destination && !brief.preferences?.vibe) {
    const fallback =
      profile.preferredLanguage === "en"
        ? "Where in India are you thinking of going? Once destination is locked, I’ll take the rest on a short form."
        : "India mein kahan soch rahe ho? Destination lock hote hi baaki short form pe le lunga.";
    const reply = await craftAssistantReply({
      stage: "clarify",
      conversationKind: "travel_plan",
      userMessage: input.message,
      history,
      brief,
      profile,
      missing: ["destination"],
      fallback,
    });
    return {
      reply,
      brief: { ...brief, missingInformation: ["destination"] },
      shortlist: [],
      stage: "clarify",
      conversationKind: "travel_plan",
      profileConfidence: profileConf,
      usedAi: understood.usedAi || isAiEnabled(),
      longTermPreferenceHints: understood.longTermPreferenceHints,
    };
  }

  // Destination locked → always show trip form until user submits it
  // (soft-filled profile fields must not skip the form)
  if (
    (brief.destination || brief.preferences?.vibe) &&
    !brief.preferences?.formCompleted
  ) {
    const dest = brief.destination || String(brief.preferences?.vibe || "your trip");
    const reply =
      profile.preferredLanguage === "en"
        ? `**${dest}** locked. Fill the quick brief below (dates, who’s going, budget, vibe, flights) — then I’ll search the live market.`
        : `**${dest}** lock. Neeche short form bhar do (kab/din, kaun, budget, vibe, flights) — phir live market se shortlist laata hoon.`;
    return {
      reply,
      brief: {
        ...brief,
        missingInformation: ["duration", "budget", "travellers", "vibe"],
        preferences: { ...brief.preferences, awaitingTripForm: true },
      },
      shortlist: [],
      stage: "trip_form",
      conversationKind: "travel_plan",
      profileConfidence: profileConf,
      usedAi: understood.usedAi || isAiEnabled(),
      longTermPreferenceHints: understood.longTermPreferenceHints,
    };
  }

  return searchAndShortlist({
    brief,
    profile,
    profileConf,
    history,
    userMessage: input.message,
    usedAi: understood.usedAi || isAiEnabled(),
    longTermPreferenceHints: understood.longTermPreferenceHints,
  });
}

/** After trip form submit — search existing market with complete brief */
export async function runTripFormSearch(input: {
  brief: TravelEnquiryBrief;
  profile?: CustomerProfileView | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AssistantTurnResult> {
  const profile = input.profile ?? emptyProfile();
  const brief = {
    ...input.brief,
    preferences: {
      ...(input.brief.preferences || {}),
      formCompleted: true,
      conversationKind: "travel_plan",
    },
    confidence: Math.max(input.brief.confidence || 0, 0.85),
    missingInformation: [],
  };

  if (!briefReadyForSearch(brief)) {
    return {
      reply:
        profile.preferredLanguage === "en"
          ? "Need duration, who’s going, and a budget band before I search."
          : "Search se pehle din, kaun jaa raha, aur budget band chahiye.",
      brief,
      shortlist: [],
      stage: "trip_form",
      conversationKind: "travel_plan",
      profileConfidence: profile.knowledgeConfidence,
      usedAi: false,
      longTermPreferenceHints: null,
    };
  }

  return searchAndShortlist({
    brief,
    profile,
    profileConf: profile.knowledgeConfidence,
    history: input.history || [],
    userMessage: `Trip brief ready for ${brief.destination}`,
    usedAi: isAiEnabled(),
    longTermPreferenceHints: null,
  });
}

async function searchAndShortlist(input: {
  brief: TravelEnquiryBrief;
  profile: CustomerProfileView;
  profileConf: number;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  usedAi: boolean;
  longTermPreferenceHints: AssistantTurnResult["longTermPreferenceHints"];
}): Promise<AssistantTurnResult> {
  const { brief, profile, profileConf, history, userMessage } = input;

  const options = await discoverOptions(brief);
  if (!options.length) {
    const fallback = brief.destination
      ? `Searched live India listings for ${brief.destination}, but nothing strong enough came back. Try flexible dates/budget — I won’t invent inventory.`
      : "Need a destination to search the market.";
    const reply = await craftAssistantReply({
      stage: "empty",
      conversationKind: "travel_plan",
      userMessage,
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
      usedAi: input.usedAi,
      longTermPreferenceHints: input.longTermPreferenceHints,
    };
  }

  const shortlist = recommendOptions(options, brief, profile);
  const fallback = buildShortlistReply(brief, profile, shortlist, options.length);
  const reply = await craftAssistantReply({
    stage: "shortlist",
    conversationKind: "travel_plan",
    userMessage,
    history,
    brief,
    profile,
    shortlist,
    totalFound: options.length,
    fallback,
  });

  return {
    reply,
    brief: { ...brief, confidence: Math.max(brief.confidence, 0.85) },
    shortlist,
    stage: "shortlist",
    conversationKind: "travel_plan",
    profileConfidence: profileConf,
    usedAi: input.usedAi,
    longTermPreferenceHints: input.longTermPreferenceHints,
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
