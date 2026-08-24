import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getPersonalFuelMarket } from "@/lib/profile/fuel-market";
import { getUserProfile } from "@/lib/profile/user-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });

  const sql = neon(databaseUrl);
  const users = await sql.query(
    `select u.id::text as user_id
       from app_users u
       join organization_memberships m on m.user_id = u.id and m.status = 'active'
      where u.email = 'juan@n3uralia.com'
      order by case m.role when 'admin' then 0 else 1 end, m.updated_at desc
      limit 1`,
  ) as { user_id: string }[];
  const user = users[0];
  if (!user) return NextResponse.json({ ok: false, error: "validation user missing" }, { status: 404 });

  const profile = await getUserProfile(user.user_id);
  if (!profile) return NextResponse.json({ ok: false, error: "profile missing" }, { status: 404 });

  const insights = await getPersonalFuelMarket(databaseUrl, profile);
  return NextResponse.json({ ok: true, profile, insights });
}
