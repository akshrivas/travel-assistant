"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RankedOption } from "@/lib/types/travel";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  shortlist?: RankedOption[];
};

const PROMPTS = [
  "December mein family ke saath 6 din Kashmir jaana hai, budget 60k",
  "Goa for 5 days, couple, around 50k, something peaceful",
  "Kerala relaxed trip, 6 days, family, under 70k",
];

function renderContent(text: string) {
  return text.split("\n").map((line, i) => {
    const html = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return (
      <p
        key={i}
        className={line.trim() === "" ? "h-2" : "leading-relaxed"}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
}

export function AssistantChat({
  userName = "Traveller",
  knowledgeConfidence = 0.2,
}: {
  userName?: string;
  knowledgeConfidence?: number;
}) {
  const knowLine =
    knowledgeConfidence >= 0.45
      ? "Ready when you are — tell me the trip and I’ll search live listings from major platforms, then shortlist the strongest fits."
      : "Tell me where in India you’re headed, roughly how many days, and your budget. I’ll search live market listings and shortlist the best-reviewed options that fit.";

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: knowLine,
    },
  ]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [travelRequestId, setTravelRequestId] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [enquireMsg, setEnquireMsg] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAiOn(Boolean(d.enabled)))
      .catch(() => setAiOn(false));
  }, []);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setEnquireMsg(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, conversationId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content: data.detail || data.error || "Something went wrong.",
            },
          ]);
          return;
        }
        setConversationId(data.conversationId);
        setTravelRequestId(data.travelRequestId);
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: data.reply,
            shortlist: data.shortlist,
          },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: "Network error — please try again.",
          },
        ]);
      }
    });
  }

  async function enquire(option: RankedOption) {
    if (!travelRequestId) return;
    setEnquireMsg(null);
    const res = await fetch("/api/enquire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        travelRequestId,
        optionId: option.option.id,
        optionSnapshot: option.option,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setEnquireMsg(data.message);
      // view signal
    } else {
      setEnquireMsg(data.error || "Enquiry failed");
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between gap-4 px-4 py-5">
          <div>
            <p className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)]">
              Sahayatri
            </p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              Personal travel assistant · India · existing market, best deals
            </p>
          </div>
          <div className="flex items-center gap-3">
            {aiOn !== null && (
              <span
                className={
                  aiOn
                    ? "text-[10px] uppercase tracking-wide text-[var(--accent)]"
                    : "text-[10px] uppercase tracking-wide text-[var(--muted)]"
                }
              >
                {aiOn ? "AI on" : "AI off"}
              </span>
            )}
            <p className="hidden text-xs text-[var(--muted)] sm:block">
              {userName}
            </p>
            <a
              href="/profile"
              className="text-xs text-[var(--muted)] underline underline-offset-2"
            >
              Preferences
            </a>
            <button
              type="button"
              className="text-xs text-[var(--muted)] underline underline-offset-2"
              onClick={async () => {
                await fetch("/api/auth", { method: "DELETE" });
                window.location.href = "/login";
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 pt-6">
        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === "user"
                  ? "ml-8 rounded-2xl rounded-br-md bg-[var(--ink)] px-4 py-3 text-[var(--sand)]"
                  : "mr-4 rounded-2xl rounded-bl-md bg-[var(--surface)] px-4 py-3 text-[var(--ink)] shadow-[0_1px_0_var(--line)]"
              }
            >
              <div className="text-[15px]">{renderContent(msg.content)}</div>
              {msg.shortlist && msg.shortlist.length > 0 && (
                <div className="mt-4 space-y-3">
                  {msg.shortlist.map((item) => (
                    <div
                      key={item.option.id}
                      className="border border-[var(--line)] bg-[var(--bg)] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-[var(--accent)]">
                            {item.label}
                          </p>
                          <p className="font-[family-name:var(--font-display)] text-lg">
                            {item.option.destination} · {item.option.durationDays}{" "}
                            days
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {item.option.stay?.name}
                            {item.option.player
                              ? ` · ${item.option.player.name}`
                              : ""}
                          </p>
                          <p className="mt-1 text-sm">{item.reason}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Source: {item.option.source.name}
                            {item.option.player?.reviewCount
                              ? ` · ${item.option.player.reviewCount} reviews`
                              : ""}
                            {" · "}
                            checked{" "}
                            {new Date(
                              item.option.source.lastCheckedAt,
                            ).toLocaleString("en-IN")}
                          </p>
                          {item.option.source.url ? (
                            <a
                              href={item.option.source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block text-xs text-[var(--accent)] underline underline-offset-2"
                            >
                              View listing
                            </a>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p className="font-[family-name:var(--font-display)] text-xl">
                            ₹{item.option.price.amount.toLocaleString("en-IN")}
                          </p>
                          <button
                            type="button"
                            onClick={() => enquire(item)}
                            className="mt-2 text-sm underline underline-offset-4 hover:text-[var(--accent)]"
                          >
                            Enquire
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {pending && (
            <p className="text-sm text-[var(--muted)]">
              Searching live market listings…
            </p>
          )}
          {enquireMsg && (
            <p className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-sm">
              {enquireMsg}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => send(p)}
              className="max-w-full truncate rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-left text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
            >
              {p}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2 border-t border-[var(--line)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Where do you want to go?"
            className="flex-1 bg-transparent px-2 py-3 text-[15px] outline-none placeholder:text-[var(--muted)]"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="bg-[var(--accent)] px-5 py-2 text-sm font-medium text-[var(--sand)] transition hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
