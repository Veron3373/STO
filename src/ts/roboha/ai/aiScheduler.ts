// src/ts/roboha/ai/aiScheduler.ts
// ⏰ Модуль планувальника завдань для AI Атлас
// Крон-задачі: довго відкриті акти, низькі залишки, нагадування клієнтам, зворотній зв'язок

import { supabase } from "../../vxid/supabaseClient";

// ============================================================
// ТИПИ
// ============================================================

export interface SchedulerTask {
  id: string;
  name: string;
  description: string;
  /** Інтервал перевірки в мілісекундах */
  intervalMs: number;
  /** Остання перевірка */
  lastRun: number | null;
  /** Чи активна задача */
  enabled: boolean;
  /** Виконати задачу */
  execute: () => Promise<SchedulerResult>;
}

export interface SchedulerResult {
  success: boolean;
  taskId: string;
  message: string;
  itemsFound: number;
  items?: any[];
  error?: string;
}

export interface SchedulerAlert {
  type: "low_stock" | "long_open_act" | "pending_reminder" | "feedback_request";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  data?: any;
  timestamp: string;
}

// ============================================================
// КОНФІГУРАЦІЯ
// ============================================================

/** Пороги за замовчуванням */
const DEFAULT_THRESHOLDS = {
  /** Кількість днів, після яких акт вважається "довго відкритим" */
  longActDays: 14,
  /** Інтервал перевірки (30 хв) */
  checkIntervalMs: 30 * 60 * 1000,
  /** Максимум оповіщень за один запуск */
  maxAlertsPerRun: 20,
};

/** Кеш порогових значень з settings */
let thresholdsCache: {
  longActDays: number;
  reminderSchedule: any;
  loadedAt: number;
} | null = null;

const THRESHOLDS_CACHE_TTL = 10 * 60 * 1000; // 10 хв

// ============================================================
// ЗАВАНТАЖЕННЯ НАЛАШТУВАНЬ
// ============================================================

/**
 * Завантажує порогові значення з таблиці settings
 */
async function loadThresholds(): Promise<{
  longActDays: number;
  reminderSchedule: any;
}> {
  if (
    thresholdsCache &&
    Date.now() - thresholdsCache.loadedAt < THRESHOLDS_CACHE_TTL
  ) {
    return thresholdsCache;
  }

  try {
    const { data } = await supabase
      .from("settings")
      .select('setting_id, data, "Загальні"')
      .eq("setting_id", 1)
      .single();

    const settingsData = data?.data || data?.["Загальні"] || {};

    const longActDays =
      settingsData?.long_act_threshold_days || DEFAULT_THRESHOLDS.longActDays;
    const reminderSchedule = settingsData?.reminder_schedule || null;

    thresholdsCache = {
      longActDays,
      reminderSchedule,
      loadedAt: Date.now(),
    };

    return thresholdsCache;
  } catch {
    return {
      longActDays: DEFAULT_THRESHOLDS.longActDays,
      reminderSchedule: null,
    };
  }
}

// ============================================================
// ЗАДАЧА: ДОВГО ВІДКРИТІ АКТИ
// ============================================================

/**
 * Перевіряє акти, які відкриті довше порогу (default 14 днів).
 * Повертає масив сповіщень.
 */
export async function checkLongOpenActs(): Promise<SchedulerResult> {
  try {
    const { longActDays } = await loadThresholds();

    const { data, error } = await supabase.rpc("check_long_open_acts", {
      threshold_days: longActDays,
    });

    if (error) {
      return {
        success: false,
        taskId: "long_open_acts",
        message: `Помилка перевірки: ${error.message}`,
        itemsFound: 0,
        error: error.message,
      };
    }

    const acts = data || [];

    if (acts.length === 0) {
      return {
        success: true,
        taskId: "long_open_acts",
        message: "✅ Немає актів, відкритих довше порогу",
        itemsFound: 0,
      };
    }

    return {
      success: true,
      taskId: "long_open_acts",
      message: `⚠️ Знайдено ${acts.length} актів відкритих >  ${longActDays} днів`,
      itemsFound: acts.length,
      items: acts.slice(0, DEFAULT_THRESHOLDS.maxAlertsPerRun),
    };
  } catch (err: any) {
    return {
      success: false,
      taskId: "long_open_acts",
      message: `Помилка: ${err.message}`,
      itemsFound: 0,
      error: err.message,
    };
  }
}

