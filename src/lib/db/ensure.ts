import { prisma } from "@/lib/db";

/**
 * Vercel SQLite lives in ephemeral /tmp. A conversationId from the client
 * may not exist on a cold instance — recreate instead of FK-crashing.
 */
export async function ensureDbUser(input: {
  id: string;
  email: string;
  name?: string | null;
  profile?: {
    displayName?: string | null;
    homeLocation?: string | null;
    preferredLanguage?: string | null;
    partyType?: string | null;
    typicalDuration?: number | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    budgetCurrency?: string | null;
    preferredDestinations?: string;
    preferencesJson?: string;
    avoidancesJson?: string;
    knowledgeConfidence?: number;
    onboardingComplete?: boolean;
  } | null;
}) {
  const email = input.email.toLowerCase().trim();
  let user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: input.id,
        email,
        name: input.name || email.split("@")[0],
        profile: {
          create: {
            displayName: input.profile?.displayName ?? null,
            homeLocation: input.profile?.homeLocation ?? null,
            preferredLanguage: input.profile?.preferredLanguage || "en",
            partyType: input.profile?.partyType ?? null,
            typicalDuration: input.profile?.typicalDuration ?? null,
            budgetMin: input.profile?.budgetMin ?? null,
            budgetMax: input.profile?.budgetMax ?? null,
            budgetCurrency: input.profile?.budgetCurrency || "INR",
            preferredDestinations:
              input.profile?.preferredDestinations || "[]",
            preferencesJson: input.profile?.preferencesJson || "{}",
            avoidancesJson: input.profile?.avoidancesJson || "{}",
            knowledgeConfidence: input.profile?.knowledgeConfidence ?? 0.1,
            onboardingComplete: input.profile?.onboardingComplete ?? false,
          },
        },
      },
      include: { profile: true },
    });
  }

  return user;
}

export async function ensureConversation(
  userId: string,
  conversationId?: string | null,
): Promise<string> {
  if (conversationId) {
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (existing) {
      // Repair ownership if needed
      if (existing.userId !== userId) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { userId },
        });
      }
      return existing.id;
    }

    try {
      await prisma.conversation.create({
        data: {
          id: conversationId,
          userId,
          title: "Trip chat",
        },
      });
      return conversationId;
    } catch (err) {
      console.warn("recreate conversation with same id failed", err);
    }
  }

  const conv = await prisma.conversation.create({
    data: { userId, title: "Trip chat" },
  });
  return conv.id;
}

/** Never let persistence kill the chat reply */
export async function safePersist<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`persist:${label}`, err);
    return null;
  }
}
