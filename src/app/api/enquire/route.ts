import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/engine/recommend";

const bodySchema = z.object({
  travelRequestId: z.string(),
  optionId: z.string(),
  optionSnapshot: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const request = await prisma.travelRequest.findUnique({
      where: { id: parsed.data.travelRequestId },
    });
    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const snap = parsed.data.optionSnapshot as {
      stay?: { name?: string; location?: string };
      destination?: string;
      durationDays?: number;
      price?: { amount?: number; currency?: string };
      source?: { name?: string; url?: string };
      player?: { name?: string; rating?: number; reviewCount?: number };
    };

    const hotelName =
      snap.stay?.name || snap.destination || "Selected hotel";
    const listingUrl = snap.source?.url || null;
    const provider =
      snap.player?.name || snap.source?.name || "Market listing";
    const amount = Number(snap.price?.amount) || 0;
    const currency = snap.price?.currency || "INR";
    const priceLabel = amount > 0 ? formatPrice(amount, currency) : "Price on listing";

    const enquiry = await prisma.enquiry.create({
      data: {
        travelRequestId: request.id,
        optionId: parsed.data.optionId,
        optionSnapshot: JSON.stringify(parsed.data.optionSnapshot),
        status: "pending",
        providerRef: String(provider),
      },
    });

    await prisma.travelRequest.update({
      where: { id: request.id },
      data: { status: "enquired" },
    });

    await prisma.behaviourSignal.create({
      data: {
        userId: request.userId,
        type: "save",
        payloadJson: JSON.stringify({
          optionId: parsed.data.optionId,
          enquiryId: enquiry.id,
          hotelName,
        }),
      },
    });

    const nextStep = listingUrl
      ? "Listing kholo — wahan dates/guests confirm karke book/enquire karo. Hum OTA nahi; connect path yahi hai."
      : "Provider listing URL nahi mili — shortlist se dusra option try karo.";

    return NextResponse.json({
      enquiryId: enquiry.id,
      status: enquiry.status,
      enquiry: {
        id: enquiry.id,
        status: "pending" as const,
        statusLabel: "Pending · connect on listing",
        hotelName,
        destination: snap.destination || request.destination || "",
        durationDays: snap.durationDays || request.durationDays || null,
        location: snap.stay?.location || null,
        priceLabel,
        provider,
        listingUrl,
        rating: snap.player?.rating ?? null,
        reviewCount: snap.player?.reviewCount ?? null,
        createdAt: enquiry.createdAt,
        nextStep,
      },
      message: `**${hotelName}** enquiry saved · status Pending. ${nextStep}`,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
