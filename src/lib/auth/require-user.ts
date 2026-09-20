import { prisma } from "@/lib/db";
import { getSession, setSession } from "@/lib/auth/session";
import {
  mergeProfileSnapshots,
} from "@/lib/auth/profile-snapshot";
import type { CustomerProfileView } from "@/lib/types/travel";

function emptyProfile(): CustomerProfileView {
  return {
    preferredLanguage: "en",
    budgetCurrency: "INR",
    preferredDestinations: [],
    preferences: {},
    avoidances: {},
    knowledgeConfidence: 0.1,
  };
}

function profileDataFromSnapshot(
  snap: Partial<CustomerProfileView>,
  onboardingComplete: boolean,
) {
  return {
    displayName: snap.displayName ?? null,
    homeLocation: snap.homeLocation ?? null,
    preferredLanguage: snap.preferredLanguage || "en",
    partyType: snap.partyType ?? null,
    typicalDuration: snap.typicalDuration ?? null,
    budgetMin: snap.budgetMin ?? null,
    budgetMax: snap.budgetMax ?? null,
    budgetCurrency: snap.budgetCurrency || "INR",
    preferredDestinations: JSON.stringify(snap.preferredDestinations || []),
    preferencesJson: JSON.stringify(snap.preferences || {}),
    avoidancesJson: JSON.stringify(snap.avoidances || {}),
    knowledgeConfidence: snap.knowledgeConfidence ?? 0.1,
    onboardingComplete,
  };
}

/**
 * Resolve logged-in user.
 * On Vercel, SQLite lives in ephemeral /tmp — the signed session cookie
 * (and optional client backup restored at login) is source of truth for
 * onboardingComplete. Never downgrade a completed session from an empty DB.
 */
export async function requireUser(opts?: { allowSetCookie?: boolean }) {
  const session = await getSession();
  if (!session?.email || session.email === "unknown@local") return null;

  const email = session.email.toLowerCase().trim();
  const allowSetCookie = opts?.allowSetCookie ?? false;

  try {
    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    const sessionComplete = Boolean(session.onboardingComplete);
    const snap = mergeProfileSnapshots(session.profile, null);

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: snap.displayName || email.split("@")[0],
          profile: {
            create: profileDataFromSnapshot(snap, sessionComplete),
          },
        },
        include: { profile: true },
      });
    } else if (!user.profile) {
      await prisma.profile.create({
        data: {
          userId: user.id,
          ...profileDataFromSnapshot(snap, sessionComplete),
        },
      });
      user = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { profile: true },
      });
    } else {
      const dbComplete = Boolean(user.profile.onboardingComplete);
      // Session says done but ephemeral DB lost it — restore into DB
      if (sessionComplete && !dbComplete) {
        await prisma.profile.update({
          where: { userId: user.id },
          data: profileDataFromSnapshot(snap, true),
        });
        if (snap.displayName) {
          await prisma.user.update({
            where: { id: user.id },
            data: { name: snap.displayName },
          });
        }
        user = await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          include: { profile: true },
        });
      }
    }

    const onboardingComplete =
      Boolean(user.profile?.onboardingComplete) || sessionComplete;

    // Only refresh cookie from Route Handlers / Server Actions — not RSC render
    if (
      allowSetCookie &&
      (user.id !== session.userId ||
        Boolean(session.onboardingComplete) !== onboardingComplete)
    ) {
      await setSession({
        userId: user.id,
        email,
        onboardingComplete,
        profile: mergeProfileSnapshots(session.profile, {
          displayName: user.profile?.displayName,
          homeLocation: user.profile?.homeLocation,
          preferredLanguage: user.profile?.preferredLanguage || "en",
          partyType: user.profile?.partyType,
          typicalDuration: user.profile?.typicalDuration,
          budgetMin: user.profile?.budgetMin,
          budgetMax: user.profile?.budgetMax,
          budgetCurrency: user.profile?.budgetCurrency || "INR",
          knowledgeConfidence: user.profile?.knowledgeConfidence,
        }),
        t: Date.now(),
      });
    }

    // Ensure returned profile reflects completed onboarding even if DB row lagged
    if (user.profile && onboardingComplete && !user.profile.onboardingComplete) {
      return {
        ...user,
        profile: { ...user.profile, onboardingComplete: true },
      };
    }

    return user;
  } catch (err) {
    console.error("requireUser db fallback", err);
    return {
      id: session.userId,
      email,
      name: session.profile?.displayName || email.split("@")[0],
      createdAt: new Date(),
      updatedAt: new Date(),
      profile: {
        id: "session-profile",
        userId: session.userId,
        displayName: session.profile?.displayName ?? null,
        homeLocation: session.profile?.homeLocation ?? null,
        preferredLanguage: session.profile?.preferredLanguage || "en",
        partyType: session.profile?.partyType ?? null,
        typicalDuration: session.profile?.typicalDuration ?? null,
        budgetMin: session.profile?.budgetMin ?? null,
        budgetMax: session.profile?.budgetMax ?? null,
        budgetCurrency: session.profile?.budgetCurrency || "INR",
        preferredDestinations: JSON.stringify(
          session.profile?.preferredDestinations || [],
        ),
        preferencesJson: JSON.stringify(session.profile?.preferences || {}),
        avoidancesJson: JSON.stringify(session.profile?.avoidances || {}),
        knowledgeConfidence: session.profile?.knowledgeConfidence ?? 0.1,
        onboardingComplete: session.onboardingComplete ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  }
}

export { emptyProfile };
