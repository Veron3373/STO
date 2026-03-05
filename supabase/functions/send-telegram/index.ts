// supabase/functions/send-telegram/index.ts
// ═══════════════════════════════════════════════════════
// 📤 Send Telegram Message — допоміжна Edge Function
// Викликається для відправки нагадувань у Telegram
// ═══════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
} as const;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    if (!BOT_TOKEN) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "TELEGRAM_BOT_TOKEN not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const {
      chat_id,
      text,
      parse_mode = "Markdown",
      reply_markup,
    }: {
      chat_id?: number;
      text?: string;
      parse_mode?: string;
      reply_markup?: Record<string, unknown>;
    } = await req.json();

    if (!chat_id || !text) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "chat_id and text are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Відправити через Telegram Bot API
    const tgResp = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
          parse_mode,
          disable_web_page_preview: true,
          ...(reply_markup ? { reply_markup } : {}),
        }),
      },
    );

    const tgText = await tgResp.text();
    console.log("Telegram API:", tgResp.status, tgText.slice(0, 300));

    if (!tgResp.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Telegram API ${tgResp.status}`,
          body: tgText.slice(0, 300),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let result: unknown;
    try {
      result = JSON.parse(tgText);
    } catch {
      result = tgText;
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("send-telegram error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
