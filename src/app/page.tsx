import { redirect } from "next/navigation";
import { AssistantChat } from "@/components/AssistantChat";
import { getSession } from "@/lib/auth/session";
import { requireUser } from "@/lib/auth/require-user";
import { toProfileView } from "@/lib/profile";

export default async function Home() {
  const session = await getSession();
  if (!session?.email) redirect("/login");

  const user = await requireUser();
  const complete =
    user?.profile?.onboardingComplete || session.onboardingComplete;
  if (!complete) redirect("/onboarding");

  const profile = user?.profile
    ? toProfileView(user.profile)
    : {
        displayName: session.profile?.displayName,
        knowledgeConfidence: session.profile?.knowledgeConfidence ?? 0.2,
        preferredLanguage: "en",
        budgetCurrency: "INR",
        preferredDestinations: [],
        preferences: {},
        avoidances: {},
      };

  return (
    <AssistantChat
      userName={
        profile.displayName || user?.name || session.email.split("@")[0] || "Traveller"
      }
      userEmail={session.email}
      knowledgeConfidence={profile.knowledgeConfidence ?? 0.2}
      partyType={profile.partyType}
      homeLocation={profile.homeLocation}
      preferredDestinations={profile.preferredDestinations}
      preferredLanguage={profile.preferredLanguage || "hinglish"}
    />
  );
}