// ============================================================
// ЗАДАЧА: НИЗЬКІ ЗАЛИШКИ НА СКЛАДІ
// ============================================================

/**
 * Перевіряє позиції складу з залишком нижче мінімуму (sclad.min_quantity).
 * Формує рекомендації для закупівлі.
 */
export async function checkLowStock(): Promise<SchedulerResult> {
  try {
    const { data, error } = await supabase.rpc("check_low_stock");

    if (error) {
      return {
        success: false,
        taskId: "low_stock",
        message: `Помилка перевірки складу: ${error.message}`,
        itemsFound: 0,
        error: error.message,
      };
    }

    const items = data || [];

    if (items.length === 0) {
      return {
        success: true,
        taskId: "low_stock",
        message: "✅ Всі залишки в нормі",
        itemsFound: 0,
      };
    }

    return {
      success: true,
      taskId: "low_stock",
      message: `🔴 ${items.length} позицій потребують замовлення`,
      itemsFound: items.length,
      items: items.slice(0, DEFAULT_THRESHOLDS.maxAlertsPerRun),
    };
  } catch (err: any) {
    return {
      success: false,
      taskId: "low_stock",
      message: `Помилка: ${err.message}`,
      itemsFound: 0,
      error: err.message,
    };
  }
}

// ============================================================
// ЗАДАЧА: НАГАДУВАННЯ КЛІЄНТАМ
// ============================================================

/**
 * Перевіряє рекомендації, що потребують відправки (date_to_remind <= NOW()).
 */
export async function checkPendingReminders(): Promise<SchedulerResult> {
  try {
    const { data, error } = await supabase.rpc("get_pending_reminders");

    if (error) {
      return {
        success: false,
        taskId: "pending_reminders",
        message: `Помилка перевірки нагадувань: ${error.message}`,
        itemsFound: 0,
        error: error.message,
      };
    }

    const reminders = data || [];

    if (reminders.length === 0) {
      return {
        success: true,
        taskId: "pending_reminders",
        message: "✅ Немає нагадувань для відправки",
        itemsFound: 0,
      };
    }

    return {
      success: true,
      taskId: "pending_reminders",
      message: `📨 ${reminders.length} нагадувань готові до відправки`,
      itemsFound: reminders.length,
      items: reminders.slice(0, DEFAULT_THRESHOLDS.maxAlertsPerRun),
    };
  } catch (err: any) {
    return {
      success: false,
      taskId: "pending_reminders",
      message: `Помилка: ${err.message}`,
      itemsFound: 0,
      error: err.message,
    };
  }
}

// ============================================================
// ЗАДАЧА: ЗАПИТИ ЗВОРОТНОГО ЗВ'ЯЗКУ
// ============================================================

/**
 * Знаходить закриті акти без зворотного зв'язку (feedback).
 * Актуально для актів закритих 1-3 дні тому.
 */
