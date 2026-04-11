import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://lhydbra.lovable.app",
  "https://id-preview--cfc6c4be-124b-47d1-b6e8-26dbf563d3b8.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user with anon key
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Not authenticated");

    // Service role client for vault operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { binance_api_key, binance_api_secret } = await req.json();

    if (!binance_api_key || !binance_api_secret) {
      return new Response(JSON.stringify({ error: "Both API key and secret are required" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get current vault references to delete old secrets
    const { data: currentSettings } = await adminClient
      .from("user_settings")
      .select("binance_key_id, binance_secret_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Delete old vault secrets if they exist
    if (currentSettings?.binance_key_id) {
      await adminClient.rpc("delete_secret", { secret_id: currentSettings.binance_key_id }).catch(() => {});
    }
    if (currentSettings?.binance_secret_id) {
      await adminClient.rpc("delete_secret", { secret_id: currentSettings.binance_secret_id }).catch(() => {});
    }

    // Store new secrets in vault
    const secretNameKey = `binance_key_${user.id}`;
    const secretNameSecret = `binance_secret_${user.id}`;

    const { data: keyResult, error: keyError } = await adminClient.rpc("create_secret", {
      new_secret: binance_api_key,
      new_name: secretNameKey,
    });
    if (keyError) throw new Error(`Failed to store API key in vault: ${keyError.message}`);

    const { data: secretResult, error: secretError } = await adminClient.rpc("create_secret", {
      new_secret: binance_api_secret,
      new_name: secretNameSecret,
    });
    if (secretError) throw new Error(`Failed to store API secret in vault: ${secretError.message}`);

    // Save vault references in user_settings
    const { error: updateError } = await adminClient
      .from("user_settings")
      .upsert({
        user_id: user.id,
        binance_key_id: keyResult,
        binance_secret_id: secretResult,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (updateError) throw new Error(`Failed to update settings: ${updateError.message}`);

    // Return masked keys for display
    const maskedKey = "••••••••" + binance_api_key.slice(-4);
    const maskedSecret = "••••••••" + binance_api_secret.slice(-4);

    return new Response(JSON.stringify({
      success: true,
      masked_key: maskedKey,
      masked_secret: maskedSecret,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("save-api-keys error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
