import {
  detectConversationKind,
  extractLockedDestination,
  understandTravelEnquiry,
  wantsTripForm,
} from "../src/lib/engine/understand";
import { runAssistantTurn } from "../src/lib/engine/assistant";

async function main() {
  const samples = [
    "Lock karo manali",
    "manali lock karo",
    "Manali",
    "form dikhao",
    "from dikhao",
    "Yeah.. from dikhao",
    "hi",
    "What is my name ?",
  ];

  for (const s of samples) {
    console.log(
      JSON.stringify({
        s,
        kind: detectConversationKind(s),
        locked: extractLockedDestination(s),
        wantsForm: wantsTripForm(s),
        dest: understandTravelEnquiry(s, {
          destination: s.includes("dikhao") ? "Manali" : undefined,
        }).destination,
      }),
    );
  }

  process.env.OPENAI_API_KEY = "";
  const r = await runAssistantTurn({
    message: "Lock karo manali",
    profile: {
      displayName: "Ashish",
      partyType: "family",
      homeLocation: "Delhi",
      typicalDuration: 5,
      budgetMax: 60000,
      knowledgeConfidence: 0.7,
      budgetCurrency: "INR",
      preferredLanguage: "hi",
    },
  });
  console.log("--- lock turn ---");
  console.log({
    stage: r.stage,
    dest: r.brief.destination,
    kind: r.conversationKind,
    reply: r.reply.slice(0, 140),
  });

  const r2 = await runAssistantTurn({
    message: "from dikhao",
    priorBrief: {
      ...r.brief,
      preferences: { ...r.brief.preferences, formCompleted: false },
    },
    profile: {
      displayName: "Ashish",
      partyType: "family",
      knowledgeConfidence: 0.7,
      budgetCurrency: "INR",
      preferredLanguage: "hi",
    },
  });
  console.log("--- form dikhao ---");
  console.log({
    stage: r2.stage,
    dest: r2.brief.destination,
    kind: r2.conversationKind,
  });

  if (r.stage !== "trip_form" || r.brief.destination !== "Manali") {
    throw new Error("Lock karo manali did not open trip_form with Manali");
  }
  if (r2.stage !== "trip_form" || r2.brief.destination !== "Manali") {
    throw new Error("form dikhao did not reopen trip_form");
  }
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
