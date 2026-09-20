import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

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

    const enquiry = await prisma.enquiry.create({
      data: {
        travelRequestId: request.id,
        optionId: parsed.data.optionId,
        optionSnapshot: JSON.stringify(parsed.data.optionSnapshot),
        status: "pending",
        providerRef: String(
          (parsed.data.optionSnapshot as { source?: { name?: string } })?.source
            ?.name ?? "unknown",
        ),
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
        }),
      },
    });

    return NextResponse.json({
      enquiryId: enquiry.id,
      status: enquiry.status,
      message:
        "Enquiry created. We’ll connect this to the provider for a quotation — subject to confirmation. (V1 connect path)",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
