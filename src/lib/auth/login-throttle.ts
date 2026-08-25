import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const LOGIN_WINDOW_MINUTES = 15;
export const MAX_EMAIL_FAILED_ATTEMPTS = 8;
export const MAX_CLIENT_FAILED_ATTEMPTS = 40;
export const MAX_GLOBAL_FAILED_ATTEMPTS = 5_000;

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleLoginEmail(email: string): boolean {
  const normalized = normalizeLoginEmail(email);
  const at = normalized.indexOf("@");
  return normalized.length > 2 &&
    at > 0 &&
    at === normalized.lastIndexOf("@") &&
    at < normalized.length - 1 &&
    !/[\s\u0000-\u001f\u007f]/.test(normalized);
}

export function loginClientKey(headers: Headers): string | null {
  const candidate = firstValidIp(
    headers.get("x-vercel-forwarded-for") ??
      headers.get("x-forwarded-for") ??
      headers.get("x-real-ip") ??
      "",
  );
  if (!candidate) return null;

  return createHash("sha256")
    .update(`antemano-login-client:${candidate}`)
    .digest("hex");
}

function firstValidIp(value: string): string | undefined {
  for (const part of value.split(",")) {
    const candidate = normalizeIp(part);
    if (candidate && isIP(candidate)) return candidate;
  }
  return undefined;
}

function normalizeIp(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)](?::\d+)?$/.exec(trimmed);
  if (bracketed?.[1]) return bracketed[1];
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(trimmed);
  return ipv4WithPort?.[1] ?? trimmed;
}
