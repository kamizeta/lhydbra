
-- Add missing columns to audit_log (the table already has entity/entity_id as TEXT, plus old_values/new_values as JSONB)
-- We'll use the existing columns: entity (for table name), entity_id (text), old_values, new_values

-- Create the audit trigger function
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (
    user_id, action, entity, entity_id, old_values, new_values, created_at
  ) VALUES (
    COALESCE(
      CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END,
      auth.uid()
    ),
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to financial tables
CREATE TRIGGER audit_positions
  AFTER INSERT OR UPDATE OR DELETE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_signals
  AFTER INSERT ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_user_settings
  AFTER UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_trade_journal
  AFTER INSERT OR UPDATE ON public.trade_journal
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