export async function checkFeedbackRequests(): Promise<SchedulerResult> {
  try {
    // Знаходимо акти закриті 1-3 дні тому
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const oneDayAgo = new Date(
      Date.now() - 1 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: closedActs, error: actsError } = await supabase
      .from("acts")
      .select("act_id, client_id, date_off, data")
      .not("date_off", "is", null)
      .gte("date_off", threeDaysAgo)
      .lte("date_off", oneDayAgo)
      .limit(50);

    if (actsError || !closedActs || closedActs.length === 0) {
      return {
        success: true,
        taskId: "feedback_requests",
        message: "✅ Немає актів для запиту зворотного зв'язку",
        itemsFound: 0,
      };
    }

    // Перевіряємо які з них вже мають feedback
    const actIds = closedActs.map((a) => a.act_id);
    const { data: existingFeedback } = await supabase
      .from("feedback")
      .select("act_id")
      .in("act_id", actIds);

    const feedbackActIds = new Set(
      (existingFeedback || []).map((f: any) => f.act_id),
    );
    const actsWithoutFeedback = closedActs.filter(
      (a) => !feedbackActIds.has(a.act_id),
    );

    if (actsWithoutFeedback.length === 0) {
      return {
        success: true,
        taskId: "feedback_requests",
        message: "✅ Всі закриті акти мають зворотний зв'язок",
        itemsFound: 0,
      };
    }

    return {
      success: true,
      taskId: "feedback_requests",
      message: `📋 ${actsWithoutFeedback.length} актів без зворотного зв'язку`,
      itemsFound: actsWithoutFeedback.length,
      items: actsWithoutFeedback.map((a) => ({
        act_id: a.act_id,
        client_id: a.client_id,
        date_off: a.date_off,
        client_name: a.data?.["ПІБ"] || "—",
        phone: a.data?.["Телефон"] || "",
      })),
    };
  } catch (err: any) {
    return {
      success: false,
      taskId: "feedback_requests",
      message: `Помилка: ${err.message}`,
      itemsFound: 0,
      error: err.message,
    };
  }
}

// ============================================================
// АВТОЗАМОВЛЕННЯ (AUTO PURCHASE REQUESTS)
// ============================================================

/**
 * Створює заявки на закупівлю для позицій з низьким залишком.
 * Групує за постачальником (shop).
 */
export async function createAutoPurchaseRequests(): Promise<SchedulerResult> {
  try {
    // 1. Отримуємо позиції з дефіцитом
    const lowStockResult = await checkLowStock();
    if (!lowStockResult.success || lowStockResult.itemsFound === 0) {
      return {
        success: true,
        taskId: "auto_purchase",
        message: "✅ Немає позицій для автозамовлення",
        itemsFound: 0,
      };
    }

    // 2. Перевіряємо чи немає вже відкритих заявок для цих позицій
    const { data: existingRequests } = await supabase
      .from("purchase_requests")
      .select("request_id, details, status")
      .in("status", ["new", "ordered"]);

    // Збираємо sclad_id з відкритих заявок
    const alreadyOrdered = new Set<number>();
    for (const req of existingRequests || []) {
      const items = req.details || [];
      for (const item of items) {
        if (item.sclad_id) alreadyOrdered.add(item.sclad_id);
      }
    }

    // Фільтруємо тільки нові позиції
    const newItems = (lowStockResult.items || []).filter(
      (item: any) => !alreadyOrdered.has(item.sclad_id),
    );

    if (newItems.length === 0) {
      return {
        success: true,
        taskId: "auto_purchase",
        message: "✅ Всі позиції з дефіцитом вже в заявках",
        itemsFound: 0,
      };
    }

    return {
      success: true,
      taskId: "auto_purchase",
      message: `📦 ${newItems.length} позицій потребують нових заявок на закупівлю`,
      itemsFound: newItems.length,
      items: newItems,
    };
  } catch (err: any) {
    return {
      success: false,
      taskId: "auto_purchase",
      message: `Помилка: ${err.message}`,
      itemsFound: 0,
      error: err.message,
    };
  }
}

// ============================================================
// ЗАПУСК УСІХ ПЕРЕВІРОК
// ============================================================

/**
 * Запускає всі планові перевірки і повертає зведений звіт.
 * Викликається з AI чату або по таймеру.
 */
