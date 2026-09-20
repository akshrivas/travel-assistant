import type {
  CustomerProfileView,
  NormalizedTravelOption,
  RankedOption,
  TravelEnquiryBrief,
} from "@/lib/types/travel";

const SHORTLIST_SIZE = 3;

/**
 * Compare available options and produce a small personalized shortlist.
 * Best deal ≠ cheapest only — fit + reliability + budget value.
 */
export function recommendOptions(
  options: NormalizedTravelOption[],
  brief: TravelEnquiryBrief,
  profile: CustomerProfileView,
): RankedOption[] {
  if (!options.length) return [];

  const budgetMax =
    brief.budgetMax ??
    (brief.temporary?.budgetMax as number | undefined) ??
    profile.budgetMax ??
    undefined;
  const budgetMin =
    brief.budgetMin ??
    (brief.temporary?.budgetMin as number | undefined) ??
    profile.budgetMin ??
    undefined;

  const party = brief.partyType ?? profile.partyType ?? undefined;
  const style = brief.travelStyle;

  const scored = options.map((option) => {
    let score = 0;
    const reasons: string[] = [];

    // Budget fit
    const price = option.price.amount;
    if (budgetMax != null) {
      if (price <= budgetMax) {
        score += 25;
        const headroom = (budgetMax - price) / budgetMax;
        score += Math.min(10, headroom * 10);
        reasons.push("fits your budget");
      } else if (price <= budgetMax * 1.1) {
        score += 10;
        reasons.push("slightly above budget but close");
      } else {
        score -= 20;
        reasons.push("over budget");
      }
    } else {
      score += 5;
    }
    if (budgetMin != null && price >= budgetMin) score += 5;

    // Duration fit
    if (brief.durationDays != null) {
      const diff = Math.abs(option.durationDays - brief.durationDays);
      if (diff === 0) {
        score += 15;
        reasons.push(`matches ${brief.durationDays} days`);
      } else if (diff <= 1) score += 10;
      else if (diff <= 2) score += 4;
      else score -= 5;
    }

    // Party / style tags
    const tags = option.travelStyleTags ?? [];
    if (party && tags.includes(party)) {
      score += 12;
      reasons.push(`suited for ${party} trips`);
    }
    if (style && tags.includes(style)) {
      score += 12;
      reasons.push(`${style} pace`);
    }
    if (brief.preferences?.nature && tags.includes("nature")) {
      score += 8;
      reasons.push("nature-forward");
    }
    if (brief.constraints?.avoidPacked && tags.includes("relaxed")) {
      score += 8;
      reasons.push("relaxed itinerary");
    }

    // Reliability / feedback of market player
    const rating = option.player?.rating ?? 0;
    const reviews = option.player?.reviewCount ?? 0;
    score += rating * 4;
    score += Math.min(10, Math.log10(reviews + 1) * 3);
    if (rating >= 4.5 && reviews >= 200) {
      reasons.push(
        `${option.player?.name ?? "operator"} is well-reviewed (${rating}/5, ${reviews} reviews)`,
      );
    } else if (rating >= 4.0) {
      reasons.push(`solid player rating ${rating}/5`);
    }

    // Stay quality
    if (option.stay?.rating && option.stay.rating >= 4.2) {
      score += 5;
      reasons.push(`strong stay (${option.stay.rating})`);
    }

    // Incomplete data penalty — honesty
    if (option.incompleteFields?.length) {
      score -= option.incompleteFields.length * 2;
    }

    // Profile knowledge: slight boost when we know preferences
    score += profile.knowledgeConfidence * 3;

    const reason =
      reasons.slice(0, 3).join("; ") ||
      "Available option from stitched market sources";

    return { option, score, reason };
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversify shortlist labels: pick best + different angles when possible
  const shortlist: RankedOption[] = [];
  const used = new Set<string>();

  const pickBy = (pred: (r: RankedOption) => boolean, label: string) => {
    const hit = scored.find((r) => !used.has(r.option.id) && pred(r));
    if (hit) {
      used.add(hit.option.id);
      shortlist.push({ ...hit, label });
    }
  };

  pickBy(() => true, "Best overall");
  pickBy(
    (r) => (r.option.travelStyleTags ?? []).includes("relaxed"),
    "Relaxed",
  );
  pickBy((r) => {
    if (budgetMax == null) return (r.option.travelStyleTags ?? []).includes("value");
    return r.option.price.amount <= budgetMax * 0.9;
  }, "Value");

  for (const r of scored) {
    if (shortlist.length >= SHORTLIST_SIZE) break;
    if (used.has(r.option.id)) continue;
    used.add(r.option.id);
    shortlist.push({
      ...r,
      label: r.option.travelStyleTags?.[0]
        ? capitalize(r.option.travelStyleTags[0])
        : "Alternative",
    });
  }

  return shortlist.slice(0, SHORTLIST_SIZE);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatPrice(amount: number, currency: string) {
  if (currency === "INR") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
  return `${currency} ${amount.toLocaleString("en")}`;
}
