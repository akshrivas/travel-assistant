import type { TravelEnquiryBrief } from "@/lib/types/travel";

export type ConversationKind =
  | "travel_plan"
  | "chat"
  | "profile"
  | "meta";

/**
 * Detect whether this turn is actually about planning a trip,
 * or general / profile / meta conversation.
 */
export function detectConversationKind(text: string): ConversationKind {
  const lower = text.toLowerCase().trim();

  // Profile / identity
  if (
    /what(?:'s| is)? my name|mera naam|who am i|do you (?:even )?know (?:me|my name)|what do you (?:know|remember) about me|my preferences|mera profile|what.?ve you (?:got|saved)/i.test(
      lower,
    )
  ) {
    return "profile";
  }

  // Meta about the product
  if (
    /what (?:can|do) you do|how do you work|who are you|are you (?:an? )?(?:ai|bot)|kya kar sakte|tum kaun/.test(
      lower,
    )
  ) {
    return "meta";
  }

  // Small talk / gratitude / greetings without trip content
  const hasTravelSignal =
    /\b(trip|travel|holiday|vacation|jaana|ghumna|plan|destination|hotel|stay|flight|budget|days?|din|nights?|goa|kashmir|kerala|manali|shimla|rajasthan|ladakh|andaman|beach|pahad|honeymoon|family trip|weekend)\b/i.test(
      lower,
    ) || /\d+\s*k\b/.test(lower);

  if (
    !hasTravelSignal &&
    /^(hi|hello|hey|hola|namaste|thanks|thank you|ok|okay|cool|nice|great|haan|ji|bye|good morning|good evening|kaise ho|how are you)[\s!.?]*$/i.test(
      lower,
    )
  ) {
    return "chat";
  }

  if (!hasTravelSignal && lower.length < 80) {
    // Short non-travel questions → chat (e.g. "what is my name?", "tell me a joke")
    if (
      /^(what|who|why|how|when|where|do you|can you|tell me|are you|kya|kaun|kyun)\b/i.test(
        lower,
      )
    ) {
      return "chat";
    }
  }

  if (hasTravelSignal) return "travel_plan";

  // Default: if no travel cues, treat as chat — never force a trip funnel
  return "chat";
}

/**
 * Rule-based NL understanding for V1 (LLM tool can replace later).
 * Outputs structured brief + confidence + missingInformation.
 */
