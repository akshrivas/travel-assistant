"use client";

import {
  PROFILE_BACKUP_KEY,
  isProfileBackup,
  type ProfileBackup,
} from "@/lib/auth/profile-snapshot";
import type { CustomerProfileView } from "@/lib/types/travel";

export function readProfileBackup(): ProfileBackup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isProfileBackup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeProfileBackup(input: {
  email: string;
  onboardingComplete: boolean;
  profile: Partial<CustomerProfileView>;
}) {
  if (typeof window === "undefined") return;
  try {
    const payload: ProfileBackup = {
      email: input.email.toLowerCase().trim(),
      onboardingComplete: input.onboardingComplete,
      profile: input.profile,
      savedAt: Date.now(),
    };
    localStorage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode — cookie session remains primary
  }
}

export function clearProfileBackup() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PROFILE_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}
