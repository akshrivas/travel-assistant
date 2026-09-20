import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const userId = await getSessionUserId();
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (user?.profile?.onboardingComplete) redirect("/");
    if (user) redirect("/onboarding");
  }
  return <LoginForm />;
}
