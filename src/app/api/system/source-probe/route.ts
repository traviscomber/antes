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

  const targets = [
    "https://www.bcn.cl/leychile/leychile-api-doc/assets/leychile-api-doc-v1.yaml",
    "https://www.bcn.cl/leychile/leychile-api-doc/leychile-api-doc",
  ];

  const results = await Promise.all(
    targets.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "text/yaml,text/plain,text/html;q=0.8,*/*;q=0.5",
            "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        const body = await response.text();
        return {
          url,
          status: response.status,
          contentType: response.headers.get("content-type"),
          sample: body.slice(0, 12000),
        };
      } catch (error) {
        return {
          url,
          status: null,
          contentType: null,
          error: error instanceof Error ? error.name : "unknown",
        };
      }
    }),
  );

  return NextResponse.json({ results });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(PROBE_TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
