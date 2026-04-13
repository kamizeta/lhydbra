
SELECT cron.unschedule('alpaca-sync-cron');
SELECT cron.unschedule('compute-indicators-cron');
SELECT cron.unschedule('sync-positions-market-hours');

SELECT cron.schedule(
  'alpaca-sync-cron',
  '*/5 * * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"target_function": "alpaca-sync", "payload": {"scheduled": true, "paper": true}}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'compute-indicators-cron',
  '*/15 * * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"target_function": "compute-indicators"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'sync-positions-market-hours',
  '*/15 13-20 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"target_function": "alpaca-sync", "payload": {"scheduled": true, "paper": true}}'::jsonb
  ) AS request_id;
  $$
);
