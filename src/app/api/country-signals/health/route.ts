import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth/session";
import { getChileSignalHealth } from "@/lib/country-signals/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const sources = await getChileSignalHealth();

  return NextResponse.json({
    country: "CL",
    generatedAt: new Date().toISOString(),
    sources,
  });
}
