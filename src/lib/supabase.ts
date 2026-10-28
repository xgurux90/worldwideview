import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

/**
 * Returns a singleton Supabase client for server-side use.
 * Returns null if environment variables are not configured.
 */
export function getSupabaseClient() {
    if (client) return client;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) return null;

    client = createClient(url, key, {
        auth: { persistSession: false },
    });
    return client;
}

const PAGE_SIZE = 1000; // Supabase's default max rows per request

/**
 * Fetches every row of a query by paging with .range(), since a single
 * request is capped at the project's max-rows setting.
 * `buildQuery` must return a fresh, stably ordered query on each call.
 */
export async function fetchAllRows<T>(
    buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<{ data: T[] | null; error: any }> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
        if (error) return { data: null, error };
        if (!data) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
    }
    return { data: rows, error: null };
}
