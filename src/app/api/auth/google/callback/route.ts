import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isWhitelisted, setSessionEmail } from "@/lib/auth";

export const runtime = "nodejs";

const STATE_COOKIE = "cd_oauth_state";

type TokenResponse = { access_token?: string; id_token?: string; error?: string };
type UserInfo = { email?: string; email_verified?: boolean; name?: string };

// OAuth callback: verify the CSRF state, exchange the code for an access token,
// read the Google profile, then authorize against the whitelist before issuing
// a session. Every failure redirects back to /login?error=… (no detail leaks).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const c = await cookies();
  const expectedState = c.get(STATE_COOKIE)?.value;
  c.delete(STATE_COOKIE);
  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(`${origin}/login?error=invalid_state`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(`${origin}/login?error=oauth_not_configured`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=token_exchange_failed`);
  }
  const tokenJson = (await tokenRes.json()) as TokenResponse;
  if (!tokenJson.access_token) {
    return NextResponse.redirect(`${origin}/login?error=no_access_token`);
  }

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=userinfo_failed`);
  }
  const userInfo = (await userRes.json()) as UserInfo;

  if (!userInfo.email || !userInfo.email_verified) {
    return NextResponse.redirect(`${origin}/login?error=email_not_verified`);
  }

  const email = userInfo.email.toLowerCase();
  if (!(await isWhitelisted(email))) {
    return NextResponse.redirect(
      `${origin}/login?error=not_whitelisted&email=${encodeURIComponent(email)}`,
    );
  }

  await setSessionEmail(email);
  return NextResponse.redirect(`${origin}/`);
}
