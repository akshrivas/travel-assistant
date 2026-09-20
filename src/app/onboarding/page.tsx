import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (profile?.onboardingComplete) redirect("/");

  return <OnboardingWizard />;
}
