import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/require-user";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.email) {
    const user = await requireUser();
    if (user?.profile?.onboardingComplete) redirect("/");
    if (user) redirect("/onboarding");
  }
  return <LoginForm />;
}
