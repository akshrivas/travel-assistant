import { indiaCatalogAdapter } from "@/lib/adapters/india-catalog-adapter";
import type { SourceAdapter } from "@/lib/adapters/types";
import type { NormalizedTravelOption } from "@/lib/types/travel";
import type { TravelEnquiryBrief } from "@/lib/types/travel";

/** Beachhead market — config, not UI hardcode */
export const DEFAULT_MARKET_FOCUS = process.env.MARKET_FOCUS || "IN";

const adapters: SourceAdapter[] = [indiaCatalogAdapter];

export function listAdapters(): SourceAdapter[] {
  return [...adapters];
}

export function registerAdapter(adapter: SourceAdapter) {
  const idx = adapters.findIndex((a) => a.id === adapter.id);
  if (idx >= 0) adapters[idx] = adapter;
  else adapters.push(adapter);
}

/**
 * Discovery layer: fan-out to pluggable source adapters.
 */
export async function discoverOptions(
  brief: TravelEnquiryBrief,
  marketFocus: string = DEFAULT_MARKET_FOCUS,
): Promise<NormalizedTravelOption[]> {
  const eligible = adapters.filter(
    (a) => a.markets.length === 0 || a.markets.includes(marketFocus),
  );

  const batches = await Promise.all(
    eligible.map(async (adapter) => {
      try {
        return await adapter.search({ brief, marketFocus });
      } catch (err) {
        console.error(`Adapter ${adapter.id} failed`, err);
        return [] as NormalizedTravelOption[];
      }
    }),
  );

  return dedupeOptions(batches.flat());
}

/** Merge near-duplicates across sources */
export function dedupeOptions(
  options: NormalizedTravelOption[],
): NormalizedTravelOption[] {
  const seen = new Map<string, NormalizedTravelOption>();

  for (const opt of options) {
    const key = [
      opt.destination.toLowerCase(),
      opt.durationNights,
      opt.stay?.name?.toLowerCase() ?? "",
      opt.price.amount,
      opt.price.currency,
    ].join("|");

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, opt);
      continue;
    }
    // Prefer higher player rating / more reviews
    const score = (o: NormalizedTravelOption) =>
      (o.player?.rating ?? 0) * 1000 + (o.player?.reviewCount ?? 0);
    if (score(opt) > score(existing)) seen.set(key, opt);
  }

  return [...seen.values()];
}
