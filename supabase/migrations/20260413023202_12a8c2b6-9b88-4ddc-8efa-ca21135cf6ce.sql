
-- Fix all cron jobs: replace current_setting('app.supabase_url') with direct URL
-- and use read_secret for service_role_key

SELECT cron.unschedule('alpaca-sync-cron');
SELECT cron.unschedule('compute-indicators-cron');
SELECT cron.unschedule('sync-positions-market-hours');
SELECT cron.unschedule('daily-indicators-refresh');
SELECT cron.unschedule('daily-operator-run');
SELECT cron.unschedule('telegram-morning-summary');
SELECT cron.unschedule('telegram-afternoon-summary');
SELECT cron.unschedule('weekly-adaptive-scoring');

-- Alpaca Sync (every 5 min, all days for testing)
SELECT cron.schedule(
  'alpaca-sync-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "alpaca-sync", "payload": {"scheduled": true, "paper": true}}'::jsonb
  ) AS request_id;
  $$
);

-- Compute Indicators (every 15 min, all days for testing)
SELECT cron.schedule(
  'compute-indicators-cron',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "compute-indicators"}'::jsonb
  ) AS request_id;
  $$
);

-- Sync Positions (every 15 min during market hours, all days for testing)
SELECT cron.schedule(
  'sync-positions-market-hours',
  '*/15 13-20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "alpaca-sync", "payload": {"scheduled": true, "paper": true}}'::jsonb
  ) AS request_id;
  $$
);

-- Daily Indicators Refresh (8:00 AM COT = 13:00 UTC)
SELECT cron.schedule(
  'daily-indicators-refresh',
  '0 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "compute-indicators"}'::jsonb
  ) AS request_id;
  $$
);

-- Daily Operator Run (8:35 AM COT = 13:35 UTC)
SELECT cron.schedule(
  'daily-operator-run',
  '35 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "operator-mode"}'::jsonb
  ) AS request_id;
  $$
);

-- Telegram Morning Summary (5:30 AM COT = 10:30 UTC)
SELECT cron.schedule(
  'telegram-morning-summary',
  '30 10 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "telegram-daily-summary", "payload": {"type": "morning"}}'::jsonb
  ) AS request_id;
  $$
);

-- Telegram Afternoon Summary (2:00 PM COT = 19:00 UTC)
SELECT cron.schedule(
  'telegram-afternoon-summary',
  '0 19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "telegram-daily-summary", "payload": {"type": "afternoon"}}'::jsonb
  ) AS request_id;
  $$
);

-- Weekly Adaptive Scoring (Sunday 3:00 AM COT = 08:00 UTC)
SELECT cron.schedule(
  'weekly-adaptive-scoring',
  '0 8 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"target_function": "adaptive-scoring", "payload": {"window_days": 30}}'::jsonb
  ) AS request_id;
  $$
);
