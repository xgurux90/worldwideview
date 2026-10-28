import { NextResponse } from "next/server";
import { getCachedAviationData, getLatestFromSupabase } from "../../../lib/aviation-polling";

// Cache older than this means background polling has stopped (or the file cache is from an old run)
const STALE_MS = 10 * 60 * 1000;
// Don't hit Supabase on every request while the cache is stale
const FALLBACK_RETRY_MS = 60 * 1000;

let lastFallbackAttempt = 0;
let lastFallbackData: Awaited<ReturnType<typeof getLatestFromSupabase>> = null;

async function getFallback() {
    if (Date.now() - lastFallbackAttempt < FALLBACK_RETRY_MS) return lastFallbackData;
    lastFallbackAttempt = Date.now();
    lastFallbackData = await getLatestFromSupabase();
    return lastFallbackData;
}

export async function GET() {
    // 1. Try to get fresh cached data from our background polling service
    const cache = getCachedAviationData();
    const isStale = Date.now() - cache.timestamp > STALE_MS;

    if (cache.data && !isStale) {
        return NextResponse.json(cache.data);
    }

    const cacheReason = cache.data ? "Cache is stale" : "Memory & Disk cache empty";
    console.log(`[API/aviation] ${cacheReason}. Attempting fallback to Supabase history...`);

    // 2. Supabase history, if it is newer than whatever we have cached
    const fallbackData = await getFallback();
    if (fallbackData && (!cache.data || fallbackData.time > (cache.data.time ?? 0))) {
        console.log(`[API/aviation] Fallback successful: Returning ${fallbackData.states?.length || 0} historical states.`);
        return NextResponse.json(fallbackData);
    }

    // 3. Stale cache beats nothing
    if (cache.data) {
        return NextResponse.json({ ...cache.data, _isStale: true });
    }

    // 4. Complete fallback empty state
    console.warn("[API/aviation] All caches were empty and Supabase fallback failed (likely timeout). Returning empty state.");
    return NextResponse.json(
        { states: [], time: Math.floor(Date.now() / 1000) },
        { status: 200 }
    );
}
