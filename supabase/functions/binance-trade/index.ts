import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BINANCE_API_URL = "https://api.binance.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Not authenticated");

    const { action, symbol, side, quantity, type = "MARKET", price, timeInForce } = await req.json();

    // Get user's Binance API keys
    const { data: settings } = await supabase
      .from("user_settings")
      .select("binance_api_key, binance_api_secret")
      .eq("user_id", user.id)
      .maybeSingle();

    const apiKey = (settings as any)?.binance_api_key;
    const apiSecret = (settings as any)?.binance_api_secret;

    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: "Binance API keys not configured. Go to Settings → Binance API." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test_connection") {
      const timestamp = Date.now();
      const signature = await hmacSha256(apiSecret, queryString);

      const response = await fetch(`${BINANCE_API_URL}/api/v3/account?${queryString}&signature=${signature}`, {
        headers: { "X-MBX-APIKEY": apiKey },
      });
      const data = await response.json();

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Binance error: ${data.msg || JSON.stringify(data)}` }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        balances: data.balances?.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "place_order") {
      if (!symbol || !side || !quantity) {
        return new Response(JSON.stringify({ error: "Missing required fields: symbol, side, quantity" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const timestamp = Date.now();
      let params = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;

      if (type === "LIMIT" && price) {
        params += `&price=${price}&timeInForce=${timeInForce || "GTC"}`;
      }

      const signature = await hmacSha256(apiSecret, params);

      const response = await fetch(`${BINANCE_API_URL}/api/v3/order?${params}&signature=${signature}`, {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      });
      const data = await response.json();

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Binance order error: ${data.msg || JSON.stringify(data)}` }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, order: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: test_connection, place_order" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Binance function error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
