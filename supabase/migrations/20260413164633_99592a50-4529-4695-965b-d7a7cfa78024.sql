CREATE OR REPLACE FUNCTION public.notify_position_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  payload jsonb;
  event_type text;
  v_service_key text;
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

  -- Get service role key from vault
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  -- Fire-and-forget HTTP call to edge function
  PERFORM net.http_post(
    url := 'https://boccgfolfxhkcxflkrqz.supabase.co/functions/v1/notify-position-change',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    ),
    body := payload
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Recreate the trigger (drop first to ensure it exists)
DROP TRIGGER IF EXISTS on_position_change ON public.positions;
CREATE TRIGGER on_position_change
  AFTER INSERT OR UPDATE OR DELETE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_position_change();