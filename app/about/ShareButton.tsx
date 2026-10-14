"use client";

import { useState } from "react";
import styles from "./about.module.css";

// The only client component on the About page - everything else stays server-rendered. Shares the
// current URL, so /about and /about/ko each hand out their own language.
export function ShareButton({ label, copiedLabel }: { label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    // Native share sheet where available (mobile); falls back to copying the link when it isn't
    // supported or the user dismisses the sheet.
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch {
        // AbortError or any other failure - fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <button
      type="button"
      className={styles.shareBtn}
      onClick={share}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </>
        )}
      </svg>
    </button>
  );
}
