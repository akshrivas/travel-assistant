"use client";

import { useMemo, useState, useTransition } from "react";
import type { CustomerProfileView, TravelEnquiryBrief } from "@/lib/types/travel";
import {
  defaultFormValues,
  type TripFormValues,
} from "@/lib/engine/trip-form";

const field =
  "mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";
const label = "block text-xs text-[var(--muted)]";

const PARTY = [
  { id: "solo", label: "Solo" },
  { id: "couple", label: "Couple" },
  { id: "family", label: "Family" },
  { id: "friends", label: "Friends" },
] as const;

const STYLE = [
  { id: "relaxed", label: "Relaxed" },
  { id: "balanced", label: "Balanced" },
  { id: "adventure", label: "Adventure" },
  { id: "luxury", label: "Luxury stay" },
] as const;

export function TripBriefForm({
  brief,
  profile,
  lang = "hinglish",
  onSubmit,
}: {
  brief: TravelEnquiryBrief;
  profile: CustomerProfileView;
  lang?: string | null;
  onSubmit: (values: TripFormValues) => Promise<void> | void;
}) {
  const initial = useMemo(
    () => defaultFormValues(brief, profile),
    [brief, profile],
  );
  const [values, setValues] = useState<TripFormValues>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hinglish = lang !== "en";

  function set<K extends keyof TripFormValues>(key: K, v: TripFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.destination.trim()) {
      setError(hinglish ? "Destination chahiye" : "Destination required");
      return;
    }
    if (!values.durationDays || values.durationDays < 1) {
      setError(hinglish ? "Kitne din?" : "Duration required");
      return;
    }
    if (!values.budgetMax || values.budgetMax < 1000) {
      setError(hinglish ? "Budget band chahiye" : "Budget required");
      return;
    }
    if (values.needFlights && !values.originCity?.trim()) {
      setError(
        hinglish
          ? "Flight ke liye city of origin batao"
          : "Origin city needed for flights",
      );
      return;
    }
    startTransition(async () => {
      try {
        await onSubmit({
          ...values,
          budgetMin: Math.round(values.budgetMax * 0.75),
        });
      } catch {
        setError(hinglish ? "Submit fail — phir try karo" : "Submit failed");
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-3 border border-[var(--line)] bg-[var(--surface)]/95 p-3"
    >
      <div>
        <p className="font-[family-name:var(--font-display)] text-lg text-[var(--ink)]">
          {values.destination || "Trip"} — quick brief
        </p>
        <p className="text-xs text-[var(--muted)]">
          {hinglish
            ? "Destination lock. Baaki form se — phir existing market se shortlist."
            : "Destination locked. Rest via form — then shortlist from the live market."}
        </p>
      </div>

      <label className={label}>
        {hinglish ? "Kab / kitne din" : "When / how many days"}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <input
            className={field}
            placeholder={hinglish ? "e.g. December / next month" : "e.g. December"}
            value={values.datesText || ""}
            onChange={(e) => set("datesText", e.target.value)}
          />
          <input
            className={field}
            inputMode="numeric"
            placeholder={hinglish ? "Din (e.g. 5)" : "Days (e.g. 5)"}
            value={values.durationDays || ""}
            onChange={(e) =>
              set("durationDays", parseInt(e.target.value || "0", 10) || 0)
            }
          />
        </div>
      </label>

      <div>
        <p className={label}>
          {hinglish ? "Kaun jaa raha hai" : "Who’s going"}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {PARTY.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                set("partyType", p.id);
                if (p.id === "solo") set("travellers", 1);
                if (p.id === "couple") set("travellers", 2);
              }}
              className={
                values.partyType === p.id
                  ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs"
                  : "border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          className={`${field} mt-2`}
          inputMode="numeric"
          placeholder={hinglish ? "Kitne log?" : "Number of travellers"}
          value={values.travellers || ""}
          onChange={(e) =>
            set("travellers", parseInt(e.target.value || "0", 10) || 0)
          }
        />
      </div>

      <label className={label}>
        {hinglish ? "Budget band (₹ thousands — 50 = ₹50k)" : "Budget band (₹ thousands)"}
        <input
          className={field}
          inputMode="numeric"
          value={Math.round(values.budgetMax / 1000) || ""}
          onChange={(e) => {
            const k = parseInt(e.target.value || "0", 10) || 0;
            set("budgetMax", k * 1000);
          }}
          placeholder="e.g. 50"
        />
      </label>

      <div>
        <p className={label}>{hinglish ? "Vibe check" : "Vibe"}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {STYLE.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => set("travelStyle", s.id)}
              className={
                values.travelStyle === s.id
                  ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs"
                  : "border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]"
              }
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={Boolean(values.avoidPacked)}
            onChange={(e) => set("avoidPacked", e.target.checked)}
          />
          {hinglish ? "Packed itinerary avoid" : "Avoid packed itinerary"}
        </label>
      </div>

      <div className="border-t border-[var(--line)] pt-3">
        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={Boolean(values.needFlights)}
            onChange={(e) => set("needFlights", e.target.checked)}
          />
          {hinglish ? "Flights bhi chahiye" : "Need flights too"}
        </label>
        {values.needFlights ? (
          <div className="mt-2 space-y-2">
            <label className={label}>
              {hinglish ? "Udan kahan se (city)" : "Flying from (city)"}
              <input
                className={field}
                value={values.originCity || ""}
                onChange={(e) => set("originCity", e.target.value)}
                placeholder="e.g. Delhi"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>
                Depart
                <input
                  type="date"
                  className={field}
                  value={values.departDate || ""}
                  onChange={(e) => set("departDate", e.target.value)}
                />
              </label>
              <label className={label}>
                Return
                <input
                  type="date"
                  className={field}
                  value={values.returnDate || ""}
                  onChange={(e) => set("returnDate", e.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      <label className={label}>
        {hinglish ? "Kuch aur? (optional)" : "Anything else? (optional)"}
        <input
          className={field}
          value={values.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder={
            hinglish ? "e.g. beach near, kids pool…" : "e.g. near beach, kids pool…"
          }
        />
      </label>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-[var(--accent)] py-2.5 text-sm font-medium text-[var(--sand)] disabled:opacity-50"
      >
        {pending
          ? hinglish
            ? "Market search ho rahi…"
            : "Searching market…"
          : hinglish
            ? "Shortlist laao"
            : "Get shortlist"}
      </button>
    </form>
  );
}
