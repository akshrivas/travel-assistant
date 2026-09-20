import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/require-user";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.email) redirect("/login");

  const user = await requireUser();
  if (user?.profile?.onboardingComplete || session.onboardingComplete) {
    redirect("/");
  }

  return <OnboardingWizard />;
}
