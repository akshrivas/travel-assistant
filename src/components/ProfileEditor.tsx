"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerProfileView } from "@/lib/types/travel";

const PARTY = ["solo", "couple", "family", "friends"] as const;
const PACE = ["relaxed", "balanced", "adventure"] as const;
const INTERESTS = ["nature", "food", "culture", "beach", "adventure"] as const;

const field =
  "mt-1 w-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 outline-none focus:border-[var(--accent)]";

export function ProfileEditor() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [homeLocation, setHomeLocation] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [partyType, setPartyType] = useState<string | null>(null);
  const [typicalDuration, setTypicalDuration] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [destinations, setDestinations] = useState("");
  const [pace, setPace] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [avoidPacked, setAvoidPacked] = useState(false);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        const p = (d.profile || {}) as CustomerProfileView;
        setEmail(d.email || "");
        setDisplayName(p.displayName || "");
        setHomeLocation(p.homeLocation || "");
        setPreferredLanguage(p.preferredLanguage || "en");
        setPartyType(p.partyType || null);
        setTypicalDuration(p.typicalDuration ? String(p.typicalDuration) : "");
        setBudgetMax(p.budgetMax ? String(Math.round(p.budgetMax / 1000)) : "");
        setDestinations((p.preferredDestinations || []).join(", "));
        const prefs = p.preferences || {};
        setPace(typeof prefs.pace === "string" ? prefs.pace : null);
        setInterests(
          Array.isArray(prefs.interests) ? (prefs.interests as string[]) : [],
        );
        setAvoidPacked(Boolean(p.avoidances?.packedItinerary));
        setConfidence(p.knowledgeConfidence || 0);
      })
      .catch(() => setError("Could not load profile"))
      .finally(() => setLoading(false));
  }, []);

  function toggleInterest(id: string) {
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const max = budgetMax ? parseInt(budgetMax, 10) * 1000 : null;
    const destList = destinations
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    startTransition(async () => {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          homeLocation: homeLocation.trim() || null,
          preferredLanguage,
          partyType,
          typicalDuration: typicalDuration
            ? parseInt(typicalDuration, 10)
            : null,
          budgetMin: max ? Math.round(max * 0.7) : null,
          budgetMax: max,
          preferredDestinations: destList,
          preferences: {
            pace: pace || null,
            interests,
          },
          avoidances: avoidPacked
            ? { packedItinerary: true }
            : { packedItinerary: false },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setConfidence(data.profile?.knowledgeConfidence ?? confidence);
      setSaved(true);
      router.refresh();
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-[var(--muted)]">
        Loading what I know about you…
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--accent)] underline-offset-2 hover:underline">
          ← Back to chat
        </Link>
        <p className="text-xs text-[var(--muted)]">
          Know you: {Math.round(confidence * 100)}%
        </p>
      </div>

      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        What I know about you
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Correct anything that’s wrong — so the next trip starts smarter.
        {email ? (
          <span className="mt-1 block text-xs">Signed in as {email}</span>
        ) : null}
      </p>

      <form onSubmit={save} className="mt-8 space-y-5">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Name</span>
          <input
            className={field}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Home base</span>
          <input
            className={field}
            value={homeLocation}
            onChange={(e) => setHomeLocation(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Language</span>
          <select
            className={field}
            value={preferredLanguage}
            onChange={(e) => setPreferredLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </label>

        <div>
          <p className="mb-2 text-sm text-[var(--muted)]">Usually travel as</p>
          <div className="flex flex-wrap gap-2">
            {PARTY.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPartyType(p)}
                className={
                  partyType === p
                    ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm capitalize"
                    : "border border-[var(--line)] px-3 py-1.5 text-sm capitalize text-[var(--muted)]"
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Typical trip (days)</span>
          <input
            className={field}
            inputMode="numeric"
            value={typicalDuration}
            onChange={(e) => setTypicalDuration(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Usual budget (₹ thousands)</span>
          <input
            className={field}
            inputMode="numeric"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            placeholder="e.g. 60"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Liked destinations</span>
          <input
            className={field}
            value={destinations}
            onChange={(e) => setDestinations(e.target.value)}
            placeholder="Goa, Kerala"
          />
        </label>

        <div>
          <p className="mb-2 text-sm text-[var(--muted)]">Pace</p>
          <div className="flex flex-wrap gap-2">
            {PACE.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPace(p)}
                className={
                  pace === p
                    ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm capitalize"
                    : "border border-[var(--line)] px-3 py-1.5 text-sm capitalize text-[var(--muted)]"
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-[var(--muted)]">Interests</p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleInterest(i)}
                className={
                  interests.includes(i)
                    ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm capitalize"
                    : "border border-[var(--line)] px-3 py-1.5 text-sm capitalize text-[var(--muted)]"
                }
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={avoidPacked}
            onChange={(e) => setAvoidPacked(e.target.checked)}
          />
          Avoid very packed itineraries
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {saved && (
          <p className="text-sm text-[var(--accent)]">Saved — I’ll use this next time.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-[var(--accent)] py-3 text-[var(--sand)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save corrections"}
        </button>
      </form>
    </div>
  );
}
