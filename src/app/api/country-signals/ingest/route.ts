import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth/session";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";
import { refreshPersonalAlertsForAllUsers } from "@/lib/profile/personal-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const browserForm = isBrowserForm(request);

  if (!sameOrigin(request)) {
    return respondError(request, browserForm, "invalid_origin", 403);
  }

  const session = await getSession();
  if (!session) {
    return respondError(request, browserForm, "authentication_required", 401);
  }
  if (!isAdmin(session)) {
    return respondError(request, browserForm, "admin_required", 403);
  }

  const sourceId = await readSourceId(request);
  if (!sourceId) {
    return respondError(request, browserForm, "source_id_required", 400);
  }

  const connector = createCountrySignalConnector(sourceId);
  if (!connector) {
    return respondError(request, browserForm, "source_not_ingestible", 400);
  }

  try {
    const result = await runCountrySignalIngestion(
      connector,
      createNeonCountrySignalStore(),
    );

    let personalAlerts: Awaited<ReturnType<typeof refreshPersonalAlertsForAllUsers>> | undefined;
    try {
      personalAlerts = await refreshPersonalAlertsForAllUsers({ sourceId: result.sourceId });
    } catch (error) {
      // Canonical ingestion must remain successful even if a derived user alert
      // projection fails. A later ingestion/profile save retries the projection.
      console.error(`Personal alert refresh failed after ${result.sourceId} ingestion`, error);
    }

    if (browserForm) {
      const url = new URL("/app/sources", request.url);
      url.searchParams.set("source", result.sourceId);
      url.searchParams.set("accepted", String(result.accepted));
      url.searchParams.set("duplicates", String(result.duplicates));
      url.searchParams.set("state", result.state);
      return NextResponse.redirect(url, 303);
    }

    return NextResponse.json({ ok: true, ...result, personalAlerts });
  } catch (error) {
    const message = sanitizePublicError(error);
    const status = /not configured|required/i.test(message) ? 409 : 502;
    return respondError(request, browserForm, message, status);
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

function respondError(
  request: NextRequest,
  browserForm: boolean,
  error: string,
  status: number,
): NextResponse {
  if (browserForm) {
    const url = new URL("/app/sources", request.url);
    url.searchParams.set("ingestError", error.slice(0, 180));
    return NextResponse.redirect(url, 303);
  }
  return NextResponse.json({ ok: false, error }, { status });
}

function isBrowserForm(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
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
