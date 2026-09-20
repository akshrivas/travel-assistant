import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth/session";
import { computeKnowledgeConfidence, toProfileView } from "@/lib/profile";

const onboardingSchema = z.object({
  // US-011
  displayName: z.string().min(1).max(80).optional(),
  homeLocation: z.string().max(120).optional(),
  preferredLanguage: z.string().max(10).optional(),
  // US-012
  partyType: z.enum(["solo", "couple", "family", "friends"]).optional().nullable(),
  typicalDuration: z.number().int().min(1).max(60).optional().nullable(),
  budgetMin: z.number().int().min(0).optional().nullable(),
  budgetMax: z.number().int().min(0).optional().nullable(),
  preferredDestinations: z.array(z.string()).optional(),
  // US-013
  preferences: z.record(z.string(), z.unknown()).optional(),
  avoidances: z.record(z.string(), z.unknown()).optional(),
  complete: z.boolean().optional(),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  return NextResponse.json({
    profile: toProfileView(profile),
    onboardingComplete: profile.onboardingComplete,
  });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = onboardingSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid onboarding data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const existing = await prisma.profile.findUnique({ where: { userId } });
  if (!existing) {
    return NextResponse.json({ error: "No profile" }, { status: 404 });
  }

  const preferredDestinations =
    d.preferredDestinations !== undefined
      ? JSON.stringify(d.preferredDestinations)
      : existing.preferredDestinations;

  const preferences =
    d.preferences !== undefined
      ? { ...JSON.parse(existing.preferencesJson || "{}"), ...d.preferences }
      : JSON.parse(existing.preferencesJson || "{}");

  const avoidances =
    d.avoidances !== undefined
      ? { ...JSON.parse(existing.avoidancesJson || "{}"), ...d.avoidances }
      : JSON.parse(existing.avoidancesJson || "{}");

  const displayName =
    d.displayName !== undefined ? d.displayName : existing.displayName;
  const homeLocation =
    d.homeLocation !== undefined ? d.homeLocation : existing.homeLocation;
  const partyType =
    d.partyType !== undefined ? d.partyType : existing.partyType;
  const typicalDuration =
    d.typicalDuration !== undefined ? d.typicalDuration : existing.typicalDuration;
  const budgetMin = d.budgetMin !== undefined ? d.budgetMin : existing.budgetMin;
  const budgetMax = d.budgetMax !== undefined ? d.budgetMax : existing.budgetMax;

  const knowledgeConfidence = computeKnowledgeConfidence({
    displayName,
    homeLocation,
    partyType,
    budgetMin,
    budgetMax,
    typicalDuration,
    preferredDestinations: preferredDestinations
      ? (JSON.parse(preferredDestinations) as string[])
      : [],
    preferences,
  });

  const profile = await prisma.profile.update({
    where: { userId },
    data: {
      displayName: displayName ?? undefined,
      homeLocation: homeLocation ?? undefined,
      preferredLanguage: d.preferredLanguage ?? existing.preferredLanguage,
      partyType: partyType,
      typicalDuration: typicalDuration,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
      preferredDestinations,
      preferencesJson: JSON.stringify(preferences),
      avoidancesJson: JSON.stringify(avoidances),
      knowledgeConfidence,
      onboardingComplete: d.complete ? true : existing.onboardingComplete,
    },
  });

  if (d.displayName) {
    await prisma.user.update({
      where: { id: userId },
      data: { name: d.displayName },
    });
  }

  return NextResponse.json({
    profile: toProfileView(profile),
    onboardingComplete: profile.onboardingComplete,
  });
}
