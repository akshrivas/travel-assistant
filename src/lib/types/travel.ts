/**
 * Normalized Travel Option — foundational market abstraction.
 * Every Source Adapter MUST map into this shape.
 * Source Adapter → Normalized Travel Option
 */

export type TravelOptionSource = {
  id: string;
  name: string;
  type: "api" | "affiliate" | "partner" | "catalog" | "agent";
  /** ISO timestamp of last check — never imply live if stale */
  lastCheckedAt: string;
  externalId?: string;
  url?: string;
};

export type NormalizedTravelOption = {
  id: string;
  destination: string;
  region?: string;
  country: string;
  durationNights: number;
  durationDays: number;
  stay?: {
    name: string;
    type?: string;
    rating?: number;
    location?: string;
  };
  transport?: {
    mode?: string;
    summary?: string;
  };
  activities?: string[];
  price: {
    amount: number;
    currency: string;
    perPerson?: boolean;
    inclusionsNote?: string;
  };
  inclusions?: string[];
  exclusions?: string[];
  cancellation?: string;
  /** Player / operator reliability signals when available */
  player?: {
    name: string;
    rating?: number;
    reviewCount?: number;
    reliabilityNote?: string;
  };
  travelStyleTags?: string[]; // relaxed | balanced | experience | family | honeymoon...
  source: TravelOptionSource;
  incompleteFields?: string[];
};

export type TravelEnquiryBrief = {
  intent?: string;
  destination?: string;
  datesText?: string;
  durationDays?: number;
  travellers?: number;
  partyType?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetCurrency?: string;
  travelStyle?: string;
  preferences?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  /** Trip-scoped only — must not overwrite long-term profile */
  temporary?: Record<string, unknown>;
  confidence: number;
  missingInformation: string[];
  rawText?: string;
};

export type CustomerProfileView = {
  displayName?: string | null;
  homeLocation?: string | null;
  preferredLanguage?: string;
  partyType?: string | null;
  typicalDuration?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  budgetCurrency?: string;
  preferredDestinations?: string[];
  preferences?: Record<string, unknown>;
  avoidances?: Record<string, unknown>;
  knowledgeConfidence: number;
};

export type RankedOption = {
  option: NormalizedTravelOption;
  score: number;
  reason: string;
  label?: string; // e.g. Relaxed / Balanced / Value
};

export type SourceAdapterSearchInput = {
  brief: TravelEnquiryBrief;
  marketFocus?: string; // e.g. "IN" — config, not hardcode in UI
};
