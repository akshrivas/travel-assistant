"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Step = 1 | 2 | 3;

const PARTY = [
  { id: "solo", label: "Solo" },
  { id: "couple", label: "Couple" },
  { id: "family", label: "Family" },
  { id: "friends", label: "Friends" },
] as const;

const PACE = ["relaxed", "balanced", "adventure"] as const;
const INTERESTS = ["nature", "food", "culture", "beach", "adventure"] as const;

const fieldClass =
  "mt-1 w-full border border-[var(--line)] bg-[var(--surface)] px-3 py-3 outline-none focus:border-[var(--accent)]";
const btnClass =
  "bg-[var(--accent)] px-4 py-3 text-[var(--sand)] disabled:opacity-50";
const ghostClass =
  "border border-[var(--line)] px-4 py-3 text-[var(--muted)] disabled:opacity-50";

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  function toggleInterest(id: string) {
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function buildPayload(complete: boolean) {
    const destList = destinations
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const max = budgetMax ? parseInt(budgetMax, 10) * 1000 : null;
    const preferences: Record<string, unknown> = {};
    if (pace) preferences.pace = pace;
    if (interests.length) preferences.interests = interests;
    const avoidances: Record<string, unknown> = {};
    if (avoidPacked) avoidances.packedItinerary = true;

    return {
      displayName: displayName.trim() || undefined,
      homeLocation: homeLocation.trim() || undefined,
      preferredLanguage,
      partyType,
      typicalDuration: typicalDuration ? parseInt(typicalDuration, 10) : null,
      budgetMin: max ? Math.round(max * 0.7) : null,
      budgetMax: max,
      preferredDestinations: destList,
      preferences,
      avoidances,
      complete,
    };
  }

  function save(complete: boolean, next?: Step | "done") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(complete)),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Could not save");
          return;
        }
        if (next === "done") {
          router.push("/");
          router.refresh();
        } else if (next) {
          setStep(next);
        }
      } catch {
        setError("Network error — please try again");
      }
    });
  }

  function submitStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("What should we call you?");
      return;
    }
    // Persist full snapshot each step (serverless-safe)
    save(false, 2);
  }

  function submitStep2(skip: boolean) {
    if (skip) {
      setStep(3);
      return;
    }
    save(false, 3);
  }

  function submitStep3(skip: boolean) {
    save(true, "done");
    if (skip) {
      // still marks complete with whatever we have
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 py-10">
      <p className="text-xs uppercase tracking-wider text-[var(--accent)]">
        Step {step} of 3 · ~1 minute
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        {step === 1 && "Let’s know you"}
        {step === 2 && "How you usually travel"}
        {step === 3 && "What you enjoy"}
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        {step === 1 && "Basics only — so replies feel personal."}
        {step === 2 && "Optional. Skip anytime — we’ll learn as we go."}
        {step === 3 && "Optional preferences. You can change these later."}
      </p>

      {step === 1 && (
        <form onSubmit={submitStep1} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="text-[var(--muted)]">What should I call you?</span>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={fieldClass}
              placeholder="Your name"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Home base (city / country)</span>
            <input
              value={homeLocation}
              onChange={(e) => setHomeLocation(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Delhi, India"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Preferred language</span>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className={fieldClass}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={pending} className={btnClass}>
            {pending ? "Saving…" : "Continue"}
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="mt-8 space-y-5">
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Usually travel as</p>
            <div className="flex flex-wrap gap-2">
              {PARTY.map((p) => (
                <Chip
                  key={p.id}
                  active={partyType === p.id}
                  onClick={() => setPartyType(p.id)}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Typical trip length (days)</span>
            <input
              inputMode="numeric"
              value={typicalDuration}
              onChange={(e) => setTypicalDuration(e.target.value)}
              className={fieldClass}
              placeholder="e.g. 6"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">
              Usual budget (₹ thousands, e.g. 60 = ₹60k)
            </span>
            <input
              inputMode="numeric"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              className={fieldClass}
              placeholder="e.g. 60"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Places you like (comma-separated)</span>
            <input
              value={destinations}
              onChange={(e) => setDestinations(e.target.value)}
              className={fieldClass}
              placeholder="Goa, Kerala, Kashmir"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => submitStep2(false)}
              className={`${btnClass} flex-1`}
            >
              {pending ? "Saving…" : "Continue"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => submitStep2(true)}
              className={ghostClass}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-8 space-y-5">
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Pace</p>
            <div className="flex flex-wrap gap-2">
              {PACE.map((p) => (
                <Chip key={p} active={pace === p} onClick={() => setPace(p)}>
                  {p}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">Interests</p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <Chip
                  key={i}
                  active={interests.includes(i)}
                  onClick={() => toggleInterest(i)}
                >
                  {i}
                </Chip>
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
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => submitStep3(false)}
              className={`${btnClass} flex-1`}
            >
              {pending ? "Saving…" : "Finish — plan a trip"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => submitStep3(true)}
              className={ghostClass}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm capitalize"
          : "border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm capitalize text-[var(--muted)]"
      }
    >
      {children}
    </button>
  );
}
