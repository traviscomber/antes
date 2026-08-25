import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({ query: queryMock }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import {
  activateInvite,
  isLoginThrottled,
  recordFailedLogin,
} from "./session";

describe("login throttling persistence", () => {
  beforeEach(() => {
    queryMock.mockReset();
    process.env.DATABASE_URL = "postgres://test.invalid/antemano";
  });

  it("blocks a client that rotates email addresses", async () => {
    queryMock.mockResolvedValueOnce([{
      email_attempts: 1,
      client_attempts: 40,
      global_attempts: 40,
    }]);

    await expect(isLoginThrottled("new-address@example.com", "opaque-client"))
      .resolves.toBe(true);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("email_key = $2"),
      ["new-address@example.com", "client-key:opaque-client", 15],
    );
  });

  it("blocks excessive attempts against a single email", async () => {
    queryMock.mockResolvedValueOnce([{
      email_attempts: 8,
      client_attempts: 1,
      global_attempts: 8,
    }]);

    await expect(isLoginThrottled("victim@example.com", "opaque-client"))
      .resolves.toBe(true);
  });

  it("cleans expired rows and conditionally records bounded failures", async () => {
    queryMock.mockResolvedValueOnce([]);

    await recordFailedLogin(" Attempt@Example.com ", "opaque-client");

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/delete from auth_login_attempts[\s\S]*insert into auth_login_attempts/),
      ["attempt@example.com", "client-key:opaque-client", 15, 5_000, 40, 8],
    );
  });

  it("never overwrites credentials when an invite targets an existing email", async () => {
    queryMock.mockResolvedValueOnce([]);

    await expect(activateInvite("one-time-token", "safe-password"))
      .resolves.toBeNull();

    const [statement] = queryMock.mock.calls[0] ?? [];
    expect(statement).toEqual(expect.any(String));
    expect(statement).toMatch(/on conflict \(email\) do nothing/i);
    expect(statement).not.toMatch(/on conflict \(email\) do update/i);
    expect(statement).not.toMatch(/password_hash\s*=\s*excluded\.password_hash/i);
  });
});
