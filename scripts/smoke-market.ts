import "dotenv/config";
import { discoverOptions } from "../src/lib/adapters/registry";
import type { TravelEnquiryBrief } from "../src/lib/types/travel";

async function main() {
  const brief: TravelEnquiryBrief = {
    destination: "Goa",
    durationDays: 5,
    partyType: "couple",
    budgetMax: 50000,
    travelStyle: "relaxed",
    preferences: { vibe: "peaceful" },
    confidence: 0.85,
    missingInformation: [],
  };

  console.log("Searching live market…");
  const opts = await discoverOptions(brief, "IN");
  console.log(
    JSON.stringify(
      {
        count: opts.length,
        sample: opts.slice(0, 4).map((o) => ({
          name: o.stay?.name,
          price: o.price.amount,
          player: o.player?.name,
          rating: o.player?.rating,
          reviews: o.player?.reviewCount,
          url: o.source.url,
          source: o.source.name,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
