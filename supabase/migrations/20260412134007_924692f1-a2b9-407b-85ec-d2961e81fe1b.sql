SELECT cron.unschedule('telegram-morning-summary');
SELECT cron.unschedule('telegram-afternoon-summary');

SELECT cron.schedule(
  'telegram-morning-summary',
  '30 10 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/telegram-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"type": "morning"}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'telegram-afternoon-summary',
  '0 19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/telegram-daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"type": "afternoon"}'::jsonb
  ) AS request_id;
  $$
);