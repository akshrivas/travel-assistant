import { defaultModel, getOpenAI } from "@/lib/ai/client";
import type { SourceAdapter } from "@/lib/adapters/types";
import type {
  NormalizedTravelOption,
  SourceAdapterSearchInput,
} from "@/lib/types/travel";

const TRUSTED_PLATFORMS = [
  "Booking.com",
  "MakeMyTrip",
  "Agoda",
  "Hotels.com",
  "Goibibo",
  "Tripadvisor",
  "Official hotel site",
] as const;

/**
 * Live market discovery via OpenAI web search.
 * Finds real listings from public travel sites — not invented inventory.
 */
export const webMarketAdapter: SourceAdapter = {
  id: "web-market-search",
  name: "Live Market Search",
  type: "api",
  markets: ["IN"],

  async search(input: SourceAdapterSearchInput): Promise<NormalizedTravelOption[]> {
    const openai = getOpenAI();
    if (!openai) return [];

    const { brief } = input;
    const dest = brief.destination || String(brief.preferences?.vibe || "India");
    const days = brief.durationDays || 5;
    const nights = Math.max(1, days - 1);
    const party = brief.partyType || "travellers";
    const budgetMax =
      brief.budgetMax || (brief.temporary?.budgetMax as number | undefined);
    const budgetMin =
      brief.budgetMin || (brief.temporary?.budgetMin as number | undefined);
    const style = brief.travelStyle || "";
    const prefs = brief.preferences || {};
    const avoidPacked = Boolean(brief.constraints?.avoidPacked);

    const travellers = brief.travellers || undefined;

    const budgetLine =
      budgetMax != null
        ? `total hotel stay budget around INR ${budgetMin ?? Math.round(budgetMax * 0.7)}–${budgetMax} for the whole stay`
        : "mid-range hotel budget";

    const vibeBits = [
      style ? `pace: ${style}` : null,
      party !== "travellers" ? `party: ${party}` : null,
      travellers ? `${travellers} travellers` : null,
      avoidPacked ? "prefer quieter / less packed stays" : null,
      prefs.nature ? "nature-forward" : null,
      typeof prefs.vibe === "string" ? `vibe: ${prefs.vibe}` : null,
      typeof prefs.notes === "string" ? `notes: ${prefs.notes}` : null,
      typeof prefs.hotel === "string" ? `hotel style: ${prefs.hotel}` : null,
      brief.datesText ? `timing: ${brief.datesText}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    const query = `You are a travel market researcher for India HOTELS / resorts only (no flights, no packages unless hotel-led).
Search the live web for currently listed hotel / resort stay options in ${dest}, India that a traveller could enquire about.

Trip brief:
- ~${nights} nights (${days} days)
- ${party}
- ${budgetLine}
${vibeBits ? `- Preferences: ${vibeBits}` : ""}

Priority rules (strict):
1. Hotels and resorts ONLY — do not return flights, buses, or pure tour packages without a named stay.
2. Prefer top market platforms: ${TRUSTED_PLATFORMS.join(", ")}. Diversify across platforms when possible — do not return everything from one OTA.
3. Prefer properties with the strongest guest ratings AND enough reviews (favor 100+ reviews when available).
4. Prefer well-known / highly booked properties over obscure listings.
5. Diversify: mix 1 premium-fit, 1 strong value, 1 distinctive/relaxed option when possible.
6. Do NOT invent properties, prices, ratings, or URLs. Only use what search finds.
7. url MUST be a property-specific hotel listing page, never a city/category search results page.
8. If a field is unknown, omit it rather than guessing wildly.

Return ONLY valid JSON (no markdown):
{"options":[{"externalId":"slug","name":"property name","location":"area, city","nights":${nights},"price_inr":number,"rating":number,"review_count":number,"url":"https://...","provider":"Booking.com|MakeMyTrip|Agoda|Hotels.com|Goibibo|Tripadvisor|Official|Other","inclusions":["..."],"cancellation":"...","tags":["relaxed","family","value"],"why":"one line why this is a strong hotel pick"}]}
Aim for 5 hotel options. Prices = approximate INR totals for the hotel stay (not flights).`;

    try {
      const response = await openai.responses.create({
        model: process.env.OPENAI_SEARCH_MODEL || defaultModel(),
        tools: [
          {
            type: "web_search_preview",
            user_location: {
              type: "approximate",
              country: "IN",
            },
          },
        ],
        input: query,
        temperature: 0.15,
      });

      const text = extractOutputText(response);
      const parsed = extractJson(text);
      const rows = Array.isArray(parsed?.options) ? parsed.options : [];
      const checkedAt = new Date().toISOString();

      return rows
        .map((raw, idx) => {
          const row = raw as Record<string, unknown>;
          const name = String(row.name || "").trim();
          if (!name) return null;
          const price = Number(row.price_inr) || 0;
          const rating = row.rating != null ? Number(row.rating) : undefined;
          const normRating =
            rating != null && rating > 5
              ? Math.round((rating / 2) * 10) / 10
              : rating;
          const reviewCount =
            row.review_count != null ? Number(row.review_count) : undefined;
          const provider = normalizeProvider(String(row.provider || "Web listing"));
          const url = typeof row.url === "string" ? sanitizeListingUrl(row.url) : undefined;
          const nightsN = Number(row.nights) || nights;
          const tags = Array.isArray(row.tags)
            ? row.tags.map(String)
            : [party, style].filter(Boolean);
          const incomplete: string[] = [];
          if (!price) incomplete.push("price");
          if (!url) incomplete.push("url");
          if (normRating == null) incomplete.push("rating");

          const reliabilityNote = buildReliabilityNote(
            provider,
            normRating,
            reviewCount,
          );

          const opt: NormalizedTravelOption = {
            id: `web-market:${String(row.externalId || name)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 48)}-${idx}`,
            destination: dest,
            country: "IN",
            durationNights: nightsN,
            durationDays: nightsN + 1,
            stay: {
              name,
              type: "hotel",
              rating: normRating,
              location: String(row.location || dest),
            },
            price: {
              amount: price || budgetMax || 0,
              currency: "INR",
              perPerson: false,
              inclusionsNote: Array.isArray(row.inclusions)
                ? row.inclusions.map(String).join(", ")
                : undefined,
            },
            inclusions: Array.isArray(row.inclusions)
              ? row.inclusions.map(String)
              : undefined,
            cancellation:
              typeof row.cancellation === "string"
                ? row.cancellation
                : undefined,
            player: {
              name: provider,
              rating: normRating,
              reviewCount,
              reliabilityNote,
            },
            travelStyleTags: tags.map((t) => t.toLowerCase()),
            source: {
              id: "web-market-search",
              name: `Live Market · ${provider}`,
              type: "api",
              lastCheckedAt: checkedAt,
              externalId: String(row.externalId || name),
              url,
            },
            incompleteFields: incomplete.length ? incomplete : undefined,
          };
          return opt;
        })
        .filter(Boolean) as NormalizedTravelOption[];
    } catch (err) {
      console.error("webMarketAdapter failed", err);
      return [];
    }
  },
};

function sanitizeListingUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return undefined;
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".pdf") || path.endsWith(".doc") || path.endsWith(".docx")) {
      return undefined;
    }
    // Drop obvious category / search result pages
    if (
      /\/hotels\/?\d*-?star-hotels-in-/.test(path) ||
      /\/hotels-in-/.test(path) ||
      /\/search/.test(path) ||
      /\/destination\//.test(path)
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

function normalizeProvider(raw: string): string {
  const lower = raw.toLowerCase();
  for (const p of TRUSTED_PLATFORMS) {
    if (lower.includes(p.toLowerCase().split(".")[0]!)) return p;
  }
  if (lower.includes("makemytrip") || lower.includes("mmt")) return "MakeMyTrip";
  if (lower.includes("booking")) return "Booking.com";
  if (lower.includes("official")) return "Official hotel site";
  return raw.trim() || "Web listing";
}

function buildReliabilityNote(
  provider: string,
  rating?: number,
  reviewCount?: number,
): string {
  const trusted = TRUSTED_PLATFORMS.some((p) =>
    provider.toLowerCase().includes(p.toLowerCase().split(".")[0]!),
  );
  if (rating != null && rating >= 4.5 && (reviewCount ?? 0) >= 200) {
    return "Top-rated listing with substantial guest reviews";
  }
  if (trusted && (reviewCount ?? 0) >= 100) {
    return "Listed on a major platform with solid review volume";
  }
  if (trusted) return "Listed on a major travel platform — confirm before booking";
  return "Verify on source before booking";
}

function extractOutputText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  let text = "";
  for (const item of response.output || []) {
    if (item.type === "message") {
      for (const c of item.content || []) {
        if (c.type === "output_text" || c.type === "text") {
          text += c.text || "";
        }
      }
    }
  }
  return text;
}

function extractJson(text: string): { options?: unknown[] } | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
