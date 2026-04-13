
-- Remove old jobs that will be wrapped with job-monitor
SELECT cron.unschedule('weekly-adaptive-scoring');
SELECT cron.unschedule('daily-indicators-refresh');
SELECT cron.unschedule('daily-operator-run');
SELECT cron.unschedule('telegram-morning-summary');
SELECT cron.unschedule('telegram-afternoon-summary');

-- Re-create them pointing to job-monitor wrapper
SELECT cron.schedule(
  'weekly-adaptive-scoring',
  '0 8 * * 0',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"target_function": "adaptive-scoring", "payload": {"window_days": 30}}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'daily-indicators-refresh',
  '0 13 * * 1-5',
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
  'daily-operator-run',
  '35 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"target_function": "operator-mode"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'telegram-morning-summary',
  '30 10 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"target_function": "telegram-daily-summary", "payload": {"type": "morning"}}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'telegram-afternoon-summary',
  '0 19 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/job-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"target_function": "telegram-daily-summary", "payload": {"type": "afternoon"}}'::jsonb
  ) AS request_id;
  $$
);
