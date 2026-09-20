import type { Profile } from "@prisma/client";
import type { CustomerProfileView } from "@/lib/types/travel";

export function toProfileView(profile: Profile): CustomerProfileView {
  return {
    displayName: profile.displayName,
    homeLocation: profile.homeLocation,
    preferredLanguage: profile.preferredLanguage,
    partyType: profile.partyType,
    typicalDuration: profile.typicalDuration,
    budgetMin: profile.budgetMin,
    budgetMax: profile.budgetMax,
    budgetCurrency: profile.budgetCurrency,
    preferredDestinations: profile.preferredDestinations
      ? (JSON.parse(profile.preferredDestinations) as string[])
      : [],
    preferences: JSON.parse(profile.preferencesJson || "{}") as Record<
      string,
      unknown
    >,
    avoidances: JSON.parse(profile.avoidancesJson || "{}") as Record<
      string,
      unknown
    >,
    knowledgeConfidence: profile.knowledgeConfidence,
  };
}

/** Rough confidence from how much onboarding filled */
export function computeKnowledgeConfidence(input: {
  displayName?: string | null;
  homeLocation?: string | null;
  partyType?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  typicalDuration?: number | null;
  preferredDestinations?: string[] | null;
  preferences?: Record<string, unknown> | null;
}): number {
  let c = 0.1;
  if (input.displayName) c += 0.15;
  if (input.homeLocation) c += 0.1;
  if (input.partyType) c += 0.15;
  if (input.budgetMax || input.budgetMin) c += 0.15;
  if (input.typicalDuration) c += 0.1;
  if (input.preferredDestinations?.length) c += 0.1;
  if (input.preferences && Object.keys(input.preferences).length) c += 0.15;
  return Math.min(0.85, c);
}
