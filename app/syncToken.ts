// The per-account secret that proves a browser is the one that owns a synced record (see
// app/api/sync/route.ts). Kept per Steam ID so linking one account to another device doesn't touch
// the others. Entirely local: no sign-up, nothing to remember - unless you want a second device.
const key = (steamId: string) => `syncToken:${steamId}`;
export const isValidSyncToken = (t: string | null | undefined): t is string =>
  !!t && /^[0-9a-f]{64}$/.test(t);

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns the stored token, minting one on first use. null only when storage is unavailable.
export function getSyncToken(steamId: string): string | null {
  try {
    const existing = localStorage.getItem(key(steamId));
    if (isValidSyncToken(existing)) return existing;
    const fresh = randomToken();
    localStorage.setItem(key(steamId), fresh);
    return fresh;
  } catch {
    return null;
  }
}

// Adopts another device's code for this account. Returns false if it isn't a valid code.
export function setSyncToken(steamId: string, code: string): boolean {
  const trimmed = code.trim().toLowerCase();
  if (!isValidSyncToken(trimmed)) return false;
  try {
    localStorage.setItem(key(steamId), trimmed);
    return true;
  } catch {
    return false;
  }
}
