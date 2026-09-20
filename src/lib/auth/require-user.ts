import { prisma } from "@/lib/db";
import { getSession, setSession } from "@/lib/auth/session";
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

/**
 * Resolve logged-in user. Prefers DB; falls back to session cookie snapshot
 * so Vercel serverless SQLite (ephemeral /tmp) doesn't break onboarding.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session?.email || session.email === "unknown@local") return null;

  const email = session.email.toLowerCase().trim();

  try {
    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: session.profile?.displayName || email.split("@")[0],
          profile: {
            create: {
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
            },
          },
        },
        include: { profile: true },
      });
    } else if (!user.profile) {
      await prisma.profile.create({
        data: {
          userId: user.id,
          preferredLanguage: "en",
          budgetCurrency: "INR",
          onboardingComplete: session.onboardingComplete ?? false,
          knowledgeConfidence: 0.1,
        },
      });
      user = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { profile: true },
      });
    }

    if (
      user.id !== session.userId ||
      Boolean(user.profile?.onboardingComplete) !== Boolean(session.onboardingComplete)
    ) {
      await setSession({
        userId: user.id,
        email,
        onboardingComplete: user.profile?.onboardingComplete ?? false,
        profile: session.profile,
        t: Date.now(),
      });
    }

    return user;
  } catch (err) {
    console.error("requireUser db fallback", err);
    // Ephemeral DB failed — synthesize from session so UX continues
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
