"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { APP_NAME } from "@/lib/brand";
import { clearProfileBackup } from "@/lib/auth/client-backup";
import {
  clearChatMemory,
  historyForModel,
  readChatMemory,
  writeChatMemory,
  type StoredChatMessage,
} from "@/lib/auth/chat-memory";
import type { RankedOption } from "@/lib/types/travel";

type ChatMessage = StoredChatMessage;

type TripSpark = {
  label: string;
  place: string;
  vibe: string;
  prompt: string;
};

const SPARKS: TripSpark[] = [
  {
    label: "Snow + family",
    place: "Kashmir",
    vibe: "6 days · ~₹60k",
    prompt:
      "December mein family ke saath 6 din Kashmir jaana hai, budget 60k",
  },
  {
    label: "Quiet coast",
    place: "Goa",
    vibe: "5 days · couple · calm",
    prompt: "Goa for 5 days, couple, around 50k, something peaceful",
  },
  {
    label: "Backwaters",
    place: "Kerala",
    vibe: "6 days · family · easy",
    prompt: "Kerala relaxed trip, 6 days, family, under 70k",
  },
];

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name: string): string {
  const n = name.trim().split(/\s+/)[0] || "there";
  if (n.toLowerCase() === "traveller") return "there";
  return n;
}

function buildWelcome(input: {
  userName: string;
  knowledgeConfidence: number;
  partyType?: string | null;
  homeLocation?: string | null;
  preferredDestinations?: string[];
  preferredLanguage?: string | null;
}): { greeting: string; body: string } {
  const name = firstName(input.userName);
  const lang = input.preferredLanguage || "hinglish";

  const greet =
    lang === "hi"
      ? `${timeGreetingHi()}, ${name}.`
      : lang === "en"
        ? `${timeGreeting()}, ${name}.`
        : `${timeGreetingHinglish()}, ${name}.`;

  if (input.knowledgeConfidence >= 0.45) {
    const bits: string[] = [];
    if (input.partyType) bits.push(`${input.partyType} trips`);
    if (input.preferredDestinations?.[0]) {
      bits.push(
        lang === "en"
          ? `${input.preferredDestinations[0]} on your radar`
          : `${input.preferredDestinations[0]} pe nazar`,
      );
    }
    if (lang === "en") {
      const known = bits.length
        ? `I already know you lean ${bits.join(" · ")}.`
        : "I already know a bit about how you like to travel.";
      return {
        greeting: greet,
        body: `${known} Tell me the next India trip — I’ll search live listings and shortlist the strongest fits.`,
      };
    }
    const known = bits.length
      ? `Main jaanta hoon — ${bits.join(" · ")}.`
      : "Thoda pehle se jaanta hoon aapki travel vibe.";
    return {
      greeting: greet,
      body: `${known} Agla India trip batao — live listings search karke best fits shortlist karunga.`,
    };
  }

  if (lang === "en") {
    return {
      greeting: greet,
      body: "Where in India are you headed, roughly how many days, and what’s the budget? I’ll search live market listings and bring back the best-reviewed options.",
    };
  }
  return {
    greeting: greet,
    body: "India mein kahan jaana hai, roughly kitne din, aur budget? Live market se best-reviewed options nikaal ke laata hoon.",
  };
}

