import type { RankedOption } from "@/lib/types/travel";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** User is confirming a prior hotel/option pick ("haan", "enquire karo", …) */
export function wantsEnquireConfirm(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return /^(haan|haa+|han|yes|yeah|yep|ok|okay|sure|theek|thik|enquire|inquire|book\s*karo|connect|chalo|lock\s*(karo|it)?|yeh\s*(wali|wala)?|isi\s*(ko|wali)?)[\s!.]*$/i.test(
    lower,
  );
}

/** Fresh market search / another shortlist — not option pick */
export function wantsNewShortlist(text: string): boolean {
  return /(?:new|nayi|aur)\s*(options?|shortlist)|dobara\s*search|search\s*(again|phir)|aur\s*(dikhao|options)|change\s*destination|alag\s*(hotel|option)/i.test(
    text,
  );
}

/**
 * Match chat text to a shortlisted option by stay name, player, label, or index.
 * "The Himalayan", "1", "pehli", "option 2", "manu allaya"
 */
export function matchShortlistOption(
  text: string,
  shortlist: RankedOption[],
): RankedOption | null {
  if (!shortlist.length) return null;
  const raw = text.trim();
  const lower = normalize(raw);
  if (!lower || lower.length < 2) return null;

  // ordinal / index: "1", "2nd", "option 3", "pehli", "dusri"
  const num =
    lower.match(/^(?:option|no\.?|#)?\s*([1-9])(?:st|nd|rd|th)?$/) ||
    lower.match(/^(?:number|option)\s*([1-9])$/) ||
    lower.match(/\b(?:option|no\.?|#)\s*([1-9])\b/);
  if (num) {
    const i = parseInt(num[1], 10) - 1;
    if (i >= 0 && i < shortlist.length) return shortlist[i];
  }
  if (/^(pehli|first|pehle|ek)\b/.test(lower) && shortlist[0]) return shortlist[0];
  if (/^(dusri|second|do)\b/.test(lower) && shortlist[1]) return shortlist[1];
  if (/^(tisri|third|teen)\b/.test(lower) && shortlist[2]) return shortlist[2];
  if (/^(chauthi|fourth)\b/.test(lower) && shortlist[3]) return shortlist[3];

  // Name match against stay / player / destination+stay / label
  let best: { opt: RankedOption; score: number } | null = null;
  for (const opt of shortlist) {
    const stay = normalize(opt.option.stay?.name || "");
    const player = normalize(opt.option.player?.name || "");
    const label = normalize(opt.label || "");
    const dest = normalize(opt.option.destination || "");
    const haystacks = [stay, player, label, `${dest} ${stay}`].filter(Boolean);

    for (const hay of haystacks) {
      if (!hay) continue;
      if (hay === lower || lower === hay) {
        return opt;
      }
      // substring either way (min 4 chars to avoid noise)
      if (lower.length >= 4 && (hay.includes(lower) || lower.includes(hay))) {
        const score = Math.min(lower.length, hay.length);
        if (!best || score > best.score) best = { opt, score };
      }
      // significant token overlap
      const tokens = lower.split(" ").filter((t) => t.length >= 4);
      const hits = tokens.filter((t) => hay.includes(t));
      if (hits.length >= 1 && stay && hits.some((t) => stay.includes(t))) {
        const score = hits.join("").length + (stay.includes(lower) ? 10 : 0);
        if (!best || score > best.score) best = { opt, score };
      }
    }
  }

  return best?.opt ?? null;
}

export function optionDisplayName(opt: RankedOption): string {
  return (
    opt.option.stay?.name ||
    opt.option.player?.name ||
    opt.label ||
    opt.option.destination
  );
}
