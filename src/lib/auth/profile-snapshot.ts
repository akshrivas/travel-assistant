import type { CustomerProfileView } from "@/lib/types/travel";

/** Client-side backup key — survives Vercel SQLite /tmp resets */
export const PROFILE_BACKUP_KEY = "tripsaathi_profile_v1";

export type ProfileBackup = {
  email: string;
  onboardingComplete: boolean;
  profile: Partial<CustomerProfileView>;
  savedAt: number;
};

export function isProfileBackup(v: unknown): v is ProfileBackup {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.email === "string" && typeof o.onboardingComplete === "boolean";
}

/** Prefer the richer / more-complete snapshot (session or client) over empty DB. */
export function mergeProfileSnapshots(
  primary?: Partial<CustomerProfileView> | null,
  secondary?: Partial<CustomerProfileView> | null,
): Partial<CustomerProfileView> {
  const a = primary || {};
  const b = secondary || {};
  return {
    displayName: a.displayName || b.displayName,
    homeLocation: a.homeLocation || b.homeLocation,
    preferredLanguage: a.preferredLanguage || b.preferredLanguage || "en",
    partyType: a.partyType || b.partyType,
    typicalDuration: a.typicalDuration ?? b.typicalDuration,
    budgetMin: a.budgetMin ?? b.budgetMin,
    budgetMax: a.budgetMax ?? b.budgetMax,
    budgetCurrency: a.budgetCurrency || b.budgetCurrency || "INR",
    preferredDestinations:
      (a.preferredDestinations?.length
        ? a.preferredDestinations
        : b.preferredDestinations) || [],
    preferences: {
      ...(b.preferences || {}),
      ...(a.preferences || {}),
    },
    avoidances: {
      ...(b.avoidances || {}),
      ...(a.avoidances || {}),
    },
    knowledgeConfidence: Math.max(
      a.knowledgeConfidence ?? 0,
      b.knowledgeConfidence ?? 0,
    ),
  };
}
