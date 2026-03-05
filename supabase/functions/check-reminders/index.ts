// supabase/functions/check-reminders/index.ts
// ═══════════════════════════════════════════════════════
// 🔔 Check Reminders — серверна перевірка нагадувань (fallback)
// Викликається pg_cron кожну хвилину.
// Якщо клієнт (сайт) активний — пропускає (клієнт обробляє сам).
// Якщо сайт закритий — знаходить due нагадування → відправляє Telegram.
// ═══════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
} as const;

// ── Типи ──

interface DueReminder {
  reminder_id: number;
  title: string;
  description: string | null;
  reminder_type: string;
  recipients: unknown;
  channel: string;
  priority: string;
  condition_query: string | null;
  schedule: unknown;
  trigger_count: number;
  created_by: number | null;
  creator_name: string;
  meta: unknown;
}

interface TelegramUser {
  slyusar_id: number;
  telegram_chat_id: number;
}

// ── Головний обробник ──

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE) {
    console.error("Missing env vars");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 0. Перевірити чи клієнт (сайт) активний
    const { data: clientAlive } = await supabase.rpc("is_client_alive", {
      threshold_seconds: 75,
    });

    if (clientAlive) {
      return jsonResp({ skipped: true, reason: "client_active" });
    }

    console.log("🖥️ Клієнт неактивний — серверна обробка");

    // 1. Отримати нагадування які мають спрацювати
    const { data: dueReminders, error: rpcErr } =
      await supabase.rpc("get_due_reminders");

    if (rpcErr) {
      console.error("get_due_reminders error:", rpcErr);
      return jsonResp({ error: rpcErr.message, sent: 0 });
    }

    if (!dueReminders || dueReminders.length === 0) {
      return jsonResp({ message: "Немає нагадувань", sent: 0 });
    }

    console.log(`🔔 Знайдено ${dueReminders.length} нагадувань`);

    let totalSent = 0;

    for (const reminder of dueReminders as DueReminder[]) {
      // Пропустити нагадування тільки для app-каналу
      if (reminder.channel === "app") {
        // Тільки оновити trigger (для app — клієнт покаже toast)
        await supabase.rpc("trigger_reminder", {
          p_reminder_id: reminder.reminder_id,
        });
        continue;
      }

      // Telegram або both — відправити в Telegram
      if (reminder.channel === "telegram" || reminder.channel === "both") {
        const sent = await sendTelegramReminder(supabase, BOT_TOKEN, reminder);
        totalSent += sent;
      }

      // Оновити trigger (next_trigger_at, count, status)
      await supabase.rpc("trigger_reminder", {
        p_reminder_id: reminder.reminder_id,
      });

      // Записати лог
      await supabase.from("atlas_reminder_logs").insert({
        reminder_id: reminder.reminder_id,
        recipient_id: reminder.created_by,
        channel: reminder.channel === "both" ? "telegram" : reminder.channel,
        message_text: `Серверна доставка: ${reminder.title}`,
        delivery_status: "sent",
      });
    }

    console.log(
      `✅ Оброблено: ${dueReminders.length}, відправлено Telegram: ${totalSent}`,
    );
    return jsonResp({
      message: "OK",
      processed: dueReminders.length,
      sent: totalSent,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("check-reminders error:", msg);
    return jsonResp({ error: msg, sent: 0 }, 500);
  }
});

// ── Відправка в Telegram ──

async function sendTelegramReminder(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  reminder: DueReminder,
): Promise<number> {
  // Визначити адресатів
  const recipientIds = await resolveRecipientIds(supabase, reminder);
  if (recipientIds.length === 0) return 0;

  // Отримати telegram_chat_id для кожного
  const { data: tgUsers, error } = await supabase
    .from("atlas_telegram_users")
    .select("slyusar_id, telegram_chat_id")
    .in("slyusar_id", recipientIds)
    .eq("is_active", true);

  if (error || !tgUsers?.length) return 0;

  // Сформувати повідомлення
  const icon = getPriorityIcon(reminder.priority);
  const typeLabel = getTypeLabel(reminder.reminder_type);
  const priorityLabel = getPriorityLabel(reminder.priority);

  const messageText = [
    `${icon} <b>${escHtml(reminder.title)}</b>`,
    reminder.description ? `\n${escHtml(reminder.description)}` : "",
    `\n${typeLabel} | Пріоритет: ${priorityLabel}`,
    `👤 Створив: ${escHtml(reminder.creator_name)}`,
  ]
    .filter(Boolean)
    .join("\n");

  let sentCount = 0;

  for (const tgUser of tgUsers as TelegramUser[]) {
    try {
      const tgResp = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgUser.telegram_chat_id,
            text: messageText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Виконано",
                    callback_data: `rem_done_${reminder.reminder_id}`,
                  },
                  {
                    text: "📅 Заплановано",
                    callback_data: `rem_snooze_${reminder.reminder_id}`,
                  },
                  {
                    text: "❌ Не планую",
                    callback_data: `rem_skip_${reminder.reminder_id}`,
                  },
                ],
              ],
            },
          }),
        },
      );

      const ok = tgResp.ok;

      // Записати лог для кожного одержувача
      await supabase.from("atlas_reminder_logs").insert({
        reminder_id: reminder.reminder_id,
        recipient_id: tgUser.slyusar_id,
        channel: "telegram",
        message_text: messageText,
        delivery_status: ok ? "delivered" : "failed",
        error_message: ok ? null : `HTTP ${tgResp.status}`,
      });

      if (ok) sentCount++;
    } catch (err) {
      console.error(
        `Telegram send error (chat_id=${tgUser.telegram_chat_id}):`,
        err,
      );
    }
  }

  return sentCount;
}

// ── Визначити адресатів ──

async function resolveRecipientIds(
  supabase: ReturnType<typeof createClient>,
  reminder: DueReminder,
): Promise<number[]> {
  const recipients = reminder.recipients;

  // "self" → автор
  if (recipients === "self" || recipients === '"self"') {
    return reminder.created_by ? [reminder.created_by] : [];
  }

  // "all" → всі
  if (recipients === "all" || recipients === '"all"') {
    const { data } = await supabase.from("slyusars").select("slyusar_id");
    return data?.map((s: { slyusar_id: number }) => s.slyusar_id) || [];
  }

  // "mechanics" → слюсарі
  if (recipients === "mechanics" || recipients === '"mechanics"') {
    const { data } = await supabase
      .from("slyusars")
      .select("slyusar_id, data")
      .filter("data->>Посада", "eq", "Слюсар");
    return data?.map((s: { slyusar_id: number }) => s.slyusar_id) || [];
  }

  // Масив ID
  if (Array.isArray(recipients)) {
    return recipients;
  }

  // JSON-рядок масиву
  if (typeof recipients === "string") {
    try {
      const parsed = JSON.parse(recipients);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* */
    }
  }

  return reminder.created_by ? [reminder.created_by] : [];
}

// ── Утиліти ──

function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getPriorityIcon(priority: string): string {
  switch (priority) {
    case "urgent":
      return "🚨";
    case "high":
      return "🔴";
    case "normal":
      return "🔔";
    case "low":
      return "💤";
    default:
      return "🔔";
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case "urgent":
      return "Терміновий";
    case "high":
      return "Високий";
    case "normal":
      return "Звичайний";
    case "low":
      return "Низький";
    default:
      return priority;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "once":
      return "⏰ Одноразове";
    case "recurring":
      return "🔄 Повторюване";
    case "conditional":
      return "📊 За умовою";
    default:
      return type;
  }
}

function jsonResp(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
