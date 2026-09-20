"use client";

import type { RankedOption } from "@/lib/types/travel";

export const CHAT_MEMORY_KEY = "tripsaathi_chat_v1";

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  shortlist?: RankedOption[];
  enquiry?: Record<string, unknown>;
};

export type ChatMemory = {
  email: string;
  conversationId?: string;
  travelRequestId?: string;
  priorBrief?: Record<string, unknown> | null;
  messages: StoredChatMessage[];
  updatedAt: number;
};

export function readChatMemory(email?: string | null): ChatMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHAT_MEMORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatMemory;
    if (!parsed?.messages?.length) return null;
    if (email && parsed.email && parsed.email !== email.toLowerCase().trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeChatMemory(memory: ChatMemory) {
  if (typeof window === "undefined") return;
  try {
    const payload: ChatMemory = {
      ...memory,
      email: memory.email.toLowerCase().trim(),
      updatedAt: Date.now(),
      // Cap so localStorage stays healthy
      messages: memory.messages.slice(-40),
    };
    localStorage.setItem(CHAT_MEMORY_KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function clearChatMemory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CHAT_MEMORY_KEY);
  } catch {
    /* ignore */
  }
}

/** Compact history for the model — last N turns */
export function historyForModel(
  messages: StoredChatMessage[],
  limit = 12,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((m) => m.id !== "welcome")
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));
}
