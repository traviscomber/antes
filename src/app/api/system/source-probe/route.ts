import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TOKEN_HASH =
  "cf7ebe01db1909827d01cb86aef4d819e1a70678dbbd4aa07bce8182063c5190";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const packageUrl =
    "https://datos.gob.cl/api/3/action/package_show?id=generacion-bruta";

  const response = await fetch(packageUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  const result = payload.result as Record<string, unknown> | undefined;
  const resources = Array.isArray(result?.resources)
    ? (result?.resources as Array<Record<string, unknown>>)
    : [];

  const resourceSummaries = resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    format: resource.format,
    datastore_active: resource.datastore_active,
    url: resource.url,
    last_modified: resource.last_modified,
  }));

  const datastoreResource = resources.find(
    (resource) => resource.datastore_active === true && typeof resource.id === "string",
  );

  let dataSample: unknown = null;
  if (datastoreResource?.id) {
    const dataUrl = new URL("https://datos.gob.cl/api/3/action/datastore_search");
    dataUrl.searchParams.set("resource_id", String(datastoreResource.id));
    dataUrl.searchParams.set("limit", "5");
    const dataResponse = await fetch(dataUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    dataSample = await dataResponse.json();
  }

  return NextResponse.json({
    packageStatus: response.status,
    dataset: {
      id: result?.id,
      name: result?.name,
      title: result?.title,
      metadata_modified: result?.metadata_modified,
      license_title: result?.license_title,
      organization: result?.organization,
    },
    resources: resourceSummaries,
    dataSample,
  });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(PROBE_TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
