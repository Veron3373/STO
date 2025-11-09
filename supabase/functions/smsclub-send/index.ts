// supabase/functions/smsclub-send/index.ts

import { createClient } from "@supabase/supabase-js"; // див. deno.json

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
} as const;

type SMSConfig = {
  token: string;
  alphaName?: string;
};

function normalizePhone(raw: string): string {
  let p = String(raw || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "380" + p.slice(1);
  if (!p.startsWith("380")) p = "380" + p;
  return p;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, message }: { phone?: string; message?: string } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Phone and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing SUPABASE env vars" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: smsConfig, error: cfgErr } = await supabaseAdmin
      .from("sms")
      .select("data")
      .eq("sms_id", 6)
      .single();

    if (cfgErr) {
      console.error("CFG:", cfgErr);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load SMS configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cfg: SMSConfig =
      typeof smsConfig?.data === "string" ? JSON.parse(smsConfig.data) : smsConfig?.data;

    const token = String(cfg?.token ?? "").trim();
    const alpha = String(cfg?.alphaName ?? "REMONT").trim();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "SMS token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const to = normalizePhone(phone);
    if (!/^380\d{9}$/.test(to)) {
      return new Response(
        JSON.stringify({ success: false, error: `Bad phone format: ${phone}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // УВАГА: правильний API-хост для SMS Club — im.smsclub.mobi
    const smsResp = await fetch("https://im.smsclub.mobi/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone: [to],
        message,
        src_addr: alpha,
      }),
    });

    const text = await smsResp.text();
    console.log("SMS HTTP:", smsResp.status, text.slice(0, 200));

    if (!smsResp.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `SMS API ${smsResp.status}`,
          body: text.slice(0, 200),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON from SMS API", body: text.slice(0, 200) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, result: json }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Edge crash:", e);
    return new Response(
      JSON.stringify({ success: false, error: msg || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
