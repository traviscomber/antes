import { describe, expect, it } from "vitest";
import {
  isPlausibleLoginEmail,
  loginClientKey,
  normalizeLoginEmail,
} from "./login-throttle";

describe("login throttle identity", () => {
  it("normalizes login emails consistently", () => {
    expect(normalizeLoginEmail("  Juan@Example.COM ")).toBe("juan@example.com");
    expect(isPlausibleLoginEmail("juan@example.com")).toBe(true);
    expect(isPlausibleLoginEmail("client-key-without-domain")).toBe(false);
    expect(isPlausibleLoginEmail("two@@example.com")).toBe(false);
  });

  it("creates a stable opaque key from the Vercel client address", () => {
    const first = loginClientKey(new Headers({ "x-vercel-forwarded-for": "203.0.113.24" }));
    const second = loginClientKey(new Headers({ "x-vercel-forwarded-for": "203.0.113.24" }));

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(first).not.toContain("203.0.113.24");
  });

  it("uses the first valid forwarded address and separates clients", () => {
    const first = loginClientKey(new Headers({ "x-forwarded-for": "invalid, 203.0.113.10, 10.0.0.1" }));
    const second = loginClientKey(new Headers({ "x-forwarded-for": "203.0.113.11" }));

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  it("supports bracketed IPv6 and rejects unusable headers", () => {
    expect(loginClientKey(new Headers({ "x-real-ip": "[2001:db8::1]:443" }))).toMatch(/^[a-f0-9]{64}$/);
    expect(loginClientKey(new Headers({ "x-forwarded-for": "unknown" }))).toBeNull();
    expect(loginClientKey(new Headers())).toBeNull();
  });
});
