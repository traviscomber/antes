import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth/session";
import { processPersistedSignalExposures } from "@/lib/events/process-exposures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ ok: false, error: "admin_required" }, { status: 403 });
  }

  try {
    const result = await processPersistedSignalExposures(session.organizationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Exposure processing failed.";
    return NextResponse.json({ ok: false, error: message.slice(0, 400) }, { status: 502 });
  }
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
