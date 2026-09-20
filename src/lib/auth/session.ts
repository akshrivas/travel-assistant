import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { CustomerProfileView } from "@/lib/types/travel";

const COOKIE = "ta_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type SessionPayload = {
  userId: string;
  email: string;
  onboardingComplete?: boolean;
  profile?: Partial<CustomerProfileView>;
  t: number;
};

function secret() {
  return process.env.SESSION_SECRET || "travel-assistant-dev-secret-change-me";
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!data.email || !data.userId) return null;
    return data;
  } catch {
    return null;
  }
}

export async function setSession(payload: SessionPayload) {
  const jar = await cookies();
  jar.set(
    COOKIE,
    sign({ ...payload, email: payload.email.toLowerCase(), t: Date.now() }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.VERCEL === "1",
      path: "/",
      maxAge: MAX_AGE,
    },
  );
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verify(token);
}

export async function getSessionUserId(): Promise<string | null> {
  const s = await getSession();
  return s?.userId ?? null;
}
