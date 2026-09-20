import type { CustomerProfileView, TravelEnquiryBrief } from "@/lib/types/travel";

/** After destination is known, collect these via form (not endless chat). */
export type TripFormValues = {
  destination: string;
  datesText?: string;
  durationDays: number;
  partyType: "solo" | "couple" | "family" | "friends";
  travellers: number;
  budgetMax: number; // INR absolute, soft max of band
  budgetMin?: number;
  travelStyle: "relaxed" | "balanced" | "adventure" | "luxury";
  avoidPacked?: boolean;
  needFlights?: boolean;
  originCity?: string;
  departDate?: string; // YYYY-MM-DD
  returnDate?: string;
  notes?: string;
};

export function briefReadyForSearch(brief: TravelEnquiryBrief): boolean {
  const hasDest = Boolean(brief.destination || brief.preferences?.vibe);
  const hasDuration = Boolean(brief.durationDays);
  const hasBudget = brief.budgetMax != null || brief.budgetMin != null;
  const hasParty = Boolean(brief.partyType || brief.travellers);
  return hasDest && hasDuration && hasBudget && hasParty;
}

export function needsTripForm(brief: TravelEnquiryBrief): boolean {
  if (!brief.destination && !brief.preferences?.vibe) return false;
  return !briefReadyForSearch(brief);
}

export function softFillFromProfile(
  brief: TravelEnquiryBrief,
  profile: CustomerProfileView,
): TravelEnquiryBrief {
  const next = { ...brief, preferences: { ...(brief.preferences || {}) } };
  if (!next.partyType && profile.partyType) next.partyType = profile.partyType;
  if (!next.durationDays && profile.typicalDuration) {
    next.durationDays = profile.typicalDuration;
  }
  if (
    next.budgetMax == null &&
    next.budgetMin == null &&
    profile.budgetMax != null &&
    (profile.knowledgeConfidence ?? 0) >= 0.4
  ) {
    // Soft suggestion only — form still confirms
    next.preferences = {
      ...next.preferences,
      suggestedBudgetMax: profile.budgetMax,
      suggestedBudgetMin: profile.budgetMin,
    };
  }
  if (!next.travelStyle && typeof profile.preferences?.pace === "string") {
    next.travelStyle = String(profile.preferences.pace);
  }
  if (
    !next.temporary?.originCity &&
    profile.homeLocation
  ) {
    next.temporary = {
      ...(next.temporary || {}),
      originCity: profile.homeLocation,
    };
  }
  return next;
}

export function formToBrief(
  form: TripFormValues,
  prior?: TravelEnquiryBrief | null,
): TravelEnquiryBrief {
  const budgetMax = form.budgetMax;
  const budgetMin =
    form.budgetMin ?? Math.round(budgetMax * 0.75);

  return {
    intent: "leisure_trip",
    destination: form.destination,
    datesText:
      form.datesText ||
      (form.departDate
        ? `${form.departDate}${form.returnDate ? ` → ${form.returnDate}` : ""}`
        : undefined),
    durationDays: form.durationDays,
    travellers: form.travellers,
    partyType: form.partyType,
    budgetMin,
    budgetMax,
    budgetCurrency: "INR",
    travelStyle: form.travelStyle,
    preferences: {
      ...(prior?.preferences || {}),
      conversationKind: "travel_plan",
      vibe: form.travelStyle,
      formCompleted: true,
      notes: form.notes || undefined,
    },
    constraints: {
      ...(prior?.constraints || {}),
      avoidPacked: Boolean(form.avoidPacked),
    },
    temporary: {
      ...(prior?.temporary || {}),
      budgetMin,
      budgetMax,
      needFlights: Boolean(form.needFlights),
      originCity: form.originCity || undefined,
      departDate: form.departDate || undefined,
      returnDate: form.returnDate || undefined,
    },
    confidence: 0.85,
    missingInformation: [],
    rawText: prior?.rawText,
  };
}

export function defaultFormValues(
  brief: TravelEnquiryBrief,
  profile: CustomerProfileView,
): TripFormValues {
  const suggestedMax =
    brief.budgetMax ??
    (brief.preferences?.suggestedBudgetMax as number | undefined) ??
    profile.budgetMax ??
    50000;
  const party =
    (brief.partyType as TripFormValues["partyType"]) ||
    (profile.partyType as TripFormValues["partyType"]) ||
    "couple";
  const travellersDefault =
    brief.travellers ||
    (party === "solo" ? 1 : party === "couple" ? 2 : party === "family" ? 4 : 3);

  return {
    destination: brief.destination || String(brief.preferences?.vibe || ""),
    datesText: brief.datesText || "",
    durationDays: brief.durationDays || profile.typicalDuration || 5,
    partyType: party,
    travellers: travellersDefault,
    budgetMax: suggestedMax,
    budgetMin: brief.budgetMin ?? profile.budgetMin ?? Math.round(suggestedMax * 0.75),
    travelStyle:
      (brief.travelStyle as TripFormValues["travelStyle"]) ||
      (typeof profile.preferences?.pace === "string"
        ? (profile.preferences.pace as TripFormValues["travelStyle"])
        : "relaxed"),
    avoidPacked: Boolean(
      brief.constraints?.avoidPacked || profile.avoidances?.packedItinerary,
    ),
    needFlights: Boolean(brief.temporary?.needFlights ?? true),
    originCity:
      String(brief.temporary?.originCity || profile.homeLocation || ""),
    departDate: String(brief.temporary?.departDate || ""),
    returnDate: String(brief.temporary?.returnDate || ""),
    notes: "",
  };
}
