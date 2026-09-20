import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { toProfileView } from "@/lib/profile";
import { runTripFormSearch } from "@/lib/engine/assistant";
import { formToBrief, type TripFormValues } from "@/lib/engine/trip-form";
import { prisma } from "@/lib/db";
import {
  ensureConversation,
  ensureDbUser,
  safePersist,
} from "@/lib/db/ensure";
import type { TravelEnquiryBrief } from "@/lib/types/travel";

export const maxDuration = 60;

const formSchema = z.object({
  destination: z.string().min(1).max(120),
  datesText: z.string().max(120).optional(),
  durationDays: z.number().int().min(1).max(60),
  partyType: z.enum(["solo", "couple", "family", "friends"]),
  travellers: z.number().int().min(1).max(20),
  budgetMax: z.number().min(1000),
  budgetMin: z.number().optional(),
  travelStyle: z.enum(["relaxed", "balanced", "adventure", "luxury"]),
  avoidPacked: z.boolean().optional(),
  needFlights: z.boolean().optional(),
  originCity: z.string().max(120).optional(),
  departDate: z.string().max(40).optional(),
  returnDate: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

const bodySchema = z.object({
  conversationId: z.string().optional(),
  priorBrief: z.record(z.string(), z.unknown()).optional().nullable(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(24)
    .optional(),
  form: formSchema,
});

export async function POST(req: Request) {
  try {
    const sessionUser = await requireUser({ allowSetCookie: true });
    if (!sessionUser?.profile || !sessionUser.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid trip brief", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const dbUser = await ensureDbUser({
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      profile: sessionUser.profile
        ? {
            displayName: sessionUser.profile.displayName,
            homeLocation: sessionUser.profile.homeLocation,
            preferredLanguage: sessionUser.profile.preferredLanguage,
            partyType: sessionUser.profile.partyType,
            typicalDuration: sessionUser.profile.typicalDuration,
            budgetMin: sessionUser.profile.budgetMin,
            budgetMax: sessionUser.profile.budgetMax,
            budgetCurrency: sessionUser.profile.budgetCurrency,
            preferredDestinations:
              sessionUser.profile.preferredDestinations ?? "[]",
            preferencesJson: sessionUser.profile.preferencesJson,
            avoidancesJson: sessionUser.profile.avoidancesJson,
            knowledgeConfidence: sessionUser.profile.knowledgeConfidence,
            onboardingComplete: sessionUser.profile.onboardingComplete,
          }
        : null,
    });

    const profile = toProfileView(dbUser.profile ?? sessionUser.profile);
    let conversationId = await ensureConversation(
      dbUser.id,
      parsed.data.conversationId,
    );

    const form = parsed.data.form as TripFormValues;
    const prior = (parsed.data.priorBrief || {}) as TravelEnquiryBrief;
    const brief = formToBrief(form, {
      ...prior,
      confidence: prior.confidence ?? 0,
      missingInformation: prior.missingInformation ?? [],
    });

    await safePersist("form-user-msg", () =>
      prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: `Trip brief: ${form.destination}, ${form.durationDays} days, ${form.partyType} ×${form.travellers}, ~₹${form.budgetMax} · hotels only`,
        },
      }),
    );

    const result = await runTripFormSearch({
      brief,
      profile,
      history: parsed.data.history,
    });

    const requestData = {
      intent: result.brief.intent,
      destination: result.brief.destination,
      datesText: result.brief.datesText,
      durationDays: result.brief.durationDays,
      travellers: result.brief.travellers,
      partyType: result.brief.partyType,
      budgetMin: result.brief.budgetMin,
      budgetMax: result.brief.budgetMax,
      budgetCurrency: result.brief.budgetCurrency ?? "INR",
      travelStyle: result.brief.travelStyle,
      preferencesJson: JSON.stringify(result.brief.preferences ?? {}),
      constraintsJson: JSON.stringify(result.brief.constraints ?? {}),
      temporaryJson: JSON.stringify(result.brief.temporary ?? {}),
      confidence: result.brief.confidence,
      missingJson: JSON.stringify(result.brief.missingInformation ?? []),
      rawBrief: result.brief.rawText,
      status: result.stage === "shortlist" ? "shortlisted" : "open",
    };

    const request = await safePersist("form-travel-request", async () => {
      conversationId = await ensureConversation(dbUser.id, conversationId);
      return prisma.travelRequest.create({
        data: {
          userId: dbUser.id,
          conversationId,
          ...requestData,
        },
      });
    });

    if (result.shortlist.length && request) {
      await safePersist("form-recommendation", () =>
        prisma.recommendation.create({
          data: {
            travelRequestId: request.id,
            optionsJson: JSON.stringify(
              result.shortlist.map((s) => s.option),
            ),
            reasonsJson: JSON.stringify(
              result.shortlist.map((s) => ({
                id: s.option.id,
                score: s.score,
                reason: s.reason,
                label: s.label,
              })),
            ),
          },
        }),
      );
    }

    await safePersist("form-assistant-msg", () =>
      prisma.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: result.reply,
          metadataJson: JSON.stringify({
            stage: result.stage,
            shortlist: result.shortlist,
            brief: result.brief,
          }),
        },
      }),
    );

    return NextResponse.json({
      conversationId,
      travelRequestId: request?.id || null,
      userId: dbUser.id,
      ...result,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Trip brief failed", detail: String(err) },
      { status: 500 },
    );
  }
}
