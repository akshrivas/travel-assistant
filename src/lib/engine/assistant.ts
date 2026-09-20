import { discoverOptions } from "@/lib/adapters/registry";
import { understandWithAi } from "@/lib/ai/understand";
import { craftAssistantReply } from "@/lib/ai/reply";
import { isAiEnabled } from "@/lib/ai/client";
import { recommendOptions } from "@/lib/engine/recommend";
import {
  briefReadyForSearch,
  softFillFromProfile,
} from "@/lib/engine/trip-form";
import {
  matchShortlistOption,
  optionDisplayName,
  wantsEnquireConfirm,
  wantsNewShortlist,
} from "@/lib/engine/select-option";
import { extractLockedDestination } from "@/lib/engine/understand";
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
    | "trip_form"
    | "selected"
    | "enquire";
  /** Matched shortlist pick — client may auto-create enquiry */
  selectedOption?: RankedOption | null;
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
  /** Last shortlist — so chat can lock a hotel into enquire/connect */
  priorShortlist?: RankedOption[] | null;
}): Promise<AssistantTurnResult> {
  const profile = input.profile ?? emptyProfile();
  const history = input.history || [];
  const priorShortlist = input.priorShortlist || [];
  const understood = await understandWithAi({
    message: input.message,
    priorBrief: input.priorBrief,
    profile,
    history,
  });
  let brief = softFillFromProfile(understood.brief, profile);
  const kind = understood.conversationKind;
  const profileConf = profile.knowledgeConfidence;

  // Hotel / option pick from existing shortlist — before chat or re-search
  if (priorShortlist.length) {
    const picked = matchShortlistOption(input.message, priorShortlist);
    if (picked) {
      return buildSelectedResult({
        picked,
        shortlist: priorShortlist,
        brief,
        profile,
        profileConf,
        usedAi: understood.usedAi || isAiEnabled(),
        longTermPreferenceHints: understood.longTermPreferenceHints,
      });
    }

    const selectedId = String(brief.preferences?.selectedOptionId || "");
    if (selectedId && wantsEnquireConfirm(input.message)) {
      const pickedConfirm =
        priorShortlist.find((s) => s.option.id === selectedId) ||
        priorShortlist[0];
      if (pickedConfirm) {
        return buildEnquireResult({
          picked: pickedConfirm,
          shortlist: priorShortlist,
          brief,
          profile,
          profileConf,
          usedAi: understood.usedAi || isAiEnabled(),
        });
      }
    }

    // Keep shortlist alive for follow-ups — don't re-search unless asked
    if (
      brief.preferences?.formCompleted &&
      !wantsNewShortlist(input.message)
    ) {
      const newDest = extractLockedDestination(input.message);
      if (
        newDest &&
        brief.destination &&
        newDest.toLowerCase() !== brief.destination.toLowerCase()
      ) {
        // New destination lock — reopen trip form
        brief = {
          ...brief,
          destination: newDest,
          preferences: {
            ...brief.preferences,
            formCompleted: false,
            awaitingTripForm: true,
            selectedOptionId: undefined,
            selectedStay: undefined,
          },
          missingInformation: ["duration", "budget", "travellers", "vibe"],
        };
      } else {
        const fallback =
          profile.preferredLanguage === "en"
            ? "Still looking at your shortlist — name a stay to lock it, or tap Enquire. I connect you for a quotation; I don’t take bookings myself."
            : "Shortlist pe hi hain — hotel ka naam bolo ya Enquire dabao. Main quotation ke liye connect karta hoon; khud booking nahi leta.";
        const reply = await craftAssistantReply({
          stage: "shortlist",
          conversationKind: "travel_plan",
          userMessage: input.message,
          history,
          brief,
          profile,
          shortlist: priorShortlist,
          fallback,
        });
        return {
          reply,
          brief,
          shortlist: priorShortlist,
          stage: "shortlist",
          conversationKind: "travel_plan",
          profileConfidence: profileConf,
          usedAi: understood.usedAi || isAiEnabled(),
          longTermPreferenceHints: understood.longTermPreferenceHints,
        };
      }
    }
  }

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
        ? `**${dest}** locked. Fill the quick brief below (dates, who’s going, budget, vibe) — then I’ll pull **3 hotel quotations** from the live market.`
        : `**${dest}** lock. Neeche short form bhar do (kab/din, kaun, budget, vibe) — phir live market se **3 hotel quotations** laata hoon.`;
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

function buildSelectedResult(input: {
  picked: RankedOption;
  shortlist: RankedOption[];
  brief: TravelEnquiryBrief;
  profile: CustomerProfileView;
  profileConf: number;
  usedAi: boolean;
  longTermPreferenceHints: AssistantTurnResult["longTermPreferenceHints"];
}): AssistantTurnResult {
  const name = optionDisplayName(input.picked);
  const hi = input.profile.preferredLanguage !== "en";
  const url = input.picked.option.source?.url;
  const reply = hi
    ? `**${name}** lock — enquiry/connect chalu. Provider se quotation aayegi; main inventory/booking nahi leta.${url ? ` Listing: ${url}` : ""} Dates/guests pehle se trip brief mein hain.`
    : `**${name}** locked — enquiry/connect started. You’ll get a quotation path; I don’t own inventory or take bookings.${url ? ` Listing: ${url}` : ""} Dates/guests are already on your trip brief.`;

  return {
    reply,
    brief: {
      ...input.brief,
      preferences: {
        ...input.brief.preferences,
        conversationKind: "travel_plan",
        selectedOptionId: input.picked.option.id,
        selectedStay: name,
        formCompleted: true,
        enquireRequested: true,
      },
    },
    shortlist: input.shortlist,
    selectedOption: input.picked,
    stage: "selected",
    conversationKind: "travel_plan",
    profileConfidence: input.profileConf,
    usedAi: input.usedAi,
    longTermPreferenceHints: input.longTermPreferenceHints,
  };
}

function buildEnquireResult(input: {
  picked: RankedOption;
  shortlist: RankedOption[];
  brief: TravelEnquiryBrief;
  profile: CustomerProfileView;
  profileConf: number;
  usedAi: boolean;
}): AssistantTurnResult {
  const name = optionDisplayName(input.picked);
  const hi = input.profile.preferredLanguage !== "en";
  const reply = hi
    ? `**${name}** pe enquiry chalu. Provider se quotation connect ho jayegi — status yahin dikhega. Confirm listing pe bhi check kar lena.`
    : `Enquiry started for **${name}**. I’ll connect for a quotation — status shows here. Always re-check the listing before you commit.`;

  return {
    reply,
    brief: {
      ...input.brief,
      preferences: {
        ...input.brief.preferences,
        conversationKind: "travel_plan",
        selectedOptionId: input.picked.option.id,
        selectedStay: name,
        formCompleted: true,
        enquireRequested: true,
      },
    },
    shortlist: input.shortlist,
    selectedOption: input.picked,
    stage: "enquire",
    conversationKind: "travel_plan",
    profileConfidence: input.profileConf,
    usedAi: input.usedAi,
    longTermPreferenceHints: null,
  };
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
  // Deterministic shortlist copy — AI was inventing prices/URLs that fought the cards
  const reply = fallback;

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
  _shortlist: RankedOption[],
  totalFound: number,
): string {
  const count = Math.min(3, _shortlist.length || 3);
  const who =
    profile.knowledgeConfidence >= 0.5
      ? "based on what I know about you and this trip"
      : "based on this trip brief";

  const budgetNote =
    brief.temporary?.budgetMax != null
      ? " (using this trip’s budget as temporary — not changing your long-term profile)"
      : "";

  return [
    `Live market se ${totalFound} hotel listings check ki — **${count} best quotations** neeche cards mein hain ${who}${budgetNote}.`,
    "",
    "Price listing pe confirm karo (change ho sakti hai). Enquire dabao → connect path + listing khulegi.",
  ].join("\n");
}
