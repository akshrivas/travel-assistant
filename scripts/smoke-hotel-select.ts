import { matchShortlistOption, wantsEnquireConfirm } from "../src/lib/engine/select-option";
import { runAssistantTurn } from "../src/lib/engine/assistant";
import type { RankedOption } from "../src/lib/types/travel";

const shortlist: RankedOption[] = [
  {
    label: "Relaxed",
    score: 0.9,
    reason: "Calm stay",
    option: {
      id: "opt-1",
      destination: "Manali",
      country: "IN",
      durationDays: 5,
      durationNights: 4,
      stay: { name: "The Himalayan" },
      price: { amount: 42000, currency: "INR" },
      source: {
        id: "web",
        name: "Web",
        type: "catalog",
        lastCheckedAt: new Date().toISOString(),
        url: "https://example.com/himalayan",
      },
    },
  },
  {
    label: "Adventure",
    score: 0.8,
    reason: "Resort vibes",
    option: {
      id: "opt-2",
      destination: "Manali",
      country: "IN",
      durationDays: 5,
      durationNights: 4,
      stay: { name: "Manu Allaya Resort" },
      price: { amount: 55000, currency: "INR" },
      source: {
        id: "web",
        name: "Web",
        type: "catalog",
        lastCheckedAt: new Date().toISOString(),
      },
    },
  },
];

async function main() {
  process.env.OPENAI_API_KEY = "";

  const m1 = matchShortlistOption("The himalayan", shortlist);
  const m2 = matchShortlistOption("2", shortlist);
  console.log({
    himalayan: m1?.option.stay?.name,
    second: m2?.option.stay?.name,
    haan: wantsEnquireConfirm("Haan.."),
  });
  if (m1?.option.id !== "opt-1") throw new Error("name match failed");

  const r = await runAssistantTurn({
    message: "The himalayan",
    priorBrief: {
      intent: "leisure_trip",
      destination: "Manali",
      durationDays: 5,
      partyType: "couple",
      travellers: 2,
      budgetMax: 50000,
      confidence: 0.9,
      missingInformation: [],
      preferences: { formCompleted: true, conversationKind: "travel_plan" },
    },
    priorShortlist: shortlist,
    profile: {
      displayName: "Ashish",
      preferredLanguage: "hi",
      knowledgeConfidence: 0.7,
      budgetCurrency: "INR",
    },
  });

  console.log({
    stage: r.stage,
    selected: r.selectedOption?.option.stay?.name,
    reply: r.reply.slice(0, 160),
  });

  if (r.stage !== "selected" || r.selectedOption?.option.id !== "opt-1") {
    throw new Error("hotel lock did not select The Himalayan");
  }
  if (/check-?in|room preference|number of guests/i.test(r.reply)) {
    throw new Error("reply still asks booking questionnaire");
  }

  const r2 = await runAssistantTurn({
    message: "Haan..",
    priorBrief: r.brief,
    priorShortlist: shortlist,
    profile: {
      preferredLanguage: "hi",
      knowledgeConfidence: 0.7,
      budgetCurrency: "INR",
    },
  });
  console.log({ stage2: r2.stage, selected2: r2.selectedOption?.option.stay?.name });
  if (r2.stage !== "enquire") throw new Error("haan did not confirm enquire");

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
