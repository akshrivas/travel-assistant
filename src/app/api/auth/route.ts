import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSession, clearSession, getSession } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/require-user";
import { toProfileView } from "@/lib/profile";

const loginSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().regex(/^\d{4,6}$/).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false });

  const user = await requireUser();
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
      onboardingComplete:
        user.profile?.onboardingComplete || session.onboardingComplete || false,
    },
  });
}

export async function POST(req: Request) {
  const body = loginSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const email = body.data.email.toLowerCase().trim();

  if (!body.data.code) {
    return NextResponse.json({
      needsCode: true,
      message: "Enter the 6-digit code we sent (demo: any 6 digits, e.g. 123456).",
    });
  }

  let userId = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  let onboardingComplete = false;
  let profileView = null;

  try {
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

    userId = user.id;
    onboardingComplete = user.profile?.onboardingComplete ?? false;
    profileView = user.profile ? toProfileView(user.profile) : null;
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
