import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  revokeCurrentSession,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  try {
    await revokeCurrentSession();
  } finally {
    await clearSessionCookie();
  }

  return NextResponse.redirect(new URL("/login", request.url), 303);
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
