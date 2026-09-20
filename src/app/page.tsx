import { redirect } from "next/navigation";
import { AssistantChat } from "@/components/AssistantChat";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth/session";
import { toProfileView } from "@/lib/profile";

export default async function Home() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) redirect("/login");
  if (!user.profile?.onboardingComplete) redirect("/onboarding");

  const profile = toProfileView(user.profile);

  return (
    <AssistantChat
      userName={profile.displayName || user.name || "Traveller"}
      knowledgeConfidence={profile.knowledgeConfidence}
    />
  );
}
