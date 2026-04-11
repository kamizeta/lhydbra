import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { message, action } = body as { message?: string; action?: string };

    // Purge action
    if (action === "purge") {
      const admin = createClient(supabaseUrl, serviceKey);
      await admin.from("alpha_notes").delete().eq("user_id", user.id);
      return new Response(JSON.stringify({ success: true, message: "Memory purged" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Save user message
    await admin.from("alpha_notes").insert({
      user_id: user.id,
      message: message.trim(),
      role: "user",
    });

    // Fetch conversation history (last 20 messages for context)
    const { data: history } = await admin
      .from("alpha_notes")
      .select("message, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const conversationMessages = (history ?? []).map((m: { role: string; message: string }) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.message,
    }));

    // Call Anthropic
    let assistantReply = "Contexto recibido y registrado. Se aplicará en las próximas evaluaciones de señales.";

    if (anthropicKey) {
      try {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 500,
            system: "Eres el Asistente Alpha de Lhydbra. El Director del fondo acaba de darte nuevo contexto macroeconómico para sesgar tus futuras operaciones. Responde breve y profesionalmente acusando recibo afirmativo. Responde siempre en español.",
            messages: conversationMessages,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (resp.ok) {
          const result = await resp.json();
          assistantReply = result?.content?.[0]?.text || assistantReply;
        }
      } catch (err) {
        console.warn("[alpha-ingestor] Anthropic call failed:", err instanceof Error ? err.message : "unknown");
      }
    }

    // Save assistant reply
    await admin.from("alpha_notes").insert({
      user_id: user.id,
      message: assistantReply,
      role: "assistant",
    });

    return new Response(JSON.stringify({ reply: assistantReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[alpha-ingestor] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
