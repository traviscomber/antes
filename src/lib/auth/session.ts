import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "antemano_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 8;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export type AppRole = "viewer" | "operator" | "decision_maker" | "admin";

export interface AuthIdentity {
  userId: string;
  email: string;
  displayName: string | null;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: AppRole;
}

export interface AuthSession extends AuthIdentity {
  sessionId: string;
  expiresAt: string;
}

type DbRow = Record<string, unknown>;

function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for authentication.");
  }

  const sql = neon(databaseUrl);
  return {
    query: async <T extends DbRow>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function encodePassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

function verifyPassword(password: string, encodedHash: string): boolean {
  const [scheme, nText, rText, pText, saltText, expectedText] =
    encodedHash.split("$");

  if (
    scheme !== "scrypt" ||
    !nText ||
    !rText ||
    !pText ||
    !saltText ||
    !expectedText
  ) {
    return false;
  }

  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(expectedText, "base64url");
  if (salt.length < 16 || expected.length < 32) return false;

  const actual = scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function isLoginThrottled(email: string): Promise<boolean> {
  const emailKey = normalizeEmail(email);
  if (!emailKey) return false;

  const rows = await db().query<{ attempts: number }>(
    `select count(*)::int as attempts
       from auth_login_attempts
      where email_key = $1
        and attempted_at > now() - make_interval(mins => $2)`,
    [emailKey, LOGIN_WINDOW_MINUTES],
  );

  return (rows[0]?.attempts ?? 0) >= MAX_FAILED_ATTEMPTS;
}

export async function recordFailedLogin(email: string): Promise<void> {
  const emailKey = normalizeEmail(email);
  if (!emailKey) return;

  await db().query(
    `insert into auth_login_attempts (email_key) values ($1)`,
    [emailKey],
  );
}

export async function clearLoginFailures(email: string): Promise<void> {
  const emailKey = normalizeEmail(email);
  if (!emailKey) return;

  await db().query(
    `delete from auth_login_attempts
      where email_key = $1
         or attempted_at < now() - interval '1 day'`,
    [emailKey],
  );
}

export async function activateInvite(
  token: string,
  password: string,
): Promise<AuthIdentity | null> {
  if (!token || password.length < 8 || password.length > 512) return null;

  const passwordHash = encodePassword(password);
  const rows = await db().query<{
    user_id: string;
    email: string;
    display_name: string | null;
    membership_id: string;
    organization_id: string;
    organization_name: string;
    role: AppRole;
  }>(
    `with invite as (
       select id, email, organization_id, role
         from admin_invites
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        for update
     ), user_row as (
       insert into app_users (email, password_hash, status)
       select email, $2, 'active' from invite
       on conflict (email) do update set
         password_hash = excluded.password_hash,
         status = 'active',
         updated_at = now()
       returning id, email, display_name
     ), membership_row as (
       insert into organization_memberships (organization_id, user_id, role, status)
       select i.organization_id, u.id, i.role, 'active'
         from invite i
         cross join user_row u
       on conflict (organization_id, user_id) do update set
         role = excluded.role,
         status = 'active',
         updated_at = now()
       returning id, user_id, organization_id, role
     ), consumed as (
       update admin_invites ai
          set used_at = now()
         from invite i
        where ai.id = i.id
       returning ai.id
     )
     select
       u.id::text as user_id,
       u.email,
       u.display_name,
       m.id::text as membership_id,
       m.organization_id,
       o.name as organization_name,
       m.role
     from user_row u
     join membership_row m on m.user_id = u.id
     join organizations o on o.id = m.organization_id
     where exists (select 1 from consumed)
     limit 1`,
    [tokenHash(token), passwordHash],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
  };
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthIdentity | null> {
  const emailKey = normalizeEmail(email);
  if (!emailKey || !password) return null;

  const rows = await db().query<{
    user_id: string;
    email: string;
    password_hash: string;
    display_name: string | null;
    membership_id: string;
    organization_id: string;
    organization_name: string;
    role: AppRole;
  }>(
    `select
       u.id::text as user_id,
       u.email,
       u.password_hash,
       u.display_name,
       m.id::text as membership_id,
       m.organization_id,
       o.name as organization_name,
       m.role
     from app_users u
     join organization_memberships m on m.user_id = u.id
     join organizations o on o.id = m.organization_id
     where u.email = $1
       and u.status = 'active'
       and m.status = 'active'
     order by case m.role when 'admin' then 0 else 1 end, m.created_at
     limit 1`,
    [emailKey],
  );

  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;

  await db().query(
    `update app_users set last_login_at = now(), updated_at = now() where id = $1`,
    [row.user_id],
  );

  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
  };
}

export async function createSession(identity: AuthIdentity): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db().query(
    `insert into auth_sessions (
       token_hash, membership_id, user_id, organization_id, expires_at
     ) values ($1,$2,$3,$4,$5)`,
    [
      hash,
      identity.membershipId,
      identity.userId,
      identity.organizationId,
      expiresAt.toISOString(),
    ],
  );

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db().query<{
    session_id: string;
    expires_at: string | Date;
    user_id: string;
    email: string;
    display_name: string | null;
    membership_id: string;
    organization_id: string;
    organization_name: string;
    role: AppRole;
  }>(
    `select
       s.id::text as session_id,
       s.expires_at,
       u.id::text as user_id,
       u.email,
       u.display_name,
       m.id::text as membership_id,
       m.organization_id,
       o.name as organization_name,
       m.role
     from auth_sessions s
     join app_users u on u.id = s.user_id
     join organization_memberships m
       on m.id = s.membership_id
      and m.user_id = s.user_id
      and m.organization_id = s.organization_id
     join organizations o on o.id = s.organization_id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > now()
       and u.status = 'active'
       and m.status = 'active'
     limit 1`,
    [tokenHash(token)],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    expiresAt: new Date(row.expires_at).toISOString(),
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
  };
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return;

  await db().query(
    `update auth_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`,
    [tokenHash(token)],
  );
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function isAdmin(session: AuthSession | null): boolean {
  return session?.role === "admin";
}
