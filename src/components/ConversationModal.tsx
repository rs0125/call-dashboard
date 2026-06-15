"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CallRow, CallTranscript } from "@/lib/queries";
import { RecordingPlayer } from "./RecordingPlayer";
import { fmtDateTime, fmtDuration, directionLabel } from "@/lib/format";

// Eye-icon button that opens a modal with the call's conversation rendered as a
// WhatsApp-like chat. The transcript is fetched lazily (on first open) from
// /api/calls/:id/transcript so the calls table doesn't carry every transcript.
export function ConversationButton({ call }: { call: CallRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-icon"
        onClick={() => setOpen(true)}
        aria-label="View conversation"
        title="View conversation"
      >
        <EyeIcon /> view
      </button>
      {open ? <ConversationModal call={call} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ConversationModal({ call, onClose }: { call: CallRow; onClose: () => void }) {
  const [transcript, setTranscript] = useState<CallTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch on mount.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/calls/${call.id}/transcript`)
      .then((r) => {
        if (r.status === 404) throw new Error("No transcript for this call yet.");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => !cancelled && setTranscript(d as CallTranscript))
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [call.id]);

  // Close on Escape; lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Assign each distinct speaker a side (first seen → left, next → right).
  const speakers = transcript
    ? Array.from(new Set(transcript.segments.map((s) => s.speaker)))
    : [];
  const sideFor = (speaker: string): "left" | "right" =>
    speakers.indexOf(speaker) % 2 === 0 ? "left" : "right";

  return createPortal(
    <div
      className="conv-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Conversation"
    >
      <div className="conv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="conv-head">
          <div>
            <h3>Conversation</h3>
            <div className="meta">
              <span>{directionLabel(call.direction)}</span>
              <span>·</span>
              <span style={{ fontFamily: "ui-monospace, monospace" }}>
                {call.from ?? "—"} → {call.to ?? "—"}
              </span>
              <span>·</span>
              <span>{fmtDateTime(call.startTime)}</span>
              <span>·</span>
              <span>{fmtDuration(call.conversationDuration)} talk</span>
              {transcript?.languageCode ? (
                <>
                  <span>·</span>
                  <span style={{ textTransform: "uppercase" }}>
                    {transcript.languageCode}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="conv-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {call.recordingUrl ? (
          <div
            style={{
              padding: "0.75rem 1.2rem",
              borderBottom: "var(--stroke) solid var(--blue)",
            }}
          >
            <RecordingPlayer url={call.recordingUrl} wide />
          </div>
        ) : null}

        <div className="conv-body">
          {loading ? <div className="conv-loading">Loading transcript…</div> : null}
          {error ? <div className="conv-empty">{error}</div> : null}
          {transcript && !error ? (
            transcript.segments.length === 0 ? (
              <div className="conv-empty">Transcript is empty (no speech detected).</div>
            ) : (
              transcript.segments.map((s, i) => {
                const side = sideFor(s.speaker);
                return (
                  <div key={i} className={`conv-row ${side}`}>
                    <div className="conv-bubble">
                      <div className="conv-speaker">{s.speaker}</div>
                      <div>{s.text}</div>
                      <div className="conv-time">{fmtClock(s.start)}</div>
                    </div>
                  </div>
                );
              })
            )
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Seconds → m:ss for the small per-bubble timestamp.
function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function EyeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
