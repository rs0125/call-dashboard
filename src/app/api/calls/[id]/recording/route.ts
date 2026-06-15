import { NextResponse } from "next/server";
import { getRecordingKey } from "@/lib/queries";
import { getRecordingUrl } from "@/lib/r2";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/calls/:id/recording — streams the call's archived recording from R2.
// We don't expose R2 directly: this looks up the call's recording_r2_key, mints
// a short-lived presigned GET URL, and 302-redirects to it. The <audio> element
// follows the redirect and streams (incl. range requests for seeking) straight
// from R2. Recordings stay private behind the dashboard login; no Exotel auth,
// no R2 credentials in the browser.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const callId = Number(id);
  if (!Number.isFinite(callId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const key = await getRecordingKey(callId);
  if (!key) {
    return NextResponse.json({ error: "not archived" }, { status: 404 });
  }

  const url = await getRecordingUrl(key);
  return NextResponse.redirect(url, 302);
}
