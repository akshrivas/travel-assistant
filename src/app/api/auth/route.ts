import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSession, clearSession, getSession } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/require-user";
import {
  mergeProfileSnapshots,
} from "@/lib/auth/profile-snapshot";
import { toProfileView } from "@/lib/profile";
import type { CustomerProfileView } from "@/lib/types/travel";

const snapshotSchema = z
  .object({
    email: z.string().email().optional(),
    onboardingComplete: z.boolean().optional(),
    profile: z.record(z.string(), z.unknown()).optional(),
  })
  .optional();

const loginSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().regex(/^\d{4,6}$/).optional(),
  /** Restored from localStorage — survives ephemeral Vercel SQLite */
  snapshot: snapshotSchema,
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false });

  const user = await requireUser({ allowSetCookie: true });
  if (!user) {
    await clearSession();
    return NextResponse.json({ authenticated: false });
  }

  const onboardingComplete =
    Boolean(user.profile?.onboardingComplete) ||
    Boolean(session.onboardingComplete);

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      profile: user.profile ? toProfileView(user.profile) : null,
      onboardingComplete,
    },
  });
}

export async function POST(req: Request) {
  const body = loginSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const email = body.data.email.toLowerCase().trim();
  const prior = await getSession();
  const clientSnap = body.data.snapshot;

  // Prefer prior cookie + matching client backup over empty ephemeral DB
  const priorMatches = prior?.email?.toLowerCase() === email;
  const clientMatches =
    clientSnap?.email?.toLowerCase() === email || !clientSnap?.email;

  const restoredProfile = mergeProfileSnapshots(
    priorMatches ? prior?.profile : null,
    clientMatches && clientSnap?.profile
      ? (clientSnap.profile as Partial<CustomerProfileView>)
      : null,
  );

  const restoredComplete = Boolean(
    (priorMatches && prior?.onboardingComplete) ||
      (clientMatches && clientSnap?.onboardingComplete),
  );

  if (!body.data.code) {
    return NextResponse.json({
      needsCode: true,
      message: "Enter the 6-digit code we sent (demo: any 6 digits, e.g. 123456).",
    });
  }

  let userId = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  let onboardingComplete = restoredComplete;
  let profileView: Partial<CustomerProfileView> | null = restoredProfile;

  try {
    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: restoredProfile.displayName || email.split("@")[0],
          profile: {
            create: {
              displayName: restoredProfile.displayName ?? null,
              homeLocation: restoredProfile.homeLocation ?? null,
              preferredLanguage: restoredProfile.preferredLanguage || "en",
              partyType: restoredProfile.partyType ?? null,
              typicalDuration: restoredProfile.typicalDuration ?? null,
              budgetMin: restoredProfile.budgetMin ?? null,
              budgetMax: restoredProfile.budgetMax ?? null,
              budgetCurrency: restoredProfile.budgetCurrency || "INR",
              preferredDestinations: JSON.stringify(
                restoredProfile.preferredDestinations || [],
              ),
              preferencesJson: JSON.stringify(restoredProfile.preferences || {}),
              avoidancesJson: JSON.stringify(restoredProfile.avoidances || {}),
              knowledgeConfidence: restoredProfile.knowledgeConfidence ?? 0.1,
              onboardingComplete: restoredComplete,
            },
          },
        },
        include: { profile: true },
      });
    } else {
      if (!user.profile) {
        await prisma.profile.create({
          data: {
            userId: user.id,
            preferredLanguage: "en",
            budgetCurrency: "INR",
            onboardingComplete: restoredComplete,
            knowledgeConfidence: 0.1,
          },
        });
      } else if (
        restoredComplete &&
        !user.profile.onboardingComplete
      ) {
        // Ephemeral DB lost completion — restore from cookie/local backup
        await prisma.profile.update({
          where: { userId: user.id },
          data: {
            displayName:
              restoredProfile.displayName ?? user.profile.displayName,
            homeLocation:
              restoredProfile.homeLocation ?? user.profile.homeLocation,
            preferredLanguage:
              restoredProfile.preferredLanguage ||
              user.profile.preferredLanguage ||
              "en",
            partyType: restoredProfile.partyType ?? user.profile.partyType,
            typicalDuration:
              restoredProfile.typicalDuration ?? user.profile.typicalDuration,
            budgetMin: restoredProfile.budgetMin ?? user.profile.budgetMin,
            budgetMax: restoredProfile.budgetMax ?? user.profile.budgetMax,
            preferredDestinations: JSON.stringify(
              restoredProfile.preferredDestinations?.length
                ? restoredProfile.preferredDestinations
                : JSON.parse(user.profile.preferredDestinations || "[]"),
            ),
            preferencesJson: JSON.stringify(
              restoredProfile.preferences ||
                JSON.parse(user.profile.preferencesJson || "{}"),
            ),
            avoidancesJson: JSON.stringify(
              restoredProfile.avoidances ||
                JSON.parse(user.profile.avoidancesJson || "{}"),
            ),
            knowledgeConfidence: Math.max(
              restoredProfile.knowledgeConfidence ?? 0,
              user.profile.knowledgeConfidence ?? 0,
            ),
            onboardingComplete: true,
          },
        });
      }

      user = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { profile: true },
      });
    }

    userId = user.id;
    onboardingComplete =
      Boolean(user.profile?.onboardingComplete) || restoredComplete;
    profileView = user.profile
      ? mergeProfileSnapshots(toProfileView(user.profile), restoredProfile)
      : restoredProfile;
  } catch (err) {
    console.error("auth create fallback", err);
  }

  await setSession({
    userId,
    email,
    onboardingComplete,
    profile: profileView || undefined,
    t: Date.now(),
  });

  return NextResponse.json({
    authenticated: true,
    user: {
      id: userId,
      email,
      name: profileView?.displayName || email.split("@")[0],
      profile: profileView,
      onboardingComplete,
    },
  });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
