import { NextRequest, NextResponse } from "next/server";
import {
  activateInvite,
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (
    !token ||
    token.length > 512 ||
    password.length < 8 ||
    password.length > 512 ||
    password !== confirm
  ) {
    return redirectToActivation(request, "invalid");
  }

  try {
    const identity = await activateInvite(token, password);
    if (!identity) {
      return redirectToActivation(request, "expired");
    }

    const sessionToken = await createSession(identity);
    await setSessionCookie(sessionToken);
    return NextResponse.redirect(new URL("/app/now", request.url), 303);
  } catch {
    return redirectToActivation(request, "unavailable");
  }
}

function redirectToActivation(request: NextRequest, error: string) {
  const url = new URL("/activate", request.url);
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
