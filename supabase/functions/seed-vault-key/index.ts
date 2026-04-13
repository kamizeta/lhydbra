import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: "No service key in env" }), { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey
  );

  const { data, error } = await supabase.rpc("create_secret", {
    new_secret: serviceKey,
    new_name: "SUPABASE_SERVICE_ROLE_KEY",
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, secret_id: data }), {
    headers: { "Content-Type": "application/json" },
  });
});
