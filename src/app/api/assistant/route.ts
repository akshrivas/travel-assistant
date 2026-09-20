import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { toProfileView } from "@/lib/profile";
import { runAssistantTurn } from "@/lib/engine/assistant";
import { prisma } from "@/lib/db";
import {
  ensureConversation,
  ensureDbUser,
  safePersist,
} from "@/lib/db/ensure";
import type { TravelEnquiryBrief } from "@/lib/types/travel";

/** Live web search can exceed default serverless limits */
export const maxDuration = 60;

const briefSchema = z
  .object({
    intent: z.string().optional().nullable(),
    destination: z.string().optional().nullable(),
    datesText: z.string().optional().nullable(),
    durationDays: z.number().optional().nullable(),
    travellers: z.number().optional().nullable(),
    partyType: z.string().optional().nullable(),
    budgetMin: z.number().optional().nullable(),
    budgetMax: z.number().optional().nullable(),
    budgetCurrency: z.string().optional().nullable(),
    travelStyle: z.string().optional().nullable(),
    preferences: z.record(z.string(), z.unknown()).optional().nullable(),
    constraints: z.record(z.string(), z.unknown()).optional().nullable(),
    temporary: z.record(z.string(), z.unknown()).optional().nullable(),
    confidence: z.number().optional().nullable(),
    missingInformation: z.array(z.string()).optional().nullable(),
    rawText: z.string().optional().nullable(),
  })
  .optional()
  .nullable();

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
  /** Client-held brief — survives ephemeral Vercel SQLite cold starts */
  priorBrief: briefSchema,
  /** Recent chat turns for conversational memory */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(24)
    .optional(),
});

function briefFromRequest(priorReq: {
  intent: string | null;
  destination: string | null;
  datesText: string | null;
  durationDays: number | null;
  travellers: number | null;
  partyType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
  travelStyle: string | null;
  preferencesJson: string;
  constraintsJson: string;
  temporaryJson: string;
  confidence: number;
  missingJson: string;
  rawBrief: string | null;
}): TravelEnquiryBrief {
  return {
    intent: priorReq.intent ?? undefined,
    destination: priorReq.destination ?? undefined,
    datesText: priorReq.datesText ?? undefined,
    durationDays: priorReq.durationDays ?? undefined,
    travellers: priorReq.travellers ?? undefined,
    partyType: priorReq.partyType ?? undefined,
    budgetMin: priorReq.budgetMin ?? undefined,
    budgetMax: priorReq.budgetMax ?? undefined,
    budgetCurrency: priorReq.budgetCurrency,
    travelStyle: priorReq.travelStyle ?? undefined,
    preferences: JSON.parse(priorReq.preferencesJson || "{}"),
    constraints: JSON.parse(priorReq.constraintsJson || "{}"),
    temporary: JSON.parse(priorReq.temporaryJson || "{}"),
    confidence: priorReq.confidence,
    missingInformation: JSON.parse(priorReq.missingJson || "[]"),
    rawText: priorReq.rawBrief ?? undefined,
  };
}

function briefFromClient(
  raw: z.infer<typeof briefSchema>,
): TravelEnquiryBrief | null {
  if (!raw) return null;
  return {
    intent: raw.intent ?? undefined,
    destination: raw.destination ?? undefined,
    datesText: raw.datesText ?? undefined,
    durationDays: raw.durationDays ?? undefined,
    travellers: raw.travellers ?? undefined,
    partyType: raw.partyType ?? undefined,
    budgetMin: raw.budgetMin ?? undefined,
    budgetMax: raw.budgetMax ?? undefined,
    budgetCurrency: raw.budgetCurrency ?? "INR",
    travelStyle: raw.travelStyle ?? undefined,
    preferences: (raw.preferences as Record<string, unknown>) || {},
    constraints: (raw.constraints as Record<string, unknown>) || {},
    temporary: (raw.temporary as Record<string, unknown>) || {},
    confidence: raw.confidence ?? 0,
    missingInformation: raw.missingInformation ?? [],
    rawText: raw.rawText ?? undefined,
  };
}

