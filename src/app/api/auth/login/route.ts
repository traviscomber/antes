import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  clearLoginFailures,
  createSession,
  isLoginThrottled,
  recordFailedLogin,
  setSessionCookie,
} from "@/lib/auth/session";
import { loginClientKey } from "@/lib/auth/login-throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const clientKey = loginClientKey(request.headers);

  if (!email || !password || email.length > 320 || password.length > 512) {
    return redirectToLogin(request, "invalid");
  }

  try {
    if (await isLoginThrottled(email, clientKey)) {
      return redirectToLogin(request, "locked");
    }

    const identity = await authenticateUser(email, password);
    if (!identity) {
      await recordFailedLogin(email, clientKey);
      return redirectToLogin(request, "invalid");
    }

    await clearLoginFailures(email);
    const token = await createSession(identity);
    await setSessionCookie(token);

    return NextResponse.redirect(new URL("/app/now", request.url), 303);
  } catch (error) {
    console.error("[auth] login unavailable", {
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      postgresUrlConfigured: Boolean(process.env.POSTGRES_URL),
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return redirectToLogin(request, "unavailable");
  }
}

function redirectToLogin(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}
