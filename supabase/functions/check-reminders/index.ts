// supabase/functions/check-reminders/index.ts
// ═══════════════════════════════════════════════════════
// 🔔 Check Reminders — серверна відправка Telegram-нагадувань
// Викликається pg_cron кожну хвилину.
// ЗАВЖДИ обробляє due нагадування → відправляє Telegram.
// Дедуплікація: перевіряє лог щоб не відправляти повторно.
// ═══════════════════════════════════════════════════════

// @ts-ignore: Deno module
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
  meta: any;
}

interface TelegramUser {
  slyusar_id: number;
  telegram_chat_id: number;
}

// ── Головний обробник ──

// @ts-ignore: Deno глобальний у середовищі Edge Functions
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // @ts-ignore
  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  // @ts-ignore
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  // @ts-ignore
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
    // 1. Отримати нагадування які мають спрацювати
    const { data: dueReminders, error: rpcErr } =
      await supabase.rpc("get_due_reminders");

    if (rpcErr) {
      console.error("get_due_reminders error:", rpcErr);
      return jsonResp({ error: rpcErr.message, sent: 0 });
    }

    let allReminders: DueReminder[] = (dueReminders as DueReminder[]) || [];

    // Отримати всі Контрольні нагадування (realtime), оскільки у них next_trigger_at = null
    const { data: realtimeReminders } = await supabase
      .from("atlas_reminders")
      .select("*")
      .eq("status", "active")
      .eq("reminder_type", "conditional")
      .not("condition_query", "is", null);

    if (realtimeReminders && realtimeReminders.length > 0) {
      const activeRtReminders = realtimeReminders.filter((r: any) => {
        try {
          const sched =
            typeof r.schedule === "string" ? JSON.parse(r.schedule) : r.schedule;
          return sched?.type === "realtime";
        } catch {
          return false;
        }
      });
      // Додаємо їх до загального списку
      allReminders = [...allReminders, ...(activeRtReminders as DueReminder[])];
    }

    if (!allReminders || allReminders.length === 0) {
      return jsonResp({ message: "Немає нагадувань", sent: 0 });
    }

    console.log(`🔔 Знайдено ${allReminders.length} нагадувань`);

    let totalSent = 0;

    for (const reminder of allReminders) {
      // Пропустити нагадування тільки для app-каналу
      if (reminder.channel === "app") {
        await supabase.rpc("trigger_reminder", {
          p_reminder_id: reminder.reminder_id,
        });
        continue;
      }

      // Для умовних — виконати condition_query і перевірити результат
      let conditionResultText: string | null = null;
      let conditionResultHash: string | null = null;
      if (
        reminder.reminder_type === "conditional" &&
        reminder.condition_query
      ) {
        const condOk = await executeConditionQuery(
          supabase,
          reminder.condition_query,
        );

        if (condOk === null) {
          // Умова не виконана (0 рядків) → пропустити, але оновити trigger
          console.log(
            `📊 Умова не виконана для reminder_id=${reminder.reminder_id}`,
          );
          await supabase.rpc("trigger_reminder", {
            p_reminder_id: reminder.reminder_id,
          });
          await supabase.from("atlas_reminder_logs").insert({
            reminder_id: reminder.reminder_id,
            recipient_id: reminder.created_by,
            channel: "app",
            message_text: "Умова не виконана — дані не знайдено",
            delivery_status: "sent",
          });
          continue;
        }

        // Перевіряємо хеш, якщо це Контроль (реалтайм)
        try {
          const schedule = typeof reminder.schedule === "string" ? JSON.parse(reminder.schedule) : reminder.schedule;
          if (schedule?.type === "realtime" && reminder.meta?.last_result_hash === condOk.hash) {
            console.log(
              `⏭️ Результат SQL не змінився (spam protection) reminder_id=${reminder.reminder_id}`,
            );
            continue;
          }
        } catch { /* */ }

        conditionResultText = condOk.text;
        conditionResultHash = condOk.hash;
      }

      // Telegram або both — перевірити дедуплікацію
      if (reminder.channel === "telegram" || reminder.channel === "both") {
        // Перевірити чи вже відправлялось за останні 90 секунд
        const { data: recentLogs } = await supabase
          .from("atlas_reminder_logs")
          .select("id")
          .eq("reminder_id", reminder.reminder_id)
          .eq("channel", "telegram")
          .eq("delivery_status", "delivered")
          .gte("created_at", new Date(Date.now() - 90_000).toISOString())
          .limit(1);

        if (recentLogs && recentLogs.length > 0) {
          console.log(
            `⏭️ Дедуплікація: reminder_id=${reminder.reminder_id} вже відправлено`,
          );
          await supabase.rpc("trigger_reminder", {
            p_reminder_id: reminder.reminder_id,
          });
          continue;
        }

        const sent = await sendTelegramReminder(
          supabase,
          BOT_TOKEN,
          reminder,
          conditionResultText,
        );
        totalSent += sent;
      }

      // Оновити trigger (next_trigger_at, count, status)
      await supabase.rpc("trigger_reminder", {
        p_reminder_id: reminder.reminder_id,
      });

      // Зберегти хеш результату для realtime-нагадувань
      if (conditionResultHash) {
        reminder.meta = reminder.meta || {};
        reminder.meta.last_result_hash = conditionResultHash;
        await supabase
          .from("atlas_reminders")
          .update({ meta: reminder.meta })
          .eq("reminder_id", reminder.reminder_id);
      }

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

// ── Виконання condition_query та форматування результату ──

async function executeConditionQuery(
  supabase: ReturnType<typeof createClient>,
  conditionQuery: string,
): Promise<{ text: string; hash: string } | null> {
  try {
    const { data, error } = await supabase.rpc("execute_condition_query", {
      query_text: conditionQuery,
    });

    if (error) {
      console.error("execute_condition_query error:", error.message);
      return null;
    }

    // Перевіряємо чи є результати
    const isEmpty =
      data === null ||
      data === undefined ||
      (Array.isArray(data) && data.length === 0) ||
      (typeof data === "number" && data === 0);

    if (isEmpty) return null;

    // Форматуємо текст для Telegram
    const fieldLabels: Record<string, string> = {
      act_id: "Акт №",
      date_on: "Відкритий",
      date_off: "Закритий",
      total_amount: "Сума",
      status: "Статус",
      client_name: "Клієнт",
      client_phone: "Телефон",
      slusar: "Слюсар",
      car: "Авто",
      vin: "VIN",
      description: "Опис",
      count: "Кількість",
    };
    const formatFieldName = (key: string): string => fieldLabels[key] || key;
    const formatValue = (v: any): string => {
      if (v === null || v === undefined) return "—";
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        return new Date(v).toLocaleString("uk-UA", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return String(v);
    };

    let resultText = "";

    if (Array.isArray(data)) {
      resultText = data
        .map((row: any, i: number) => {
          if (typeof row === "object" && row !== null) {
            return `${i + 1}. ` + Object.entries(row)
              .map(([k, v]) => `<b>${escHtml(formatFieldName(k))}</b>: ${escHtml(formatValue(v))}`)
              .join(" | ");
          }
          return `${i + 1}. ${escHtml(String(row))}`;
        })
        .join("\n");

      resultText = `📋 <b>Знайдено: ${data.length} записів</b>\n\n${resultText}`;
    } else if (typeof data === "number") {
      resultText = `📋 <b>Знайдено: ${data} записів</b>`;
    } else {
      resultText = escHtml(String(data));
    }

    return { text: resultText, hash: JSON.stringify(data) };
  } catch (err) {
    console.error("executeConditionQuery exception:", err);
    return null;
  }
}

// ── Відправка в Telegram ──

async function sendTelegramReminder(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  reminder: DueReminder,
  conditionResultText: string | null = null,
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

  const messageParts = [
    `${icon} <b>${escHtml(reminder.title)}</b>`,
    reminder.description ? `\n${escHtml(reminder.description)}` : "",
    conditionResultText ? `\n\n${conditionResultText}` : "",
    `\n${typeLabel} | Пріоритет: ${priorityLabel}`,
    `👤 Створив: ${escHtml(reminder.creator_name)}`,
  ];

  const messageText = messageParts.filter(Boolean).join("\n");

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
