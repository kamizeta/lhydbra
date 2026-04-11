
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to notify on position changes via edge function
CREATE OR REPLACE FUNCTION public.notify_position_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  payload jsonb;
  event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_type := 'INSERT';
    payload := jsonb_build_object(
      'type', event_type,
      'record', row_to_json(NEW)::jsonb,
      'old_record', null
    );
  ELSIF TG_OP = 'UPDATE' THEN
    event_type := 'UPDATE';
    payload := jsonb_build_object(
      'type', event_type,
      'record', row_to_json(NEW)::jsonb,
      'old_record', row_to_json(OLD)::jsonb
    );
  ELSIF TG_OP = 'DELETE' THEN
    event_type := 'DELETE';
    payload := jsonb_build_object(
      'type', event_type,
      'record', row_to_json(OLD)::jsonb,
      'old_record', null
    );
  END IF;

  -- Fire-and-forget HTTP call to edge function
  PERFORM net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/notify-position-change',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key', true),
      'apikey', current_setting('app.supabase_anon_key', true)
    ),
    body := payload
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on positions table
CREATE TRIGGER on_position_change
AFTER INSERT OR UPDATE OR DELETE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.notify_position_change();