export function understandTravelEnquiry(
  text: string,
  prior?: Partial<TravelEnquiryBrief>,
): TravelEnquiryBrief {
  const kind = detectConversationKind(text);
  const lower = text.toLowerCase();

  if (kind !== "travel_plan") {
    return {
      intent: kind,
      destination: prior?.destination,
      datesText: prior?.datesText,
      durationDays: prior?.durationDays,
      travellers: prior?.travellers,
      partyType: prior?.partyType,
      budgetMin: prior?.budgetMin,
      budgetMax: prior?.budgetMax,
      budgetCurrency: prior?.budgetCurrency ?? "INR",
      travelStyle: prior?.travelStyle,
      preferences: { ...(prior?.preferences ?? {}), conversationKind: kind },
      constraints: { ...(prior?.constraints ?? {}) },
      temporary: { ...(prior?.temporary ?? {}) },
      confidence: 0,
      missingInformation: [],
      rawText: text,
    };
  }

  const brief: TravelEnquiryBrief = {
    intent: prior?.intent ?? "leisure_trip",
    destination: prior?.destination,
    datesText: prior?.datesText,
    durationDays: prior?.durationDays,
    travellers: prior?.travellers,
    partyType: prior?.partyType,
    budgetMin: prior?.budgetMin,
    budgetMax: prior?.budgetMax,
    budgetCurrency: prior?.budgetCurrency ?? "INR",
    travelStyle: prior?.travelStyle,
    preferences: {
      ...(prior?.preferences ?? {}),
      conversationKind: "travel_plan",
    },
    constraints: { ...(prior?.constraints ?? {}) },
    temporary: { ...(prior?.temporary ?? {}) },
    confidence: 0,
    missingInformation: [],
    rawText: text,
  };

  // Intent
  if (
    /honeymoon|romantic/.test(lower) ||
    /family|bachchon|kids|children/.test(lower) ||
    /trip|jaana|plan|holiday|vacation|ghumna|travel/.test(lower)
  ) {
    brief.intent = "leisure_trip";
  }

  // Party
  if (/honeymoon|couple|romantic|partner/.test(lower)) brief.partyType = "couple";
  else if (/family|bachchon|kids|children/.test(lower)) brief.partyType = "family";
  else if (/friends|doston/.test(lower)) brief.partyType = "friends";
  else if (/solo|alone|akela/.test(lower)) brief.partyType = "solo";

  // Destination (India beachhead — matching is data-driven via adapters later)
  const destinations = [
    "kashmir",
    "goa",
    "kerala",
    "rajasthan",
    "manali",
    "jaipur",
    "udaipur",
    "shimla",
    "andaman",
    "ladakh",
    "mumbai",
    "delhi",
    "agra",
    "varanasi",
    "rishikesh",
  ];
  for (const d of destinations) {
    if (lower.includes(d)) {
      brief.destination = capitalize(d);
      break;
    }
  }
  // Hindi / common phrases
  if (!brief.destination && /pahadon|mountains|hill/.test(lower)) {
    brief.preferences = { ...brief.preferences, vibe: "mountains" };
  }
  if (!brief.destination && /beach|samundar/.test(lower)) {
    brief.preferences = { ...brief.preferences, vibe: "beach" };
  }

  // Duration
  const dur = lower.match(/(\d+)\s*(din|days?|nights?)/);
  if (dur) {
    const n = parseInt(dur[1], 10);
    if (/night/.test(dur[2])) {
      brief.durationDays = n + 1;
    } else {
      brief.durationDays = n;
    }
  }

  // Dates / month
  const months =
    "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";
  const monthMatch = lower.match(
    new RegExp(`(in\\s+)?(${months}|next\\s+month|is\\s+baar)`, "i"),
  );
  if (/december|dec\b/.test(lower)) brief.datesText = "December";
  else if (monthMatch) brief.datesText = monthMatch[0];

  // Budget — treat as TEMPORARY for this trip unless user says "usually"
  let budgetFound = false;
  const rangeK = lower.match(/(\d+)\s*k\s*(?:-|to|–)\s*(\d+)\s*k/);
  const underK = lower.match(/under\s*(?:rs\.?|inr|₹)?\s*(\d+)\s*k\b/);
  const aroundK = lower.match(
    /(?:budget|around|approx(?:imately)?)\s*(?:is|:|of)?\s*(?:rs\.?|inr|₹)?\s*(\d+)\s*k\b/,
  );
  const bareBudgetK = lower.match(/budget\s+(\d+)\s*k\b/);

  if (rangeK) {
    budgetFound = true;
    brief.budgetMin = parseInt(rangeK[1], 10) * 1000;
    brief.budgetMax = parseInt(rangeK[2], 10) * 1000;
  } else if (underK) {
    budgetFound = true;
    brief.budgetMax = parseInt(underK[1], 10) * 1000;
  } else if (aroundK || bareBudgetK) {
    budgetFound = true;
    const v = parseInt((aroundK ?? bareBudgetK)![1], 10) * 1000;
    brief.budgetMax = v;
    brief.budgetMin = Math.round(v * 0.75);
  }

  if (budgetFound) {
    const permanent = /usually|typically|always|my budget is|humara budget hamesha/.test(
      lower,
    );
    if (!permanent) {
      brief.temporary = {
        ...brief.temporary,
        budgetMin: brief.budgetMin,
        budgetMax: brief.budgetMax,
      };
    }
  }

  // Style prefs
  if (/relax|peaceful|slow|aaramm/.test(lower)) brief.travelStyle = "relaxed";
  else if (/adventure|trek|trekking/.test(lower)) brief.travelStyle = "adventure";
  else if (/luxury|premium|5\s*star/.test(lower)) brief.travelStyle = "luxury";
  else if (/\b(sasta|cheap|value trip|budget trip)\b/.test(lower)) {
    brief.travelStyle = "value";
  }

  if (/nature|pahad|scenic/.test(lower)) {
    brief.preferences = { ...brief.preferences, nature: true };
  }
  if (/food|cafe|cuisine/.test(lower)) {
    brief.preferences = { ...brief.preferences, food: true };
  }
  if (/packed|hectic|rush/.test(lower)) {
    brief.constraints = { ...brief.constraints, avoidPacked: true };
  }

  // Missing + confidence — only for travel_plan turns
  const missing: string[] = [];
  if (!brief.destination && !brief.preferences?.vibe) missing.push("destination");
  if (!brief.durationDays) missing.push("duration");
  if (!brief.budgetMax && !brief.budgetMin) missing.push("budget");
  if (!brief.partyType) missing.push("travellers");

  brief.missingInformation = missing;

  let confidence = 0.2;
  if (brief.destination) confidence += 0.25;
  if (brief.durationDays) confidence += 0.15;
  if (brief.budgetMax || brief.budgetMin) confidence += 0.15;
  if (brief.partyType) confidence += 0.15;
  if (brief.travelStyle || Object.keys(brief.preferences ?? {}).length > 1) {
    confidence += 0.1;
  }
  brief.confidence = Math.min(1, confidence);

  return brief;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Merge new understanding onto prior request brief */
export function mergeBriefs(
  prior: TravelEnquiryBrief,
  next: TravelEnquiryBrief,
): TravelEnquiryBrief {
  const nextKind = String(next.preferences?.conversationKind || next.intent || "");
  // Non-travel turns must NOT overwrite / force an incomplete trip brief
  if (
    nextKind === "chat" ||
    nextKind === "profile" ||
    nextKind === "meta"
  ) {
    return {
      ...prior,
      preferences: {
        ...prior.preferences,
        conversationKind: nextKind,
      },
      confidence: prior.confidence,
      missingInformation: prior.missingInformation || [],
      rawText: [prior.rawText, next.rawText].filter(Boolean).join(" | "),
    };
  }

  return {
    ...prior,
    ...Object.fromEntries(
      Object.entries(next).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
      ),
    ),
    preferences: { ...prior.preferences, ...next.preferences },
    constraints: { ...prior.constraints, ...next.constraints },
    temporary: { ...prior.temporary, ...next.temporary },
    missingInformation: next.missingInformation,
    confidence: Math.max(prior.confidence, next.confidence),
    rawText: [prior.rawText, next.rawText].filter(Boolean).join(" | "),
  } as TravelEnquiryBrief;
}
