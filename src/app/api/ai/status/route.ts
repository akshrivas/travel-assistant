import { NextResponse } from "next/server";
import { isAiEnabled, getAiProvider, defaultModel } from "@/lib/ai/client";

export async function GET() {
  return NextResponse.json({
    enabled: isAiEnabled(),
    provider: getAiProvider(),
    model: isAiEnabled() ? defaultModel() : null,
  });
}
