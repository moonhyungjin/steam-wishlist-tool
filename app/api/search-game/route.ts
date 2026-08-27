import { NextRequest, NextResponse } from "next/server";

// Backs the manual-add autocomplete (Epic/STOVE games etc.) - Steam's public search doesn't need
// a key or ownership, so it works as a general "does this game exist on Steam" name lookup even
// for games the user owns elsewhere. Proxied server-side to avoid CORS and keep this consistent
// with every other Steam call in the app going through our own API routes.
export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("term")?.trim();
  if (!term || term.length < 2) return NextResponse.json({ items: [] });

  const url = new URL("https://store.steampowered.com/api/storesearch/");
  url.searchParams.set("term", term);
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