function timeGreetingHinglish(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeGreetingHi(): string {
  const h = new Date().getHours();
  if (h < 12) return "सुप्रभात";
  if (h < 17) return "नमस्ते";
  return "शुभ संध्या";
}

function lastTopicHint(messages: ChatMessage[]): string | null {
  const recent = [...messages]
    .reverse()
    .find((m) => m.role === "user" && m.id !== "welcome");
  if (!recent) return null;
  const t = recent.content.trim();
  return t.length > 72 ? `${t.slice(0, 70)}…` : t;
}

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

function SearchingDots({ label }: { label: string }) {
  return (
    <div className="ts-fade mr-4 flex items-center gap-3 rounded-2xl rounded-bl-md border border-[var(--line)]/60 bg-[var(--surface)]/90 px-4 py-3 text-sm text-[var(--muted)]">
      <span className="inline-flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
            style={{
              animation: `ts-pulse-dot 1.1s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

export function AssistantChat({
  userName = "Traveller",
  userEmail = "",
  knowledgeConfidence = 0.2,
  partyType = null,
  homeLocation = null,
  preferredDestinations = [],
  preferredLanguage = "hinglish",
}: {
  userName?: string;
  userEmail?: string;
  knowledgeConfidence?: number;
  partyType?: string | null;
  homeLocation?: string | null;
  preferredDestinations?: string[];
  preferredLanguage?: string | null;
}) {
  const welcome = useMemo(
    () =>
      buildWelcome({
        userName,
        knowledgeConfidence,
        partyType,
        homeLocation,
        preferredDestinations,
        preferredLanguage,
      }),
    [
      userName,
      knowledgeConfidence,
      partyType,
      homeLocation,
      preferredDestinations,
      preferredLanguage,
    ],
  );

  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [travelRequestId, setTravelRequestId] = useState<string | undefined>();
  const [priorBrief, setPriorBrief] = useState<Record<string, unknown> | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [enquireMsg, setEnquireMsg] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emailKey = userEmail.toLowerCase().trim();

  // Restore conversation from device memory (survives refresh / PWA reopen)
  useEffect(() => {
    const mem = readChatMemory(emailKey || undefined);
    if (mem?.messages?.length) {
      setMessages(mem.messages);
      setConversationId(mem.conversationId);
      setTravelRequestId(mem.travelRequestId);
      setPriorBrief(mem.priorBrief ?? null);
      const hasRealChat = mem.messages.some(
        (m) => m.role === "user" || (m.role === "assistant" && m.id !== "welcome"),
      );
      setStarted(hasRealChat);
    } else {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `${welcome.greeting}\n\n${welcome.body}`,
        },
      ]);
      setStarted(false);
    }
    setReady(true);
  }, [emailKey, welcome.greeting, welcome.body]);

  // Persist thread whenever it changes
  useEffect(() => {
    if (!ready || !emailKey || !messages.length) return;
    writeChatMemory({
      email: emailKey,
      conversationId,
      travelRequestId,
      priorBrief,
      messages,
      updatedAt: Date.now(),
    });
  }, [
    ready,
    emailKey,
    conversationId,
    travelRequestId,
    priorBrief,
    messages,
  ]);

  useEffect(() => {
    if (!ready) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, ready]);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAiOn(Boolean(d.enabled)))
      .catch(() => setAiOn(false));
  }, []);

  const showHero = ready && !started && messages.length <= 1;
  const topic = lastTopicHint(messages);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending || !ready) return;

    setStarted(true);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setEnquireMsg(null);

    const history = historyForModel(nextMessages);

    startTransition(async () => {
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            conversationId,
            priorBrief,
            history,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content:
                "Something went wrong on my side — try that again in a moment.",
            },
          ]);
          return;
        }
        setConversationId(data.conversationId);
        if (data.travelRequestId) setTravelRequestId(data.travelRequestId);
        if (data.brief) setPriorBrief(data.brief);
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
    } else {
      setEnquireMsg(data.error || "Enquiry failed");
    }
  }

  function startFresh() {
    clearChatMemory();
    setConversationId(undefined);
    setTravelRequestId(undefined);
    setPriorBrief(null);
    setEnquireMsg(null);
    setStarted(false);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `${welcome.greeting}\n\n${welcome.body}`,
      },
    ]);
  }

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-sm text-[var(--muted)]">
        Picking up where we left off…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="ts-drift absolute -left-1/4 top-[-10%] h-[55vh] w-[70vw] rounded-full bg-[radial-gradient(circle_at_center,#9ecfb4_0%,transparent_68%)] opacity-70" />
        <div
          className="ts-drift absolute -right-1/5 top-[20%] h-[40vh] w-[55vw] rounded-full bg-[radial-gradient(circle_at_center,#c9db9a_0%,transparent_70%)] opacity-50"
          style={{ animationDelay: "-5s" }}
        />
      </div>

      <header className="relative z-10 border-b border-[var(--line)]/70 bg-[var(--surface)]/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-tight text-[var(--ink)] sm:text-[1.75rem]">
              {APP_NAME}
            </p>
            <p className="mt-1 truncate text-xs text-[var(--muted)] sm:text-sm">
              {started && topic
                ? `Continuing · ${topic}`
                : `Live market · India${aiOn ? " · AI on" : aiOn === false ? " · AI off" : ""}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {started ? (
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                onClick={startFresh}
              >
                New chat
              </button>
            ) : null}
            <a
              href="/profile"
              className="text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
            >
              Preferences
            </a>
            <button
              type="button"
              className="text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
              onClick={async () => {
                clearProfileBackup();
                clearChatMemory();
                await fetch("/api/auth", { method: "DELETE" });
                window.location.href = "/login";
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        {showHero ? (
          <section className="flex flex-1 flex-col justify-center pb-6">
            <p className="ts-rise text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
              {timeGreeting()}
            </p>
            <h1 className="ts-rise-delay-1 mt-3 font-[family-name:var(--font-display)] text-[2.35rem] leading-[1.05] tracking-tight text-[var(--ink)] sm:text-5xl">
              {APP_NAME}
            </h1>
            <p className="ts-rise-delay-2 mt-4 max-w-md text-[1.05rem] leading-relaxed text-[var(--ink)]/90">
              <span className="font-medium">{welcome.greeting}</span>
              <br />
              <span className="text-[var(--muted)]">{welcome.body}</span>
            </p>

            <div className="ts-rise-delay-3 mt-8 space-y-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Start with a spark
              </p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {SPARKS.map((s) => (
                  <button
                    key={s.place}
                    type="button"
                    onClick={() => send(s.prompt)}
                    disabled={pending}
                    className="group border border-[var(--line)] bg-[var(--surface)]/80 px-3.5 py-3.5 text-left transition duration-300 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--sand)] disabled:opacity-50"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-[var(--accent)]">
                      {s.label}
                    </p>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
                      {s.place}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{s.vibe}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <div className="flex-1 space-y-3.5 overflow-y-auto pb-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.role === "user"
                    ? "ts-msg-in ml-6 rounded-2xl rounded-br-md bg-[var(--ink)] px-4 py-3 text-[var(--sand)] sm:ml-10"
                    : "ts-msg-in mr-4 rounded-2xl rounded-bl-md border border-[var(--line)]/60 bg-[var(--surface)]/90 px-4 py-3 text-[var(--ink)] backdrop-blur-sm"
                }
              >
                <div className="text-[15px]">{renderContent(msg.content)}</div>
                {msg.shortlist && msg.shortlist.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {msg.shortlist.map((item) => (
                      <div
                        key={item.option.id}
                        className="border border-[var(--line)] bg-[var(--bg)]/80 px-3 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-wider text-[var(--accent)]">
                              {item.label}
                            </p>
                            <p className="font-[family-name:var(--font-display)] text-lg">
                              {item.option.destination} ·{" "}
                              {item.option.durationDays} days
                            </p>
                            <p className="text-sm text-[var(--muted)]">
                              {item.option.stay?.name}
                              {item.option.player
                                ? ` · ${item.option.player.name}`
                                : ""}
                            </p>
                            <p className="mt-1 text-sm">{item.reason}</p>
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
                          <div className="shrink-0 text-right">
                            <p className="font-[family-name:var(--font-display)] text-xl">
                              ₹
                              {item.option.price.amount.toLocaleString("en-IN")}
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
              <SearchingDots label="Listening to the thread… crafting a reply" />
            )}
            {enquireMsg && (
              <p className="ts-fade border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-sm">
                {enquireMsg}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        <form
          className="ts-composer mt-auto flex gap-2 border border-[var(--line)] bg-[var(--surface)]/90 px-3 py-2 backdrop-blur-md transition"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              showHero
                ? "Type a trip — e.g. Goa, 5 days, 50k…"
                : "Continue the conversation…"
            }
            className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] outline-none placeholder:text-[var(--muted)]"
            disabled={pending}
            autoFocus
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="bg-[var(--accent)] px-5 py-2 text-sm font-medium text-[var(--sand)] transition hover:brightness-110 disabled:opacity-40"
          >
            {pending ? "…" : "Send"}
          </button>
        </form>
      </main>
    </div>
  );
}
