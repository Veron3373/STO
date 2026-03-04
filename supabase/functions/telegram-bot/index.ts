// supabase/functions/telegram-bot/index.ts
// ═══════════════════════════════════════════════════════
// 🤖 Telegram Bot Webhook — Атлас
// Обробляє вхідні повідомлення від Telegram Bot API:
//   /start <код> — прив'язка Telegram до акаунту слюсаря
//   /stop         — відв'язка
//   /status       — перевірка прив'язки
// ═══════════════════════════════════════════════════════

// @deno-types="npm:@supabase/supabase-js@2/dist/module/index.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2";

/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />
// Для середовища Supabase Edge Functions
// Edge Functions автоматично надають Deno та env

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
} as const;

// @ts-ignore: Deno глобальний у середовищі Edge Functions
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE) {
      console.error(
        "Missing env vars: TELEGRAM_BOT_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY",
      );
      return new Response("OK", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const update = await req.json();

    // Telegram надсилає об'єкт Update
    const message = update?.message;
    if (!message || !message.text) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const username = message.from?.username || null;

    // ────────────────────────────────
    // /start <slyusar_id> — прив'язка
    // ────────────────────────────────
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const linkCode = parts[1]?.trim();

      if (!linkCode) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "👋 Привіт! Я — *Атлас*, бот СТО B.S.Motorservice.\n\n" +
            "Щоб прив'язати ваш Telegram до акаунту, " +
            "відкрийте *Планувальник* в додатку і натисніть " +
            '"🔗 Прив\'язати Telegram".\n\n' +
            "Вам буде надано персональну посилання.",
        );
        return new Response("OK", { status: 200 });
      }

      // linkCode = slyusar_id (простий варіант)
      const slyusarId = parseInt(linkCode, 10);
      if (isNaN(slyusarId)) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "❌ Невірний код прив'язки. Спробуйте ще раз через додаток.",
        );
        return new Response("OK", { status: 200 });
      }

      // Перевірити, чи існує слюсар
      const { data: slyusar, error: slyusarErr } = await supabase
        .from("slyusars")
        .select("slyusar_id, data")
        .eq("slyusar_id", slyusarId)
        .single();

      if (slyusarErr || !slyusar) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "❌ Працівника з таким ID не знайдено.",
        );
        return new Response("OK", { status: 200 });
      }

      const slyusarName = slyusar.data?.Name || `ID ${slyusarId}`;

      // Upsert прив'язки
      const { error: upsertErr } = await supabase
        .from("atlas_telegram_users")
        .upsert(
          {
            slyusar_id: slyusarId,
            telegram_chat_id: chatId,
            telegram_username: username,
            linked_at: new Date().toISOString(),
            is_active: true,
          },
          { onConflict: "slyusar_id" },
        );

      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "❌ Помилка прив'язки. Спробуйте пізніше.",
        );
        return new Response("OK", { status: 200 });
      }

      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        `✅ *Прив'язано!*\n\n` +
          `👤 Працівник: *${slyusarName}*\n` +
          `🆔 ID: ${slyusarId}\n\n` +
          `Тепер ви будете отримувати нагадування від Атласа тут.\n` +
          `Для відключення — /stop`,
      );
      return new Response("OK", { status: 200 });
    }

    // ────────────────────────────────
    // /stop — відв'язка
    // ────────────────────────────────
    if (text === "/stop") {
      const { error } = await supabase
        .from("atlas_telegram_users")
        .update({ is_active: false })
        .eq("telegram_chat_id", chatId);

      if (error) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "❌ Помилка. Спробуйте пізніше.",
        );
      } else {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "🔕 Сповіщення вимкнено.\nЩоб увімкнути знову — зайдіть у Планувальник та прив'яжіть Telegram повторно.",
        );
      }
      return new Response("OK", { status: 200 });
    }

    // ────────────────────────────────
    // /status — перевірка
    // ────────────────────────────────
    if (text === "/status") {
      const { data: link } = await supabase
        .from("atlas_telegram_users")
        .select("slyusar_id, is_active, linked_at")
        .eq("telegram_chat_id", chatId)
        .single();

      if (!link) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "❌ Ваш Telegram не прив'язаний до жодного акаунту СТО.",
        );
      } else {
        const status = link.is_active ? "✅ Активний" : "🔕 Вимкнений";
        const linkedDate = new Date(link.linked_at).toLocaleDateString("uk-UA");
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `📊 *Статус:* ${status}\n🆔 ID працівника: ${link.slyusar_id}\n📅 Прив'язано: ${linkedDate}`,
        );
      }
      return new Response("OK", { status: 200 });
    }

    // ────────────────────────────────
    // Будь-яке інше повідомлення
    // ────────────────────────────────
    await sendTelegramMessage(
      BOT_TOKEN,
      chatId,
      "🤖 Я — *Атлас*, бот нагадувань B.S.Motorservice.\n\n" +
        "Доступні команди:\n" +
        "/status — перевірити прив'язку\n" +
        "/stop — вимкнути сповіщення",
    );

    return new Response("OK", { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("telegram-bot error:", msg);
    // Завжди повертаємо 200, щоб Telegram не повторював запит
    return new Response("OK", { status: 200 });
  }
});

// ── Відправити повідомлення через Telegram Bot API ──

async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("sendTelegramMessage error:", err);
  }
}
