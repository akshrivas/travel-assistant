import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSessionUserId, clearSession, getSessionUserId } from "@/lib/auth/session";
import { toProfileView } from "@/lib/profile";

const loginSchema = z.object({
  email: z.string().email().max(200),
  /** Thin V1: accept any 4–6 digit code (OTP provider later) */
  code: z.string().regex(/^\d{4,6}$/).optional(),
});

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ authenticated: false });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) {
    await clearSession();
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      profile: user.profile ? toProfileView(user.profile) : null,
      onboardingComplete: user.profile?.onboardingComplete ?? false,
    },
  });
}

export async function POST(req: Request) {
  const body = loginSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const email = body.data.email.toLowerCase().trim();
  // Thin auth: if code sent, must be present; for V1 we accept any 4-6 digits
  // Step 1 can be email-only → returns needsCode; step 2 with code logs in.
  if (!body.data.code) {
    return NextResponse.json({
      needsCode: true,
      message: "Enter the 6-digit code we sent (demo: any 6 digits, e.g. 123456).",
    });
  }

  let user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        profile: {
          create: {
            preferredLanguage: "en",
            budgetCurrency: "INR",
            onboardingComplete: false,
            knowledgeConfidence: 0.1,
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
        onboardingComplete: false,
        knowledgeConfidence: 0.1,
      },
    });
    user = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { profile: true },
    });
  }

  await setSessionUserId(user.id);

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      profile: user.profile ? toProfileView(user.profile) : null,
      onboardingComplete: user.profile?.onboardingComplete ?? false,
    },
  });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
