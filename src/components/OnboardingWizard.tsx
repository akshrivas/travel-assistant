"use client";

import { APP_NAME } from "@/lib/brand";
import {
  readProfileBackup,
  writeProfileBackup,
} from "@/lib/auth/client-backup";
import { useEffect, useState, useTransition } from "react";
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
const HOTEL = [
  { id: "homestay", label: "Homestay" },
  { id: "boutique", label: "Boutique" },
  { id: "resort", label: "Resort" },
  { id: "budget", label: "Budget stay" },
  { id: "luxury", label: "Luxury" },
] as const;
const LANGS = [
  { id: "hinglish", label: "Hinglish" },
  { id: "en", label: "English" },
  { id: "hi", label: "हिंदी" },
] as const;

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
  const [restoring, setRestoring] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [homeLocation, setHomeLocation] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("hinglish");

  const [partyType, setPartyType] = useState<string | null>(null);
  const [typicalDuration, setTypicalDuration] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [destinations, setDestinations] = useState("");

  const [pace, setPace] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [hotel, setHotel] = useState<string | null>(null);
  const [avoidPacked, setAvoidPacked] = useState(false);
  const [vegPrefer, setVegPrefer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const backup = readProfileBackup();
      if (!backup?.onboardingComplete || !backup.profile) {
        if (!cancelled) setRestoring(false);
        return;
      }
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: backup.profile.displayName || undefined,
            homeLocation: backup.profile.homeLocation || undefined,
            preferredLanguage: backup.profile.preferredLanguage || "hinglish",
            partyType: backup.profile.partyType ?? null,
            typicalDuration: backup.profile.typicalDuration ?? null,
            budgetMin: backup.profile.budgetMin ?? null,
            budgetMax: backup.profile.budgetMax ?? null,
            preferredDestinations: backup.profile.preferredDestinations || [],
            preferences: backup.profile.preferences || {},
            avoidances: backup.profile.avoidances || {},
            complete: true,
          }),
        });
        if (res.ok && !cancelled) {
          writeProfileBackup({
            email: backup.email,
            onboardingComplete: true,
            profile: backup.profile,
          });
          router.replace("/");
          router.refresh();
          return;
        }
      } catch {
        /* fall through */
      }
      if (!cancelled) setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
    if (hotel) preferences.hotel = hotel;
    if (vegPrefer) preferences.food = "veg-friendly";
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
        if (data.email && data.profile) {
          writeProfileBackup({
            email: data.email,
            onboardingComplete: Boolean(data.onboardingComplete),
            profile: data.profile,
          });
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
      setError(
        preferredLanguage === "hi"
          ? "Naam toh batao?"
          : preferredLanguage === "en"
            ? "What should we call you?"
            : "Naam toh bata do yaar",
      );
      return;
    }
    save(false, 2);
  }

  function submitStep2(skip: boolean) {
    if (skip) {
      setStep(3);
      return;
    }
    save(false, 3);
  }

  function submitStep3() {
    save(true, "done");
  }

  const copy = {
    stepLabel: "Step",
    of: "of",
    minute: "~1 minute",
    h1:
      step === 1
        ? preferredLanguage === "hi"
          ? "Pehle aapko jaanein"
          : preferredLanguage === "en"
            ? "Let’s know you"
            : "Pehle thoda jaan lein"
        : step === 2
          ? preferredLanguage === "hi"
            ? "Aap kaise ghumte ho"
            : preferredLanguage === "en"
              ? "How you usually travel"
              : "Usually kaise ghumte ho"
          : preferredLanguage === "hi"
            ? "Kya pasand hai"
            : preferredLanguage === "en"
              ? "What you enjoy"
              : "Kya vibe pasand hai",
    sub:
      step === 1
        ? preferredLanguage === "en"
          ? "Basics only — so replies feel personal."
          : "Bas basics — taaki baat personal lage."
        : preferredLanguage === "en"
          ? "Optional. Skip anytime — we’ll learn as we go."
          : "Optional hai. Skip kar sakte ho — baad mein seekh lenge.",
  };

  if (restoring) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-4 py-10">
        <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
          {APP_NAME}
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {preferredLanguage === "en"
            ? "Restoring your profile…"
            : "Profile wapas laa rahe hain…"}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 py-10">
      <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
        {APP_NAME}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wider text-[var(--accent)]">
        {copy.stepLabel} {step} {copy.of} 3 · {copy.minute}
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--ink)]">
        {copy.h1}
      </h1>
      <p className="mt-2 text-[var(--muted)]">{copy.sub}</p>

      {step === 1 && (
        <form onSubmit={submitStep1} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="text-[var(--muted)]">
              {preferredLanguage === "en"
                ? "What should I call you?"
                : "Kya bulau aapko?"}
            </span>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={fieldClass}
              placeholder={preferredLanguage === "en" ? "Your name" : "Naam"}
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">
              {preferredLanguage === "en"
                ? "Home base (city / country)"
                : "Ghar kahan? (city / country)"}
            </span>
            <input
              value={homeLocation}
              onChange={(e) => setHomeLocation(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Delhi, India"
            />
          </label>
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">
              {preferredLanguage === "en"
                ? "Chat language"
                : "Baat kis language mein?"}
            </p>
            <div className="flex flex-wrap gap-2">
              {LANGS.map((l) => (
                <Chip
                  key={l.id}
                  active={preferredLanguage === l.id}
                  onClick={() => setPreferredLanguage(l.id)}
                >
                  {l.label}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {preferredLanguage === "en"
                ? "I’ll still match whatever language you type in chat."
                : "Chat mein jo language likhoge, usi mein reply milega."}
            </p>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={pending} className={btnClass}>
            {pending
              ? preferredLanguage === "en"
                ? "Saving…"
                : "Save ho raha…"
              : preferredLanguage === "en"
                ? "Continue"
                : "Aage badho"}
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="mt-8 space-y-5">
          <div>
            <p className="mb-2 text-sm text-[var(--muted)]">
              {preferredLanguage === "en"
                ? "Usually travel as"
                : "Usually kaise ghumte ho"}
            </p>
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
            <span className="text-[var(--muted)]">
              {preferredLanguage === "en"
                ? "Typical trip length (days)"
                : "Usually kitne din ka trip?"}
            </span>
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
              {preferredLanguage === "en"
                ? "Usual budget (₹ thousands, e.g. 60 = ₹60k)"
                : "Usual budget (₹ thousands — 60 = ₹60k)"}
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
            <span className="text-[var(--muted)]">
              {preferredLanguage === "en"
                ? "Places you like (comma-separated)"
                : "Pasand ke places (comma se alag)"}
            </span>
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
              {pending
                ? "…"
                : preferredLanguage === "en"
                  ? "Continue"
                  : "Aage badho"}
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
            <p className="mb-2 text-sm text-[var(--muted)]">
              {preferredLanguage === "en" ? "Stay style" : "Stay ka style"}
            </p>
            <div className="flex flex-wrap gap-2">
              {HOTEL.map((h) => (
                <Chip
                  key={h.id}
                  active={hotel === h.id}
                  onClick={() => setHotel(h.id)}
                >
                  {h.label}
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
            {preferredLanguage === "en"
              ? "Avoid very packed itineraries"
              : "Bahut packed itinerary mat dena"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={vegPrefer}
              onChange={(e) => setVegPrefer(e.target.checked)}
            />
            {preferredLanguage === "en"
              ? "Prefer veg-friendly food options"
              : "Veg-friendly food prefer hai"}
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => submitStep3()}
              className={`${btnClass} flex-1`}
            >
              {pending
                ? "…"
                : preferredLanguage === "en"
                  ? "Finish — plan a trip"
                  : "Ho gaya — trip plan karo"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => submitStep3()}
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
