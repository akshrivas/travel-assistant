import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ProfileEditor } from "@/components/ProfileEditor";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.email) redirect("/login");
  if (!session.onboardingComplete) redirect("/onboarding");

  return <ProfileEditor />;
}
