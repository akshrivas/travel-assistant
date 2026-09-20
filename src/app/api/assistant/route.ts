import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth/session";
import { toProfileView } from "@/lib/profile";
import { runAssistantTurn } from "@/lib/engine/assistant";
import type { TravelEnquiryBrief } from "@/lib/types/travel";

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
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

export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user?.profile) {
      return NextResponse.json({ error: "Profile required" }, { status: 400 });
    }

    const profile = toProfileView(user.profile);

    let conversationId = parsed.data.conversationId;
    if (!conversationId) {
      const conv = await prisma.conversation.create({
        data: { userId: user.id, title: "Trip chat" },
      });
      conversationId = conv.id;
    }

    await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: parsed.data.message,
      },
    });

    const priorReq = await prisma.travelRequest.findFirst({
      where: { conversationId, status: { in: ["open", "shortlisted"] } },
      orderBy: { updatedAt: "desc" },
    });

    const result = await runAssistantTurn({
      message: parsed.data.message,
      priorBrief: priorReq ? briefFromRequest(priorReq) : null,
      profile,
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

    const request = priorReq
      ? await prisma.travelRequest.update({
          where: { id: priorReq.id },
          data: requestData,
        })
      : await prisma.travelRequest.create({
          data: {
            userId: user.id,
            conversationId,
            ...requestData,
          },
        });

    if (result.shortlist.length) {
      await prisma.recommendation.create({
        data: {
          travelRequestId: request.id,
          optionsJson: JSON.stringify(result.shortlist.map((s) => s.option)),
          reasonsJson: JSON.stringify(
            result.shortlist.map((s) => ({
              id: s.option.id,
              score: s.score,
              reason: s.reason,
              label: s.label,
            })),
          ),
        },
      });

      await prisma.behaviourSignal.create({
        data: {
          userId: user.id,
          type: "search",
          payloadJson: JSON.stringify({
            destination: result.brief.destination,
            count: result.shortlist.length,
          }),
        },
      });
    }

    await prisma.message.create({
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
    });

    return NextResponse.json({
      conversationId,
      travelRequestId: request.id,
      userId: user.id,
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
