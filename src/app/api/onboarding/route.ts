import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getSession, setSession } from "@/lib/auth/session";
import { computeKnowledgeConfidence, toProfileView } from "@/lib/profile";

const onboardingSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  homeLocation: z.string().max(120).optional(),
  preferredLanguage: z.string().max(10).optional(),
  partyType: z.enum(["solo", "couple", "family", "friends"]).optional().nullable(),
  typicalDuration: z.number().int().min(1).max(60).optional().nullable(),
  budgetMin: z.number().int().min(0).optional().nullable(),
  budgetMax: z.number().int().min(0).optional().nullable(),
  preferredDestinations: z.array(z.string()).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  avoidances: z.record(z.string(), z.unknown()).optional(),
  complete: z.boolean().optional(),
});

export async function GET() {
  const user = await requireUser();
  const session = await getSession();
  if (!user?.profile && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user?.profile) {
    return NextResponse.json({
      profile: toProfileView(user.profile),
      onboardingComplete: user.profile.onboardingComplete,
    });
  }

  return NextResponse.json({
    profile: session?.profile || {},
    onboardingComplete: session?.onboardingComplete || false,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = onboardingSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid onboarding data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const prev = session.profile || {};

  const preferredDestinations =
    d.preferredDestinations !== undefined
      ? d.preferredDestinations
      : prev.preferredDestinations || [];

  const preferences =
    d.preferences !== undefined
      ? { ...(prev.preferences || {}), ...d.preferences }
      : prev.preferences || {};

  const avoidances =
    d.avoidances !== undefined
      ? { ...(prev.avoidances || {}), ...d.avoidances }
      : prev.avoidances || {};

  const displayName =
    d.displayName !== undefined ? d.displayName : prev.displayName;
  const homeLocation =
    d.homeLocation !== undefined ? d.homeLocation : prev.homeLocation;
  const partyType = d.partyType !== undefined ? d.partyType : prev.partyType;
  const typicalDuration =
    d.typicalDuration !== undefined ? d.typicalDuration : prev.typicalDuration;
  const budgetMin = d.budgetMin !== undefined ? d.budgetMin : prev.budgetMin;
  const budgetMax = d.budgetMax !== undefined ? d.budgetMax : prev.budgetMax;
  const preferredLanguage =
    d.preferredLanguage ?? prev.preferredLanguage ?? "en";

  const knowledgeConfidence = computeKnowledgeConfidence({
    displayName,
    homeLocation,
    partyType,
    budgetMin,
    budgetMax,
    typicalDuration,
    preferredDestinations,
    preferences,
  });

  const profileView = {
    displayName: displayName ?? null,
    homeLocation: homeLocation ?? null,
    preferredLanguage,
    partyType: partyType ?? null,
    typicalDuration: typicalDuration ?? null,
    budgetMin: budgetMin ?? null,
    budgetMax: budgetMax ?? null,
    budgetCurrency: "INR",
    preferredDestinations,
    preferences,
    avoidances,
    knowledgeConfidence,
  };

  const onboardingComplete = d.complete
    ? true
    : Boolean(session.onboardingComplete);

  // Always persist snapshot in cookie (works across Vercel instances)
  let userId = session.userId;
  try {
    const user = await requireUser();
    if (user?.profile) {
      userId = user.id;
      await prisma.profile.update({
        where: { userId },
        data: {
          displayName: profileView.displayName,
          homeLocation: profileView.homeLocation,
          preferredLanguage: profileView.preferredLanguage,
          partyType: profileView.partyType,
          typicalDuration: profileView.typicalDuration,
          budgetMin: profileView.budgetMin,
          budgetMax: profileView.budgetMax,
          preferredDestinations: JSON.stringify(preferredDestinations),
          preferencesJson: JSON.stringify(preferences),
          avoidancesJson: JSON.stringify(avoidances),
          knowledgeConfidence,
          onboardingComplete,
        },
      });
      if (displayName) {
        await prisma.user.update({
          where: { id: userId },
          data: { name: displayName },
        });
      }
    }
  } catch (err) {
    console.error("onboarding db write", err);
  }

  await setSession({
    userId,
    email: session.email,
    onboardingComplete,
    profile: profileView,
    t: Date.now(),
  });

  return NextResponse.json({
    profile: profileView,
    onboardingComplete,
  });
}
