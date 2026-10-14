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
    <button type="button" className={styles.shareBtn} onClick={share}>
      {copied ? copiedLabel : label}
    </button>
  );
}
