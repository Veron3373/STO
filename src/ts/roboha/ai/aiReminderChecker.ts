// ═══════════════════════════════════════════════════════
// 🔔 aiReminderChecker.ts — Перевірка нагадувань (основний обробник)
// Polling кожні 15 сек + precision timer → toast + Telegram
// Сервер (pg_cron) теж відправляє Telegram — дедуплікація через логи
// ═══════════════════════════════════════════════════════

import { supabase } from "../../vxid/supabaseClient";

// ── Конфігурація ──

const CHECK_INTERVAL_MS = 15_000; // 15 секунд — базовий polling
const TOAST_DISPLAY_MS = 12_000; // Час показу toast (12 сек)
const TOAST_STACK_GAP = 12; // Відстань між toast-ами в стеку
const MAX_TOASTS_VISIBLE = 5; // Макс. кількість одночасних toast
const SOUND_ENABLED = true; // Звуковий сигнал

// ── Стан ──

let intervalId: ReturnType<typeof setInterval> | null = null;
let precisionTimerId: ReturnType<typeof setTimeout> | null = null;
let isChecking = false;
let toastContainer: HTMLElement | null = null;
let activeToasts: HTMLElement[] = [];
let currentSlyusarId: number | null = null;
let notificationPermissionAsked = false;
let onRemindersTriggered: (() => void) | null = null;

// ── Ініціалізація ──

export function initReminderChecker(): void {
  // Визначити поточного користувача
  currentSlyusarId = getSlyusarId();
  if (!currentSlyusarId) {
    console.log("[ReminderChecker] Користувач не авторизований, пропускаємо");
    return;
  }

  // Створити контейнер для toast-ів
  ensureToastContainer();

  // Перша перевірка відразу
  checkDueReminders();

  // Запустити базовий polling (15 сек)
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    checkDueReminders();
  }, CHECK_INTERVAL_MS);

  // Запустити precision-планувальник (точно до секунди)
  schedulePrecisionCheck();

  console.log(
    `[ReminderChecker] ✅ Запущено (кожні ${CHECK_INTERVAL_MS / 1000}с + precision) для slyusar_id=${currentSlyusarId}`,
  );
}

/** Колбек для оновлення UI планувальника після спрацювання */
export function setOnRemindersTriggered(cb: () => void): void {
  onRemindersTriggered = cb;
}

export function stopReminderChecker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (precisionTimerId) {
    clearTimeout(precisionTimerId);
    precisionTimerId = null;
  }
  console.log("[ReminderChecker] ⏹ Зупинено");
}

// ── Отримати slyusar_id ──

function getSlyusarId(): number | null {
  try {
    const stored = localStorage.getItem("userAuthData");
    if (stored) {
      const data = JSON.parse(stored);
      return data?.slyusar_id ?? null;
    }
  } catch {
    /* */
  }
  return null;
}

// ── Головна перевірка ──

// ── Відправка Telegram з клієнта (з дедуплікацією) ──

