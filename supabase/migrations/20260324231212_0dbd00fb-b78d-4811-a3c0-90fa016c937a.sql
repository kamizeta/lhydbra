
-- Create vault helper functions for edge functions to use
CREATE OR REPLACE FUNCTION public.create_secret(new_secret text, new_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  secret_id uuid;
BEGIN
  -- Delete existing secret with same name if exists
  DELETE FROM vault.secrets WHERE name = new_name;
  
  INSERT INTO vault.secrets (secret, name)
  VALUES (new_secret, new_name)
  RETURNING id INTO secret_id;
  
  RETURN secret_id;
END;
$$;

-- Function to read a decrypted secret by name
CREATE OR REPLACE FUNCTION public.read_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  
  RETURN secret_value;
END;
$$;

-- Function to delete a secret by id
CREATE OR REPLACE FUNCTION public.delete_secret(secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = secret_id;
END;
$$;
