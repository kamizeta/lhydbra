SELECT cron.unschedule('sync-positions-market-hours');

SELECT cron.schedule(
  'sync-positions-market-hours',
  '*/15 13-20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/alpaca-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body := '{"scheduled": true, "paper": true}'::jsonb
  ) AS request_id;
  $$
);