export async function POST(req: Request) {
  try {
    const sessionUser = await requireUser({ allowSetCookie: true });
    if (!sessionUser?.profile || !sessionUser.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Make sure User row exists on this ephemeral DB instance
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

    await safePersist("user-message", () =>
      prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content: parsed.data.message,
        },
      }),
    );

    const priorReq = await safePersist("load-prior", () =>
      prisma.travelRequest.findFirst({
        where: { conversationId, status: { in: ["open", "shortlisted"] } },
        orderBy: { updatedAt: "desc" },
      }),
    );

    const priorBrief =
      (priorReq ? briefFromRequest(priorReq) : null) ||
      briefFromClient(parsed.data.priorBrief);

    const result = await runAssistantTurn({
      message: parsed.data.message,
      priorBrief,
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

    let travelRequestId: string | undefined = priorReq?.id;

    const request = await safePersist("travel-request", async () => {
      // Re-ensure conversation in case /tmp flipped mid-request (rare)
      conversationId = await ensureConversation(dbUser.id, conversationId);
      if (priorReq?.id) {
        const stillThere = await prisma.travelRequest.findUnique({
          where: { id: priorReq.id },
        });
        if (stillThere) {
          return prisma.travelRequest.update({
            where: { id: priorReq.id },
            data: requestData,
          });
        }
      }
      return prisma.travelRequest.create({
        data: {
          userId: dbUser.id,
          conversationId,
          ...requestData,
        },
      });
    });

    if (request) travelRequestId = request.id;

    if (result.shortlist.length && request) {
      await safePersist("recommendation", () =>
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

      await safePersist("signal", () =>
        prisma.behaviourSignal.create({
          data: {
            userId: dbUser.id,
            type: "search",
            payloadJson: JSON.stringify({
              destination: result.brief.destination,
              count: result.shortlist.length,
            }),
          },
        }),
      );
    }

    await safePersist("assistant-message", () =>
      prisma.message.create({
        data: {
          conversationId,
          role: "assistant",
          content: result.reply,
          metadataJson: JSON.stringify({
            stage: result.stage,
            shortlist: result.shortlist,
            brief: result.brief,
            usedAi: result.usedAi,
          }),
        },
      }),
    );

    if (result.longTermPreferenceHints && dbUser.profile) {
      await safePersist("profile-learn", async () => {
        const hints = result.longTermPreferenceHints!;
        const prefs = {
          ...JSON.parse(dbUser.profile!.preferencesJson || "{}"),
        } as Record<string, unknown>;
        const avoids = {
          ...JSON.parse(dbUser.profile!.avoidancesJson || "{}"),
        } as Record<string, unknown>;

        if (hints.pace) prefs.pace = hints.pace;
        if (hints.hotel) prefs.hotel = hints.hotel;
        if (hints.interests?.length) {
          const prev = Array.isArray(prefs.interests)
            ? (prefs.interests as string[])
            : [];
          prefs.interests = [...new Set([...prev, ...hints.interests])];
        }
        if (hints.avoidances?.length) {
          for (const a of hints.avoidances) avoids[a] = true;
        }

        return prisma.profile.update({
          where: { userId: dbUser.id },
          data: {
            partyType: hints.partyType || dbUser.profile!.partyType,
            preferencesJson: JSON.stringify(prefs),
            avoidancesJson: JSON.stringify(avoids),
            knowledgeConfidence: Math.min(
              0.95,
              (dbUser.profile!.knowledgeConfidence || 0.2) + 0.05,
            ),
          },
        });
      });
    }

    return NextResponse.json({
      conversationId,
      travelRequestId: travelRequestId || null,
      userId: dbUser.id,
      aiEnabled: result.usedAi,
      ...result,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Assistant failed", detail: String(err) },
      { status: 500 },
    );
  }
}