async function sendTelegramForReminder(reminder: DueReminder): Promise<void> {
  try {
    // Дедуплікація: перевірити чи вже відправлено за останні 90 сек
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
        `[ReminderChecker] ⏭️ Telegram вже відправлено (дедуплікація) reminder_id=${reminder.reminder_id}`,
      );
      return;
    }

    const recipientIds = await resolveRecipientIds(reminder);
    console.log(`[ReminderChecker] 👥 Recipients:`, recipientIds);
    if (recipientIds.length === 0) {
      console.log(`[ReminderChecker] ❌ Немає одержувачів — пропускаємо`);
      return;
    }

    const { data: tgUsers, error } = await supabase
      .from("atlas_telegram_users")
      .select("slyusar_id, telegram_chat_id")
      .in("slyusar_id", recipientIds)
      .eq("is_active", true);

    console.log(`[ReminderChecker] 📱 TG users:`, tgUsers, `error:`, error);
    if (error || !tgUsers?.length) {
      console.log(`[ReminderChecker] ❌ Немає TG users або помилка`);
      return;
    }

    const icon = getPriorityIcon(reminder.priority);
    const typeLabel = getTypeLabel(reminder.reminder_type);
    const priorityLabel = getPriorityLabel(reminder.priority);

    const messageText = [
      `${icon} <b>${escHtml(reminder.title)}</b>`,
      reminder.description ? `\n${escHtml(reminder.description)}` : "",
      reminder.meta?.condition_result_text ? `\n<b>📊 Результат перевірки:</b>\n${escHtml(reminder.meta.condition_result_text)}` : "",
      `\n${typeLabel} | Пріоритет: ${priorityLabel}`,
      `👤 Створив: ${escHtml(reminder.creator_name)}`,
    ]
      .filter(Boolean)
      .join("\n");

    console.log(`[ReminderChecker] 📨 Message text (first 300 chars):`, messageText.substring(0, 300));

    const reply_markup = {
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
    };

    for (const tgUser of tgUsers) {
      try {
        console.log(`[ReminderChecker] 📤 Sending to chat_id=${tgUser.telegram_chat_id}...`);
        const sendResult = await supabase.functions.invoke("send-telegram", {
          body: {
            chat_id: tgUser.telegram_chat_id,
            text: messageText,
            parse_mode: "HTML",
            reply_markup,
          },
        });
        console.log(`[ReminderChecker] 📤 Send result:`, sendResult?.data, sendResult?.error);
        await supabase.from("atlas_reminder_logs").insert({
          reminder_id: reminder.reminder_id,
          recipient_id: tgUser.slyusar_id,
          channel: "telegram",
          message_text: messageText,
          delivery_status: "delivered",
        });
      } catch (err) {
        console.error(
          `[ReminderChecker] Telegram error for slyusar=${tgUser.slyusar_id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[ReminderChecker] sendTelegramForReminder error:", err);
  }
}

async function resolveRecipientIds(reminder: DueReminder): Promise<number[]> {
  const recipients = reminder.recipients;

  if (recipients === "self" || recipients === '"self"') {
    return reminder.created_by ? [reminder.created_by] : [];
  }

  if (recipients === "all" || recipients === '"all"') {
    const { data } = await supabase.from("slyusars").select("slyusar_id");
    return data?.map((s: { slyusar_id: number }) => s.slyusar_id) || [];
  }

  if (recipients === "mechanics" || recipients === '"mechanics"') {
    const { data } = await supabase
      .from("slyusars")
      .select("slyusar_id, data")
      .filter("data->>Посада", "eq", "Слюсар");
    return data?.map((s: { slyusar_id: number }) => s.slyusar_id) || [];
  }

  if (Array.isArray(recipients)) return recipients;

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

function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

async function checkDueReminders(): Promise<void> {
  if (isChecking) return;
  isChecking = true;

  try {
    // Перевірити, що користувач все ще авторизований
    if (!currentSlyusarId) {
      currentSlyusarId = getSlyusarId();
      if (!currentSlyusarId) return;
    }

    // Викликати RPC: отримати нагадування, які мають спрацювати
    const { data: dueReminders, error } =
      await supabase.rpc("get_due_reminders");

    if (error) {
      console.error("[ReminderChecker] Помилка get_due_reminders:", error);
      return;
    }

    if (!dueReminders || dueReminders.length === 0) {
      // Немає due, але перевіримо чи є найближче — для precision timer
      schedulePrecisionCheck();
      return;
    }

    console.log(
      `[ReminderChecker] 🔔 Знайдено ${dueReminders.length} нагадувань`,
    );

    let anyTriggered = false;

    // Фільтрувати: показати тільки ті, що стосуються поточного користувача
    for (const reminder of dueReminders) {
      const isForMe = isReminderForUser(reminder, currentSlyusarId);
      if (!isForMe) continue;

      // Для conditional-нагадувань — перевірити умову
      if (
        reminder.reminder_type === "conditional" &&
        reminder.condition_query
      ) {
        console.log(`[ReminderChecker] 📊 Conditional reminder_id=${reminder.reminder_id}, query:`, reminder.condition_query);
        const condResult = await checkCondition(reminder.condition_query);
        console.log(`[ReminderChecker] 📊 Condition result:`, condResult);
        if (!condResult) {
          console.log(`[ReminderChecker] ❌ Умова НЕ виконана (false/empty) — пропускаємо`);
          // Умова не виконана → просто оновити next_trigger_at
          await markTriggered(reminder.reminder_id, false, "Умова не виконана");
          continue;
        }

        console.log(`[ReminderChecker] ✅ Умова виконана! Форматуємо результат...`);

        // Форматуємо результат для Telegram
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
            return new Date(v).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
          }
          return String(v);
        };

        let resultText = "";
        if (Array.isArray(condResult)) {
          resultText = condResult.map((row: any, i: number) => {
            if (typeof row === "object" && row !== null) {
              return `${i + 1}. ` + Object.entries(row)
                .map(([k, v]) => `${formatFieldName(k)}: ${formatValue(v)}`)
                .join(" | ");
            }
            return `${i + 1}. ${String(row)}`;
          }).join("\n");
        } else if (typeof condResult === "object" && condResult !== null) {
          resultText = Object.entries(condResult)
            .map(([k, v]) => `• ${formatFieldName(k)}: ${formatValue(v)}`)
            .join("\n");
        } else {
          resultText = String(condResult);
        }

        console.log(`[ReminderChecker] 📝 Formatted result text:`, resultText.substring(0, 200));
        if (!reminder.meta) reminder.meta = {};
        reminder.meta.condition_result_text = resultText;
      }

      // Показати toast (для app і both каналів)
      if (reminder.channel === "app" || reminder.channel === "both") {
        console.log(`[ReminderChecker] 🔔 Показуємо toast для reminder_id=${reminder.reminder_id}`);
        showReminderToast(reminder);
      }

      // Відправити Telegram (для telegram і both каналів)
      // Дедуплікація: перевірити чи сервер вже не відправив
      if (reminder.channel === "telegram" || reminder.channel === "both") {
        console.log(`[ReminderChecker] ✈️ Відправляємо Telegram для reminder_id=${reminder.reminder_id}`);
        await sendTelegramForReminder(reminder);
      }

      // Записати лог + оновити trigger
      console.log(`[ReminderChecker] ✅ markTriggered для reminder_id=${reminder.reminder_id}`);
      await markTriggered(reminder.reminder_id, true);

      anyTriggered = true;
    }

    // Оновити UI планувальника, якщо хоч одне спрацювало
    if (anyTriggered && onRemindersTriggered) {
      onRemindersTriggered();
    }

    // Перепланувати precision timer
    schedulePrecisionCheck();
  } catch (err) {
    console.error("[ReminderChecker] Невідома помилка:", err);
  } finally {
    isChecking = false;
  }
}

// ── Precision timer: точний запуск в момент next_trigger_at ──

async function schedulePrecisionCheck(): Promise<void> {
  if (precisionTimerId) {
    clearTimeout(precisionTimerId);
    precisionTimerId = null;
  }

  try {
    // Знайти найближче активне нагадування
    const { data } = await supabase
      .from("atlas_reminders")
      .select("next_trigger_at")
      .eq("status", "active")
      .not("next_trigger_at", "is", null)
      .order("next_trigger_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data?.next_trigger_at) return;

    const nextMs = new Date(data.next_trigger_at).getTime();
    const nowMs = Date.now();
    // Запустити через дельту (мінімум 1 сек, максимум 5 хв)
    const delayMs = Math.max(1_000, Math.min(nextMs - nowMs + 500, 300_000));

    precisionTimerId = setTimeout(() => {
      precisionTimerId = null;
      checkDueReminders();
    }, delayMs);

    console.log(
      `[ReminderChecker] ⏱ Precision timer: ${Math.round(delayMs / 1000)}с до наступного`,
    );
  } catch {
    // Ігноруємо — базовий polling підстрахує
  }
}

// ── Перевірка: чи нагадування для цього користувача ──

function isReminderForUser(reminder: DueReminder, slyusarId: number): boolean {
  const recipients = reminder.recipients;

  // "all" — для всіх
  if (recipients === "all" || recipients === '"all"') return true;

  // "self" — тільки для автора
  if (recipients === "self" || recipients === '"self"') {
    return reminder.created_by === slyusarId;
  }

  // "mechanics" — для слюсарів (перевірити роль)
  if (recipients === "mechanics" || recipients === '"mechanics"') {
    return isCurrentUserMechanic();
  }

  // Масив ID
  if (Array.isArray(recipients)) {
    return recipients.includes(slyusarId);
  }

  // JSON-рядок масиву
  if (typeof recipients === "string") {
    try {
      const parsed = JSON.parse(recipients);
      if (Array.isArray(parsed)) return parsed.includes(slyusarId);
    } catch {
      /* */
    }
  }

  // Автор завжди бачить
  return reminder.created_by === slyusarId;
}

function isCurrentUserMechanic(): boolean {
  try {
    const stored = localStorage.getItem("userAuthData");
    if (stored) {
      const data = JSON.parse(stored);
      const role = data?.Посада || data?.role || "";
      return role === "Слюсар";
    }
  } catch {
    /* */
  }
  return false;
}

// ── Перевірка умови (conditional) ──

async function checkCondition(conditionQuery: string): Promise<any | false> {
  try {
    // Виконати SQL-запит через rpc (read-only, безпечний SELECT)
    const { data, error } = await supabase.rpc("execute_condition_query", {
      query_text: conditionQuery,
    });

    if (error) {
      console.warn("[ReminderChecker] Помилка перевірки умови:", error.message);
      return false;
    }

    if (typeof data === "number") return data > 0 ? { count: data } : false;
    if (Array.isArray(data)) return data.length > 0 ? data : false;
    if (typeof data === "boolean") return data ? { result: true } : false;

    return !!data ? data : false;
  } catch {
    return false;
  }
}

// ── Позначити нагадування як спрацьоване ──

async function markTriggered(
  reminderId: number,
  delivered: boolean,
  note?: string,
  channel: "app" | "telegram" = "app",
): Promise<void> {
  try {
    // 1. Записати лог доставки
    await supabase.from("atlas_reminder_logs").insert({
      reminder_id: reminderId,
      recipient_id: currentSlyusarId,
      channel: channel,
      message_text: note || (delivered ? "Показано в додатку" : "Пропущено"),
      delivery_status: delivered ? "sent" : "failed",
      error_message: delivered ? null : note || null,
    });

    // 2. Оновити trigger (next_trigger_at, count, status)
    if (delivered) {
      await supabase.rpc("trigger_reminder", {
        p_reminder_id: reminderId,
      });
    }
  } catch (err) {
    console.error("[ReminderChecker] Помилка markTriggered:", err);
  }
}

// ═══════════════════════════════════════════════════════
// 🎨 TOAST UI
// ═══════════════════════════════════════════════════════

interface DueReminder {
  reminder_id: number;
  title: string;
  description: string | null;
  reminder_type: string;
  recipients: any;
  channel: string;
  priority: string;
  condition_query: string | null;
  schedule: any;
  trigger_count: number;
  created_by: number | null;
  creator_name: string;
  meta: any;
}

function ensureToastContainer(): void {
  if (toastContainer && document.body.contains(toastContainer)) return;

  toastContainer = document.createElement("div");
  toastContainer.id = "atlas-reminder-toasts";
  toastContainer.className = "atlas-reminder-toasts";
  document.body.appendChild(toastContainer);
}

function showReminderToast(reminder: DueReminder): void {
  ensureToastContainer();

  // Обмеження кількості видимих toast
  if (activeToasts.length >= MAX_TOASTS_VISIBLE) {
    const oldest = activeToasts.shift();
    oldest?.remove();
  }

  const toast = document.createElement("div");
  toast.className = `atlas-reminder-toast atlas-reminder-toast--${reminder.priority}`;
  toast.setAttribute("data-reminder-id", String(reminder.reminder_id));

  const icon = getPriorityIcon(reminder.priority);
  const typeLabel = getTypeLabel(reminder.reminder_type);
  const timeStr = new Date().toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  toast.innerHTML = `
    <div class="atlas-reminder-toast__header">
      <span class="atlas-reminder-toast__icon">${icon}</span>
      <span class="atlas-reminder-toast__title">${escapeHtml(reminder.title)}</span>
      <button class="atlas-reminder-toast__close" title="Закрити">&times;</button>
    </div>
    ${reminder.description
      ? `<div class="atlas-reminder-toast__body">${escapeHtml(reminder.description)}</div>`
      : ""
    }
    <div class="atlas-reminder-toast__footer">
      <span class="atlas-reminder-toast__type">${typeLabel}</span>
      <span class="atlas-reminder-toast__time">${timeStr}</span>
      <span class="atlas-reminder-toast__author">від ${escapeHtml(reminder.creator_name)}</span>
    </div>
  `;

  // Кнопка закриття
  const closeBtn = toast.querySelector(".atlas-reminder-toast__close");
  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissToast(toast);
  });

  // Пауза анімації при hover
  toast.addEventListener("mouseenter", () => {
    toast.classList.add("atlas-reminder-toast--hovered");
  });
  toast.addEventListener("mouseleave", () => {
    toast.classList.remove("atlas-reminder-toast--hovered");
  });

  // Клік → відкрити планувальник
  toast.addEventListener("click", () => {
    openPlannerTab();
    dismissToast(toast);
  });

  // Додати в контейнер
  toastContainer!.appendChild(toast);
  activeToasts.push(toast);

  // Звуковий сигнал
  if (SOUND_ENABLED) {
    playNotificationSound(reminder.priority);
  }

  // Запитати дозвіл на браузерні сповіщення (один раз)
  requestBrowserNotification(reminder);

  // Анімація появи
  requestAnimationFrame(() => {
    toast.classList.add("atlas-reminder-toast--visible");
  });

  // Перерахувати позиції
  repositionToasts();

  // Авто-зникнення (якщо не hovered)
  const autoHideTimer = setTimeout(() => {
    if (!toast.classList.contains("atlas-reminder-toast--hovered")) {
      dismissToast(toast);
    } else {
      // Якщо hover — чекаємо ще
      const waitForLeave = () => {
        toast.removeEventListener("mouseleave", waitForLeave);
        setTimeout(() => dismissToast(toast), 2000);
      };
      toast.addEventListener("mouseleave", waitForLeave);
    }
  }, TOAST_DISPLAY_MS);

  // Зберегти timer щоб можна було скасувати
  (toast as any)._autoHideTimer = autoHideTimer;
}

function dismissToast(toast: HTMLElement): void {
  toast.classList.remove("atlas-reminder-toast--visible");
  toast.classList.add("atlas-reminder-toast--hiding");

  const timer = (toast as any)._autoHideTimer;
  if (timer) clearTimeout(timer);

  setTimeout(() => {
    const idx = activeToasts.indexOf(toast);
    if (idx !== -1) activeToasts.splice(idx, 1);
    toast.remove();
    repositionToasts();
  }, 400);
}

function repositionToasts(): void {
  let offset = 0;
  for (const toast of activeToasts) {
    toast.style.transform = `translateY(${offset}px)`;
    offset += toast.offsetHeight + TOAST_STACK_GAP;
  }
}

// ── Утиліти ──

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

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Звук сповіщення ──

function playNotificationSound(priority: string): void {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Різні звуки для різних пріоритетів
    if (priority === "urgent") {
      // Три швидкі біпи
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.15;
      oscillator.start(ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      oscillator.stop(ctx.currentTime + 0.15);

      // Другий біп
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1100;
        gain2.gain.value = 0.15;
        osc2.start(ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.15);
      }, 200);

      // Третій біп
      setTimeout(() => {
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.frequency.value = 1320;
        gain3.gain.value = 0.15;
        osc3.start(ctx.currentTime);
        gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc3.stop(ctx.currentTime + 0.15);
      }, 400);
    } else if (priority === "high") {
      // Два біпи
      oscillator.frequency.value = 660;
      gainNode.gain.value = 0.12;
      oscillator.start(ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      oscillator.stop(ctx.currentTime + 0.2);

      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 880;
        gain2.gain.value = 0.12;
        osc2.start(ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc2.stop(ctx.currentTime + 0.2);
      }, 250);
    } else {
      // Один м'який біп
      oscillator.frequency.value = 523;
      oscillator.type = "sine";
      gainNode.gain.value = 0.08;
      oscillator.start(ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // AudioContext може бути заблокований
  }
}

// ── Браузерне сповіщення (як бонус) ──

function requestBrowserNotification(reminder: DueReminder): void {
  if (notificationPermissionAsked) return;
  notificationPermissionAsked = true;

  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    showBrowserNotification(reminder);
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        showBrowserNotification(reminder);
      }
    });
  }
}

function showBrowserNotification(reminder: DueReminder): void {
  try {
    const icon = getPriorityIcon(reminder.priority);
    new Notification(`${icon} ${reminder.title}`, {
      body: reminder.description || "Нагадування від Атласа",
      icon: "/src/ikons/atlas-icon.png",
      tag: `reminder-${reminder.reminder_id}`,
      requireInteraction: reminder.priority === "urgent",
    });
  } catch {
    // Не критично
  }
}

// ── Відкрити планувальник ──

function openPlannerTab(): void {
  // Відкрити AI-чат якщо закритий
  const chatWindow = document.querySelector(
    ".ai-chat-window",
  ) as HTMLElement | null;
  if (chatWindow && chatWindow.classList.contains("hidden")) {
    const chatBtn = document.getElementById(
      "ai-chat-open-btn",
    ) as HTMLElement | null;
    chatBtn?.click();
  }

  // Переключити на вкладку "Планувальник"
  setTimeout(() => {
    const plannerTab = document.querySelector(
      '[data-tab="planner"]',
    ) as HTMLElement | null;
    plannerTab?.click();
  }, 300);
}
