import { NextRequest, NextResponse } from "next/server";

// Backs the manual-add autocomplete (Epic/STOVE games etc.) - Steam's public search doesn't need
// a key or ownership, so it works as a general "does this game exist on Steam" name lookup even
// for games the user owns elsewhere. Proxied server-side to avoid CORS and keep this consistent
// with every other Steam call in the app going through our own API routes.
export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("term")?.trim();
  if (!term || term.length < 2) return NextResponse.json({ items: [] });

  // Steam's storesearch treats a literal "-" as an exclusion operator (searching the exact,
  // dash-including title of a DLC/expansion - e.g. "Songs of Conquest - Yulan" - returns zero
  // results, since it reads as "exclude Yulan"), so a naive search for a game's real display
  // name can silently come back empty. Swapping it for a space keeps the surrounding words intact
  // for fuzzy matching without triggering the operator.
  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", term.replace(/-/g, " "));
  url.searchParams.set("cc", "kr");
  url.searchParams.set("l", "koreana");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return NextResponse.json({ items: [] });
  const data = await response.json();

  const items = (data.items ?? [])
    .filter((it: { type: string }) => it.type === "app" || it.type === "dlc")
    .slice(0, 8)
    .map((it: { id: number; name: string; tiny_image?: string; type: string }) => ({
      appid: it.id,
      name: it.name,
      image: it.tiny_image ?? null,
      isDlc: it.type === "dlc",
    }));
  return NextResponse.json({ items });
}