export async function runAllScheduledChecks(): Promise<{
  alerts: SchedulerAlert[];
  summary: string;
  results: SchedulerResult[];
}> {
  const results = await Promise.all([
    checkLongOpenActs(),
    checkLowStock(),
    checkPendingReminders(),
    checkFeedbackRequests(),
  ]);

  const alerts: SchedulerAlert[] = [];
  const now = new Date().toISOString();

  // Довго відкриті акти
  const longActs = results[0];
  if (longActs.success && longActs.itemsFound > 0) {
    for (const act of longActs.items || []) {
      alerts.push({
        type: "long_open_act",
        severity: act.days_open > 30 ? "critical" : "warning",
        title: `⏰ Акт #${act.act_id} відкритий ${act.days_open} днів`,
        message: `${act.client_name} — ${act.car} (${act.slusar})`,
        data: act,
        timestamp: now,
      });
    }
  }

  // Низькі залишки
  const lowStock = results[1];
  if (lowStock.success && lowStock.itemsFound > 0) {
    for (const item of lowStock.items || []) {
      alerts.push({
        type: "low_stock",
        severity: Number(item.quantity) <= 0 ? "critical" : "warning",
        title: `📦 ${item.name} — залишок ${item.quantity} (мін. ${item.min_quantity})`,
        message: `Артикул: ${item.article}, дефіцит: ${item.deficit}`,
        data: item,
        timestamp: now,
      });
    }
  }

  // Нагадування
  const reminders = results[2];
  if (reminders.success && reminders.itemsFound > 0) {
    for (const r of reminders.items || []) {
      alerts.push({
        type: "pending_reminder",
        severity: "info",
        title: `📨 Нагадування: ${r.client_name}`,
        message: r.text,
        data: r,
        timestamp: now,
      });
    }
  }

  // Зворотний зв'язок
  const feedback = results[3];
  if (feedback.success && feedback.itemsFound > 0) {
    alerts.push({
      type: "feedback_request",
      severity: "info",
      title: `📋 ${feedback.itemsFound} актів без зворотного зв'язку`,
      message: (feedback.items || [])
        .slice(0, 5)
        .map((a: any) => `#${a.act_id} ${a.client_name}`)
        .join(", "),
      data: { count: feedback.itemsFound },
      timestamp: now,
    });
  }

  // Зведений звіт
  const parts: string[] = [];
  for (const r of results) {
    parts.push(`${r.message}`);
  }
  const summary = parts.join("\n");

  return { alerts, summary, results };
}

// ============================================================
// GEMINI FUNCTION DECLARATION
// ============================================================

/**
 * Повертає Gemini function declaration для run_scheduled_checks
 */
export function getSchedulerToolDeclaration(): any {
  return {
    name: "run_scheduled_checks",
    description: `Запускає планові перевірки СТО та повертає зведений звіт. Включає:
- ⏰ Довго відкриті акти (> порогу днів)
- 📦 Низькі залишки на складі (< мінімуму)
- 📨 Нагадування клієнтам, готові до відправки
- 📋 Закриті акти без зворотного зв'язку
Використовуй коли користувач питає: "що потребує уваги?", "перевірки", "сповіщення", "статус СТО", "що замовити?"`,
    parameters: {
      type: "object",
      properties: {
        check_types: {
          type: "array",
          description:
            "Які перевірки запустити (за замовчуванням — всі). Опції: long_acts, low_stock, reminders, feedback",
          items: {
            type: "string",
            enum: ["long_acts", "low_stock", "reminders", "feedback"],
          },
        },
      },
    },
  };
}

/**
 * Виконує вибіркові або всі перевірки за типом.
 */
export async function runSelectedChecks(
  checkTypes?: string[],
): Promise<SchedulerResult[]> {
  if (!checkTypes || checkTypes.length === 0) {
    const result = await runAllScheduledChecks();
    return result.results;
  }

  const results: SchedulerResult[] = [];

  for (const type of checkTypes) {
    switch (type) {
      case "long_acts":
        results.push(await checkLongOpenActs());
        break;
      case "low_stock":
        results.push(await checkLowStock());
        break;
      case "reminders":
        results.push(await checkPendingReminders());
        break;
      case "feedback":
        results.push(await checkFeedbackRequests());
        break;
    }
  }

  return results;
}

// ============================================================
// СКИДАННЯ КЕШУ
// ============================================================

/** Скидає кеш порогових значень */
export function resetThresholdsCache(): void {
  thresholdsCache = null;
}
