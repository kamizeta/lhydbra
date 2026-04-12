CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Morning briefing at 5:30 AM COT = 10:30 UTC
SELECT cron.schedule(
  'telegram-morning-summary',
  '30 10 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/telegram-daily-summary',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvY2NnZm9sZnhoa2N4ZmxrcnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzIzNDMsImV4cCI6MjA4ODk0ODM0M30.1Lx87iNeUPzyR0gEdkVAxeGbfdizlsG9WpiLhLrJQxM"}'::jsonb,
    body := '{"type": "morning"}'::jsonb
  ) AS request_id;
  $$
);

-- Afternoon summary at 2:00 PM COT = 19:00 UTC
SELECT cron.schedule(
  'telegram-afternoon-summary',
  '0 19 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/telegram-daily-summary',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvY2NnZm9sZnhoa2N4ZmxrcnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzIzNDMsImV4cCI6MjA4ODk0ODM0M30.1Lx87iNeUPzyR0gEdkVAxeGbfdizlsG9WpiLhLrJQxM"}'::jsonb,
    body := '{"type": "afternoon"}'::jsonb
  ) AS request_id;
  $$
);