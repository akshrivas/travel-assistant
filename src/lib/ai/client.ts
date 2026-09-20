import OpenAI from "openai";

export type AiProvider = "openai" | "none";

export function getAiProvider(): AiProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export function isAiEnabled() {
  return getAiProvider() !== "none";
}

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export function defaultModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}
