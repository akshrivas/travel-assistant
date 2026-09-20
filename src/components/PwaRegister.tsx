"use client";

import { useEffect } from "react";

/** Registers the service worker for installable / offline shell PWA behaviour. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Only register in production builds (and Vercel preview/prod hosts)
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (isLocal && process.env.NODE_ENV !== "production") {
      // Still allow local prod (`next start`) testing
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed", err));
  }, []);

  return null;
}
