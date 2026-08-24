import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth/session";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const sourceId = await readSourceId(request);
  if (!sourceId) {
    return NextResponse.json({ error: "source_id_required" }, { status: 400 });
  }

  const connector = createCountrySignalConnector(sourceId);
  if (!connector) {
    return NextResponse.json({ error: "source_not_ingestible" }, { status: 400 });
  }

  try {
    const result = await runCountrySignalIngestion(
      connector,
      createNeonCountrySignalStore(),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = sanitizePublicError(error);
    const status = /not configured|required/i.test(message) ? 409 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

async function readSourceId(request: NextRequest): Promise<string | undefined> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { sourceId?: unknown }
      | null;
    return typeof body?.sourceId === "string" ? body.sourceId.trim() : undefined;
  }

  const form = await request.formData().catch(() => null);
  const value = form?.get("sourceId");
  return typeof value === "string" ? value.trim() : undefined;
}

function sanitizePublicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Signal ingestion failed.";
  return message
    .replace(/([?&](?:token|secret|auth_key|usuario)=)[^&\s]+/gi, "$1REDACTED")
    .slice(0, 400);
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
