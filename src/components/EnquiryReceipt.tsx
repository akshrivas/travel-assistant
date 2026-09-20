"use client";

export type EnquiryReceiptData = {
  id: string;
  status: string;
  statusLabel: string;
  hotelName: string;
  destination?: string;
  durationDays?: number | null;
  location?: string | null;
  priceLabel: string;
  provider: string;
  listingUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  nextStep: string;
};

export function EnquiryReceipt({
  data,
  lang = "hinglish",
}: {
  data: EnquiryReceiptData;
  lang?: string | null;
}) {
  const hinglish = lang !== "en";

  return (
    <div className="ts-fade mt-3 border border-[var(--accent)] bg-[var(--surface)]/95 p-3.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
        {hinglish ? "Enquiry · Connect" : "Enquiry · Connect"}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--ink)]">
        {data.hotelName}
      </p>
      <p className="mt-0.5 text-sm text-[var(--muted)]">
        {[data.destination, data.durationDays ? `${data.durationDays} days` : null]
          .filter(Boolean)
          .join(" · ")}
        {data.location ? ` · ${data.location}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            {data.priceLabel}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {data.provider}
            {data.rating != null
              ? ` · ${data.rating}★${
                  data.reviewCount != null
                    ? ` (${data.reviewCount.toLocaleString("en-IN")})`
                    : ""
                }`
              : ""}
          </p>
        </div>
        <span className="border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent)]">
          {data.statusLabel}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]/90">
        {data.nextStep}
      </p>

      {data.listingUrl ? (
        <a
          href={data.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-[var(--sand)] transition hover:brightness-110"
        >
          {hinglish ? "Listing kholo → connect / book" : "Open listing → connect / book"}
        </a>
      ) : (
        <p className="mt-3 text-xs text-red-700">
          {hinglish
            ? "Listing link missing — dusra hotel try karo."
            : "Listing link missing — try another hotel."}
        </p>
      )}

      <p className="mt-2 text-[10px] text-[var(--muted)]">
        Ref {data.id.slice(-8)}
      </p>
    </div>
  );
}
