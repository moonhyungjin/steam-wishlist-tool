import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// All-time-low price via IsThereAnyDeal (https://isthereanydeal.com) - Steam's own store API has
// no price-history endpoint, so this is the only source for "is this actually a good deal"
// (SteamDB shows the same kind of data via web scraping, which ITAD's API does for us legitimately).
//
// Unlike a plain live-fetch, this is a shared read-through cache in the same Redis instance
// /api/sync already uses: ITAD's rate limit is per API key, not per visitor, so with multiple
// people using this deployment, calling ITAD fresh on every wishlist load would multiply with the
// user count. Caching per-appid (not per-steamId - the price is the same for everyone) means one
// visitor's request warms the cache for every other visitor asking about the same game.
const ITAD_BASE = "https://api.isthereanydeal.com";
const STEAM_SHOP_ID = 61;
const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Caps how many stale/missing appids get refreshed from ITAD in a single request, so one big
// wishlist doesn't turn into a slow multi-second response - the rest just get picked up on a
// later request (this one's or another visitor's), same "gap-fill over time" philosophy as
// enrichMetacritic/enrichAchievements on the client.
const REFRESH_BATCH_CAP = 40;

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

type LowestPrice = {
  amount: number;
  currency: string;
  cut: number;
  shop: string;
  timestamp: string | null;
};
type PriceCacheEntry = {
  appid: number;
  // null = looked up, ITAD has no matching game for this appid - cached too, so a delisted/
  // obscure title doesn't get re-looked-up on every single request forever.
  itadId: string | null;
  // null = has an itadId but ITAD has no recorded price history for it.
  low: LowestPrice | null;
  updatedAt: number;
};

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("appids");
  if (!raw) return NextResponse.json({ error: "appids가 필요합니다." }, { status: 400 });
  const appids = [
    ...new Set(
      raw
        .split(",")
        .map(Number)
        .filter((x) => Number.isInteger(x) && x > 0),
    ),
  ];
  if (!appids.length || appids.length > 200)
    return NextResponse.json({ error: "appids는 1~200개까지입니다." }, { status: 400 });

  const client = getRedis();
  if (!client) return NextResponse.json({ prices: {}, configured: false });

  const cacheKeys = appids.map((id) => `price:${id}`);
  const cached = await client.mget<(PriceCacheEntry | null)[]>(...cacheKeys);

  const now = Date.now();
  const prices: Record<number, LowestPrice | null> = {};
  const staleAppids: number[] = [];
  appids.forEach((appid, i) => {
    const entry = cached[i];
    if (entry && now - entry.updatedAt < PRICE_CACHE_TTL_MS) {
      prices[appid] = entry.low;
    } else {
      staleAppids.push(appid);
    }
  });

  const apiKey = process.env.ITAD_API_KEY;
  const toRefresh = apiKey ? staleAppids.slice(0, REFRESH_BATCH_CAP) : [];

  if (toRefresh.length && apiKey) {
    try {
      const shopIds = toRefresh.map((id) => `app/${id}`);
      const lookupRes = await fetch(`${ITAD_BASE}/lookup/id/shop/${STEAM_SHOP_ID}/v1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shopIds),
        cache: "no-store",
      });
      const lookup: Record<string, string | null> = lookupRes.ok ? await lookupRes.json() : {};

      const itadIdToAppid = new Map<string, number>();
      // Only appids that resolved to null (confirmed "not on ITAD") start here - ones with a real
      // itadId are added below, but ONLY if the historylow call actually succeeds. A failed call
      // (bad key, ITAD downtime, network error) must NOT produce a cached entry for those - that
      // would falsely lock in "no price data" for a full TTL even after the real problem is fixed
      // (this is exactly what happened testing with an invalid key: the failure got cached as a
      // negative result, so replacing the key alone didn't surface real data until the bad cache
      // entries were cleared).
      const freshEntries: Record<number, PriceCacheEntry> = {};
      for (const appid of toRefresh) {
        const itadId = lookup[`app/${appid}`] ?? null;
        if (!itadId) {
          freshEntries[appid] = { appid, itadId: null, low: null, updatedAt: now };
        } else {
          itadIdToAppid.set(itadId, appid);
        }
      }

      if (itadIdToAppid.size) {
        const historyRes = await fetch(`${ITAD_BASE}/games/historylow/v1?country=KR`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "ITAD-API-Key": apiKey },
          body: JSON.stringify([...itadIdToAppid.keys()]),
          cache: "no-store",
        });
        if (historyRes.ok) {
          const history: Array<{
            id: string;
            low?: {
              shop: { id: number; name: string };
              price: { amount: number; currency: string };
              cut: number;
              timestamp: string;
            };
          }> = await historyRes.json();
          const lowById = new Map(history.map((entry) => [entry.id, entry.low]));
          for (const [itadId, appid] of itadIdToAppid) {
            const low = lowById.get(itadId);
            freshEntries[appid] = {
              appid,
              itadId,
              low: low
                ? {
                    amount: low.price.amount,
                    currency: low.price.currency,
                    cut: low.cut,
                    shop: low.shop.name,
                    timestamp: low.timestamp ?? null,
                  }
                : null,
              updatedAt: now,
            };
          }
        }
        // historyRes not ok: those appids simply get no freshEntries entry, so they're neither
        // cached nor returned this request - they stay "stale" and get retried next time.
      }

      // set() per key (not mset) since each needs its own TTL-bearing JSON value - Upstash's
      // pipeline batches these into one round trip anyway when called concurrently.
      await Promise.all(
        Object.values(freshEntries).map((entry) => client.set(`price:${entry.appid}`, entry)),
      );
      for (const entry of Object.values(freshEntries)) prices[entry.appid] = entry.low;
    } catch {
      // Best-effort refresh - appids that failed just stay "missing" this request and get
      // retried next time (this visitor's or another's), same as everywhere else in this route.
    }
  }

  return NextResponse.json({ prices, configured: true });
}
