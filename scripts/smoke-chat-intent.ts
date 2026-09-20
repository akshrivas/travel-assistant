import { detectConversationKind } from "../src/lib/engine/understand";
import { runAssistantTurn } from "../src/lib/engine/assistant";

async function main() {
  const samples = [
    "What is my name ?",
    "hi",
    "thanks",
    "what can you do",
    "Goa for 5 days, couple, around 50k",
  ];
  for (const s of samples) {
    console.log(JSON.stringify({ s, kind: detectConversationKind(s) }));
  }

  const r = await runAssistantTurn({
    message: "What is my name ?",
    profile: {
      displayName: "Ashish",
      partyType: "family",
      homeLocation: "Delhi",
      preferredDestinations: ["Manali"],
      knowledgeConfidence: 0.7,
      budgetCurrency: "INR",
    },
  });
  console.log("---");
  console.log("stage:", r.stage);
  console.log("kind:", r.conversationKind);
  console.log("reply:", r.reply);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
