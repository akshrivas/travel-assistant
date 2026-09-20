import { readFile } from "fs/promises";
import path from "path";
import type { SourceAdapter } from "@/lib/adapters/types";
import type { NormalizedTravelOption } from "@/lib/types/travel";

type CatalogRow = {
  externalId: string;
  destination: string;
  region?: string;
  country: string;
  durationNights: number;
  durationDays: number;
  stay?: NormalizedTravelOption["stay"];
  transport?: NormalizedTravelOption["transport"];
  activities?: string[];
  price: NormalizedTravelOption["price"];
  inclusions?: string[];
  exclusions?: string[];
  cancellation?: string;
  player?: NormalizedTravelOption["player"];
  travelStyleTags?: string[];
};

/**
 * First V1 adapter: India market catalog feed.
 * Data lives outside app UI — swap for a live API adapter later without changing the engine.
 */
export const indiaCatalogAdapter: SourceAdapter = {
  id: "india-market-catalog",
  name: "India Market Catalog",
  type: "catalog",
  markets: ["IN"],

  async search({ brief, marketFocus = "IN" }) {
    if (marketFocus !== "IN" && brief.destination) {
      // Still allow search; filter by country on rows
    }

    const filePath = path.join(
      process.cwd(),
      "data/sources/india-market-catalog.json",
    );
    const raw = await readFile(filePath, "utf-8");
    const rows = JSON.parse(raw) as CatalogRow[];
    const checkedAt = new Date().toISOString();

    const dest = brief.destination?.toLowerCase();

    const mapped: NormalizedTravelOption[] = rows
      .filter((row) => row.country === (marketFocus || "IN"))
      .filter((row) => {
        if (!dest) return true;
        const hay = `${row.destination} ${row.region ?? ""}`.toLowerCase();
        return (
          hay.includes(dest) ||
          dest.includes(row.destination.toLowerCase()) ||
          fuzzyDestination(dest, row.destination.toLowerCase())
        );
      })
      .map((row) => {
        const incomplete: string[] = [];
        if (!row.cancellation) incomplete.push("cancellation");
        if (!row.transport) incomplete.push("transport");

        return {
          id: `${indiaCatalogAdapter.id}:${row.externalId}`,
          destination: row.destination,
          region: row.region,
          country: row.country,
          durationNights: row.durationNights,
          durationDays: row.durationDays,
          stay: row.stay,
          transport: row.transport,
          activities: row.activities,
          price: row.price,
          inclusions: row.inclusions,
          exclusions: row.exclusions,
          cancellation: row.cancellation,
          player: row.player,
          travelStyleTags: row.travelStyleTags,
          source: {
            id: indiaCatalogAdapter.id,
            name: indiaCatalogAdapter.name,
            type: indiaCatalogAdapter.type,
            lastCheckedAt: checkedAt,
            externalId: row.externalId,
          },
          incompleteFields: incomplete.length ? incomplete : undefined,
        } satisfies NormalizedTravelOption;
      });

    return mapped;
  },
};

function fuzzyDestination(query: string, destination: string): boolean {
  const aliases: Record<string, string[]> = {
    kashmir: ["srinagar", "gulmarg", "pahalgam"],
    goa: ["baga", "calangute", "south goa", "north goa"],
    kerala: ["alleppey", "munnar", "kochi", "backwater"],
    rajasthan: ["jaipur", "udaipur", "jodhpur"],
    manali: ["himachal", "solang"],
    jaipur: ["rajasthan", "pink city"],
  };
  for (const [key, list] of Object.entries(aliases)) {
    if (query.includes(key) && (destination.includes(key) || key.includes(destination))) {
      return true;
    }
    if (list.some((a) => query.includes(a)) && destination.includes(key)) {
      return true;
    }
  }
  return false;
}
