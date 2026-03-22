-- Schedule compute-indicators refresh at 9:00 AM ET (14:00 UTC) Mon-Fri
SELECT cron.schedule(
  'daily-indicators-refresh',
  '0 14 * * 1-5',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/compute-indicators',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object('scheduled', true)
    )
  $$
);

-- Schedule the operator to run at 9:35 AM ET (14:35 UTC) Mon-Fri
SELECT cron.schedule(
  'daily-operator-run',
  '35 14 * * 1-5',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/operator-mode',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'action', 'run',
        'paper', true,
        'scheduled', true
      )
    )
  $$
);