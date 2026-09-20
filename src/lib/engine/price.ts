import type { NormalizedTravelOption } from "@/lib/types/travel";

/**
 * Normalize LLM / market prices into sensible INR stay totals.
 * Drops invented or unit-confused figures (lakhs for a 5-night Goa stay, etc.).
 */
export function sanitizeStayPrice(
  raw: number,
  input: {
    budgetMax?: number;
    nights?: number;
  },
): { amount: number; incomplete?: boolean } {
  let amount = Number.isFinite(raw) ? Math.round(raw) : 0;
  if (amount <= 0) return { amount: 0, incomplete: true };

  const nights = Math.max(1, input.nights || 1);
  const budgetMax = input.budgetMax;

  // If model returned a plausible per-night rate, expand to stay total
  if (amount >= 1500 && amount <= 25000 && nights >= 2) {
    const asTotal = amount * nights;
    if (budgetMax == null || asTotal <= budgetMax * 2.5) {
      amount = asTotal;
    }
  }

  // Hard reject fantasy totals for India leisure stays
  if (amount > 5_000_000) return { amount: 0, incomplete: true };
  if (budgetMax != null && amount > budgetMax * 4) {
    return { amount: 0, incomplete: true };
  }
  if (amount < 1500) return { amount: 0, incomplete: true };

  return { amount };
}

/** Budget field: "50" → 50k; "50000" → 50k absolute (not ×1000 again) */
export function parseBudgetThousandsInput(raw: string): number {
  const n = parseInt(raw.replace(/[, ]/g, "") || "0", 10) || 0;
  if (n <= 0) return 0;
  if (n >= 1000) return n; // already absolute INR
  return n * 1000;
}

export function optionHasUsableListing(opt: NormalizedTravelOption): boolean {
  return Boolean(opt.source?.url && opt.stay?.name && opt.price.amount > 0);
}
