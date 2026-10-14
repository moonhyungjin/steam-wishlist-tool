"use client";
import { useState } from "react";
import { type PlayStatus, type StarRating } from "../types";
export function StatusGlyph({ status }: { status: PlayStatus }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={status === "playing" || status === "incomplete" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {status === "playing" && <polygon points="6,4 20,12 6,20" />}
      {status === "completed" && <path d="M20 6L9 17l-5-5" />}
      {status === "incomplete" && (
        <>
          <rect x="6" y="4" width="4" height="16" stroke="none" />
          <rect x="14" y="4" width="4" height="16" stroke="none" />
        </>
      )}
      {status === "dropped" && (
        <>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </>
      )}
      {status === "excluded" && (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
}
export function NoImageGlyph() {
  return (
    <svg
      className="noImageIcon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15l-5-5-9 9" />
      <line x1="3" y1="21" x2="21" y2="3" />
    </svg>
  );
}
// Distinguishes "g hasn't loaded yet" (still fetching store data) from "g loaded, but this game
// genuinely has no header image" - both used to render the same "LOADING" text forever once g
// was undefined vs. g.headerImage being null looked identical from the outside.
export function CoverPlaceholder({ loaded }: { loaded: boolean }) {
  return loaded ? (
    <div className="loadingCover noImage">
      <NoImageGlyph />
      이미지 없음
    </div>
  ) : (
    <div className="loadingCover">LOADING</div>
  );
}
// A plumper star polygon (inner/outer radius ratio ~0.5, vs. the classic ~0.38) traced with a
// round-joined stroke in the same color as the fill - that combination is what rounds off both the
// outer points and the inner notches, instead of the sharp glyph a plain "★" character gives.
export function StarGlyph() {
  return (
    <svg
      className="starGlyph"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <polygon points="12,2 14.94,7.96 21.51,8.91 16.76,13.55 17.88,20.09 12,17 6.12,20.09 7.25,13.55 2.49,8.91 9.06,7.96" />
    </svg>
  );
}
// Read-only 5-star row (same bg/fg overlay trick as StarPicker, minus the click handling) - used
// wherever a half-star value needs to read as an actual star rating instead of a bare number.
export function StarRow({ value }: { value: number }) {
  return (
    <span className="starRowDisplay">
      {[1, 2, 3, 4, 5].map((i) => {
        const fillPct = value >= i ? 100 : value >= i - 0.5 ? 50 : 0;
        return (
          <span key={i} className="starRowIcon">
            <span className="starBg">
              <StarGlyph />
            </span>
            <span className="starFg" style={{ width: `${fillPct}%` }}>
              <StarGlyph />
            </span>
          </span>
        );
      })}
    </span>
  );
}
// Half-star picker: each of the 5 positions is a button with two overlaid glyphs (a dim background
// star, and a gold foreground star clipped to 0/50/100% width) - clicking the left vs right half of
// a button picks the half-star vs full-star value for that position. Hover previews the pick before
// committing, same as any star-rating widget.
export function StarPicker({
  value,
  onChange,
}: {
  value: StarRating | undefined;
  onChange: (v: StarRating | null) => void;
}) {
  const [hover, setHover] = useState<StarRating | null>(null);
  const display = hover ?? value ?? 0;
  function pickFromEvent(e: { currentTarget: HTMLButtonElement; clientX: number }, i: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    return (leftHalf ? i - 0.5 : i) as StarRating;
  }
  return (
    <span className="starPicker" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fillPct = display >= i ? 100 : display >= i - 0.5 ? 50 : 0;
        return (
          <button
            key={i}
            type="button"
            className="starBtn"
            onMouseMove={(e) => setHover(pickFromEvent(e, i))}
            onClick={(e) => {
              const picked = pickFromEvent(e, i);
              onChange(value === picked ? null : picked);
            }}
          >
            <span className="starBg">
              <StarGlyph />
            </span>
            <span className="starFg" style={{ width: `${fillPct}%` }}>
              <StarGlyph />
            </span>
          </button>
        );
      })}
    </span>
  );
}
