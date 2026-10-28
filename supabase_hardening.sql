-- Safe to run on an existing aviation_history table (non-destructive, idempotent).
-- Run in the Supabase SQL editor.

-- 1. Enable Row Level Security with no policies. The app only uses the service-role key
--    (which bypasses RLS), so this blocks anon/public reads and writes through the REST API.
ALTER TABLE public.aviation_history ENABLE ROW LEVEL SECURITY;

-- 2. Retention: delete history older than 7 days, every hour.
--    Requires the pg_cron extension (Database > Extensions in the dashboard, or the line below).
--    ~10k rows are recorded every 5 minutes, so without this the table grows ~3M rows/day.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'aviation-history-retention',
    '17 * * * *',
    $$DELETE FROM public.aviation_history WHERE timestamp < now() - interval '7 days'$$
);
