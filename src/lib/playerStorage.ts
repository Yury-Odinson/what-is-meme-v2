"use client";

import Cookies from "js-cookie";

export type PlayerProfile = {
  name: string;
};

const COOKIE_KEY = "meme-player";

export function loadPlayerProfile(): PlayerProfile {
  try {
    const raw = Cookies.get(COOKIE_KEY);
    if (!raw) return { name: "" };
    const parsed = JSON.parse(raw);
    return { name: parsed.name || "" };
  } catch {
    return { name: "" };
  }
}

export function savePlayerProfile(profile: PlayerProfile) {
  Cookies.set(COOKIE_KEY, JSON.stringify(profile), { expires: 365 });
}
