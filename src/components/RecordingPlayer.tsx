"use client";

import { useRef, useState } from "react";

// Custom inline recording player: a play/pause button plus a slim seek bar and
// time readout, backed by a hidden <audio> element. preload="none" means the
// recording (a presigned R2 URL behind /api/calls/:id/recording) isn't fetched
// until the user actually hits play, so a 200-row table costs no audio up front.
// `wide` fills the container (used in the conversation modal); default is the
// compact table variant. Falls back to an open-in-new-tab link on error.
export function RecordingPlayer({
  url,
  wide = false,
}: {
  url: string;
  wide?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      setStarted(true);
      void a.play().catch(() => {
        setFailed(true);
        setLoading(false);
      });
    } else {
      a.pause();
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  }

  if (failed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-icon">
        open ↗
      </a>
    );
  }

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className={`rec-player${wide ? " rec-player-wide" : ""}`}>
      <button
        type="button"
        className="rec-btn"
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
        title={playing ? "Pause" : "Play recording"}
      >
        {loading && !playing ? (
          <span className="rec-spin" aria-hidden="true" />
        ) : playing ? (
          <PauseIcon />
        ) : (
          <PlayIcon />
        )}
      </button>

      {started ? (
        <>
          <div
            className="rec-bar"
            onClick={seek}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(dur)}
            aria-valuenow={Math.round(cur)}
            tabIndex={0}
          >
            <div className="rec-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="rec-time">
            {fmtClock(cur)}
            {dur ? ` / ${fmtClock(dur)}` : ""}
          </span>
        </>
      ) : null}

      <audio
        ref={audioRef}
        src={url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => {
          setPlaying(true);
          setLoading(false);
        }}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
        style={{ display: "none" }}
      />
    </div>
  );
}

// Seconds → m:ss.
function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
