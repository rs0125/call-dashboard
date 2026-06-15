import { NextResponse } from "next/server";
import { getCallTranscript } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/calls/:id/transcript — the stored conversation transcript for one
// call. Fetched lazily by the conversation modal so the calls table query
// doesn't have to carry every transcript's JSON.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Layouts don't guard route handlers — enforce the session here too.
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const callId = Number(id);
  if (!Number.isFinite(callId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const transcript = await getCallTranscript(callId);
  if (!transcript) {
    return NextResponse.json({ error: "no transcript" }, { status: 404 });
  }
  return NextResponse.json(transcript);
}
