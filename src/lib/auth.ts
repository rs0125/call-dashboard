import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Mirrors the Employee Reimbursement Portal's auth: a plaintext-email httpOnly
// cookie as the session, re-validated against the whitelist on every request.
// The cookie value is just the email — authority lives entirely in
// call_dashboard_whitelist, so toggling is_active off revokes access instantly.
const COOKIE_NAME = "cd_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type CurrentUser = {
  email: string;
  name: string;
};

export async function setSessionEmail(email: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE_NAME, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

export async function getSessionEmail(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_NAME)?.value ?? null;
}

// Resolve the signed-in user from the session cookie, re-checking the whitelist
// every time. cache() dedupes it to one DB hit per request. Returns null if the
// cookie is absent or the email is no longer whitelisted/active.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const email = await getSessionEmail();
  if (!email) return null;

  const row = await prisma.call_dashboard_whitelist.findUnique({
    where: { email: email.toLowerCase() },
    select: { email: true, name: true, is_active: true },
  });
  if (!row || row.is_active === false) return null;

  return { email: row.email, name: row.name ?? row.email };
});

// Returns true when `email` is present and active in the whitelist. Used by the
// OAuth callback to authorize a freshly-verified Google identity.
export async function isWhitelisted(email: string): Promise<boolean> {
  const row = await prisma.call_dashboard_whitelist.findUnique({
    where: { email: email.toLowerCase() },
    select: { is_active: true },
  });
  return !!row && row.is_active !== false;
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}
