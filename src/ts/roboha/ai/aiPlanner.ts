// ═══════════════════════════════════════
// 📋 aiPlanner.ts — Планувальник Атласа
// CRUD нагадувань + рендеринг UI
// ═══════════════════════════════════════

import { supabase } from "../../vxid/supabaseClient";

// ── Типи ──

export interface Reminder {
  reminder_id: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  reminder_type: "once" | "recurring" | "conditional";
  trigger_at: string | null;
  schedule: ScheduleRule | null;
  condition_query: string | null;
  condition_check_interval: string;
  recipients: string | number[];
  channel: "app" | "telegram" | "both";
  priority: "low" | "normal" | "high" | "urgent";
  status: "active" | "paused" | "completed" | "cancelled";
  last_triggered_at: string | null;
  next_trigger_at: string | null;
  trigger_count: number;
  meta: Record<string, any>;
}

export interface ReminderFromRPC {
  reminder_id: number;
  title: string;
  description: string | null;
  reminder_type: string;
  trigger_at: string | null;
  schedule: any;
  recipients: any;
  channel: string;
  priority: string;
  status: string;
  created_at: string;
  next_trigger_at: string | null;
  last_triggered_at: string | null;
  trigger_count: number;
  creator_name: string;
  is_mine: boolean;
  meta: any;
}

interface ScheduleRule {
  type: "daily" | "weekly" | "monthly" | "interval";
  time?: string;
  days?: string[];
  day?: number;
  hours?: number;
}

// ── Стан ──
let currentFilter: "all" | "active" | "paused" | "completed" = "all";
let reminders: ReminderFromRPC[] = [];
let editingReminderId: number | null = null;
let telegramLinked: boolean | null = null; // null = не перевірено
let telegramUsers: { slyusar_id: number; name: string }[] = [];

// ── Утиліти ──

function getCurrentSlyusarId(): number | null {
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

function getCurrentUserRole(): string {
  try {
    const stored = localStorage.getItem("userAuthData");
    if (stored) {
      const data = JSON.parse(stored);
      return data?.["Доступ"] || "Невідомо";
    }
  } catch {
    /* */
  }
  return "Невідомо";
}

async function checkTelegramLink(): Promise<boolean> {
  const slyusarId = getCurrentSlyusarId();
  if (!slyusarId) return false;
  try {
    const { data } = await supabase
      .from("atlas_telegram_users")
      .select("is_active")
      .eq("slyusar_id", slyusarId)
      .single();
    telegramLinked = !!data?.is_active;
    return telegramLinked;
  } catch {
    telegramLinked = false;
    return false;
  }
}

async function loadTelegramUsers(): Promise<void> {
  try {
    const { data: tgUsers } = await supabase
      .from("atlas_telegram_users")
      .select("slyusar_id")
      .eq("is_active", true);

    if (!tgUsers?.length) {
      telegramUsers = [];
      return;
    }

    const ids = tgUsers.map((u: any) => u.slyusar_id);
    const { data: slyusars } = await supabase
      .from("slyusars")
      .select("slyusar_id, data")
      .in("slyusar_id", ids);

    telegramUsers = (slyusars || []).map((s: any) => ({
      slyusar_id: s.slyusar_id,
      name: s.data?.Name || `ID ${s.slyusar_id}`,
    }));
  } catch {
    telegramUsers = [];
  }
}

function getRecipientsLabel(recipients: any): string {
  if (!recipients || recipients === "self" || recipients === '"self"')
    return "👤 Тільки мені";
  if (recipients === "all" || recipients === '"all"') return "👥 Всім";
  if (recipients === "mechanics" || recipients === '"mechanics"')
    return "🔧 Слюсарям";
  if (Array.isArray(recipients) && recipients.length > 0) {
    const user = telegramUsers.find((u) => u.slyusar_id === recipients[0]);
    return user ? `✈️ ${user.name}` : "👤 Тільки мені";
  }
  return "👤 Тільки мені";
}

function getRecipientsValue(recipients: any): string {
  if (!recipients || recipients === "self" || recipients === '"self"')
    return "self";
  if (recipients === "all" || recipients === '"all"') return "all";
  if (recipients === "mechanics" || recipients === '"mechanics"')
    return "mechanics";
  if (Array.isArray(recipients) && recipients.length > 0)
    return `user_${recipients[0]}`;
  return "self";
}

function renderTelegramStatus(): string {
  const slyusarId = getCurrentSlyusarId();
  if (telegramLinked) {
    return `
      <div class="ai-planner-telegram-status ai-planner-telegram-status--linked">
        <span>✅ Telegram прив'язано</span>
      </div>`;
  }
  return `
    <div class="ai-planner-telegram-status ai-planner-telegram-status--unlinked">
      <span>🔗 Прив'язати Telegram</span>
      <span class="ai-planner-telegram-hint">
        Відкрийте <a href="https://t.me/atlas_sto_braclave_bot?start=${slyusarId || ""}" target="_blank" rel="noopener">@atlas_sto_braclave_bot</a>
        та натисніть <b>Start</b> або надішліть: <code>/start ${slyusarId || "?"}</code>
      </span>
    </div>`;
}

// ── CRUD ──

export async function loadReminders(): Promise<ReminderFromRPC[]> {
  const slyusarId = getCurrentSlyusarId();
  const role = getCurrentUserRole();

  // Адміністратор бачить усі
  if (role === "Адміністратор") {
    const { data, error } = await supabase
      .from("atlas_reminders")
      .select("*")
      .in("status", ["active", "paused", "completed"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Помилка завантаження нагадувань:", error);
      return [];
    }

    // Підвантажуємо імена авторів
    const creatorIds = [
      ...new Set((data || []).map((r: any) => r.created_by).filter(Boolean)),
    ];
    let creatorsMap: Map<number, string> = new Map();

    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from("slyusars")
        .select("slyusar_id, data")
        .in("slyusar_id", creatorIds);

      if (creators) {
        for (const c of creators) {
          creatorsMap.set(c.slyusar_id, c.data?.Name || "—");
        }
      }
    }

    return (data || []).map((r: any) => ({
      ...r,
      creator_name: creatorsMap.get(r.created_by) || "—",
      is_mine: r.created_by === slyusarId,
    }));
  }

  // Інші — через RPC
  if (!slyusarId) return [];

  const { data, error } = await supabase.rpc("get_my_reminders", {
    p_slyusar_id: slyusarId,
  });

  if (error) {
    console.error("❌ Помилка завантаження нагадувань:", error);
    return [];
  }

  return data || [];
}

export async function createReminder(
  reminder: Partial<Reminder>,
): Promise<boolean> {
  const slyusarId = getCurrentSlyusarId();

  const newReminder = {
    title: reminder.title || "Нове нагадування",
    description: reminder.description || null,
    reminder_type: reminder.reminder_type || "once",
    trigger_at: reminder.trigger_at || null,
    schedule: reminder.schedule || null,
    condition_query: reminder.condition_query || null,
    recipients: reminder.recipients || "self",
    channel: reminder.channel || "app",
    priority: reminder.priority || "normal",
    status: "active",
    created_by: slyusarId,
    next_trigger_at: reminder.trigger_at || null,
    meta: reminder.meta || {},
  };

  // Для recurring — обчислити next_trigger_at
  if (reminder.reminder_type === "recurring" && reminder.schedule) {
    newReminder.next_trigger_at = calculateNextTrigger(
      reminder.schedule as ScheduleRule,
    );
  }

  const { error } = await supabase
    .from("atlas_reminders")
    .insert([newReminder]);

  if (error) {
    console.error("❌ Помилка створення нагадування:", error);
    return false;
  }

  return true;
}

export async function updateReminder(
  id: number,
  updates: Partial<Reminder>,
): Promise<boolean> {
  const { error } = await supabase
    .from("atlas_reminders")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("reminder_id", id);

  if (error) {
    console.error("❌ Помилка оновлення нагадування:", error);
    return false;
  }

  return true;
}

export async function deleteReminder(id: number): Promise<boolean> {
  const { error } = await supabase
    .from("atlas_reminders")
    .delete()
    .eq("reminder_id", id);

  if (error) {
    console.error("❌ Помилка видалення нагадування:", error);
    return false;
  }

  return true;
}

export async function togglePause(
  id: number,
  currentStatus: string,
): Promise<boolean> {
  const newStatus = currentStatus === "paused" ? "active" : "paused";
  return updateReminder(id, { status: newStatus } as any);
}

// ── Розрахунок наступного спрацювання ──

function calculateNextTrigger(schedule: ScheduleRule): string | null {
  const now = new Date();

  if (schedule.type === "daily") {
    const [h, m] = (schedule.time || "09:00").split(":").map(Number);
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  if (schedule.type === "weekly" && schedule.days?.length) {
    const dayMap: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    const [h, m] = (schedule.time || "09:00").split(":").map(Number);
    const targetDays = schedule.days.map((d) => dayMap[d] ?? 1);
    const currentDay = now.getDay();

    for (let offset = 0; offset <= 7; offset++) {
      const checkDay = (currentDay + offset) % 7;
      if (targetDays.includes(checkDay)) {
        const next = new Date(now);
        next.setDate(now.getDate() + offset);
        next.setHours(h, m, 0, 0);
        if (next > now) return next.toISOString();
      }
    }
    // Якщо все пройшло — наступний тиждень
    const next = new Date(now);
    next.setDate(now.getDate() + 7);
    next.setHours(h, m, 0, 0);
    return next.toISOString();
  }

  if (schedule.type === "monthly") {
    const day = schedule.day || 1;
    const [h, mm] = (schedule.time || "09:00").split(":").map(Number);
    const next = new Date(now.getFullYear(), now.getMonth(), day, h, mm, 0);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    return next.toISOString();
  }

  if (schedule.type === "interval") {
    const hours = schedule.hours || 1;
    return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  }

  return null;
}

// ═══════════════════════════════════════
// 🎨 РЕНДЕРИНГ
// ═══════════════════════════════════════

const PRIORITY_LABELS: Record<string, string> = {
  low: "🔹 Низький",
  normal: "🔷 Звичайний",
  high: "🔶 Високий",
  urgent: "🔴 Терміновий",
};

const TYPE_LABELS: Record<string, string> = {
  once: "⏰ Одноразове",
  recurring: "🔄 Повторюване",
  conditional: "📊 Умовне",
};

const CHANNEL_LABELS: Record<string, string> = {
  app: "📱 Додаток",
  telegram: "✈️ Telegram",
  both: "📱✈️ Обидва",
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecipients(recipients: any): string {
  if (recipients === "self" || recipients === '"self"') return "👤 Тільки я";
  if (recipients === "all" || recipients === '"all"') return "👥 Всі";
  if (recipients === "mechanics" || recipients === '"mechanics"')
    return "🔧 Слюсарі";
  if (Array.isArray(recipients)) return `👥 ${recipients.length} осіб`;
  return "👤 Тільки я";
}

function formatSchedule(schedule: any): string {
  if (!schedule) return "";
  if (schedule.type === "daily") return `Щодня о ${schedule.time || "09:00"}`;
  if (schedule.type === "weekly") {
    const dayNames: Record<string, string> = {
      mon: "Пн",
      tue: "Вт",
      wed: "Ср",
      thu: "Чт",
      fri: "Пт",
      sat: "Сб",
      sun: "Нд",
    };
    const days = (schedule.days || [])
      .map((d: string) => dayNames[d] || d)
      .join(", ");
    return `${days} о ${schedule.time || "09:00"}`;
  }
  if (schedule.type === "monthly")
    return `${schedule.day}-го числа о ${schedule.time || "09:00"}`;
  if (schedule.type === "interval") return `Кожні ${schedule.hours} год.`;
  return "";
}

// ── Головна функція рендерингу ──

export async function renderPlannerPanel(
  container: HTMLElement,
): Promise<void> {
  if (telegramLinked === null) await checkTelegramLink();
  const filtered = filterReminders(reminders);

  container.innerHTML = `
    <div class="ai-planner">
      <!-- Заголовок -->
      <div class="ai-planner-header">
        ${renderTelegramStatus()}
        <button class="ai-planner-add-btn" id="planner-add-btn">
          ➕ Створити
        </button>
      </div>

      <!-- Фільтри -->
      <div class="ai-planner-filters">
        <button class="ai-planner-filter ${currentFilter === "all" ? "ai-planner-filter--active" : ""}" data-filter="all">
          Всі (${reminders.length})
        </button>
        <button class="ai-planner-filter ${currentFilter === "active" ? "ai-planner-filter--active" : ""}" data-filter="active">
          ⏳ Активні (${reminders.filter((r) => r.status === "active").length})
        </button>
        <button class="ai-planner-filter ${currentFilter === "paused" ? "ai-planner-filter--active" : ""}" data-filter="paused">
          ⏸️ Пауза (${reminders.filter((r) => r.status === "paused").length})
        </button>
        <button class="ai-planner-filter ${currentFilter === "completed" ? "ai-planner-filter--active" : ""}" data-filter="completed">
          ✅ Завершені (${reminders.filter((r) => r.status === "completed").length})
        </button>
      </div>

      <!-- Список -->
      <div class="ai-planner-list" id="planner-list">
        ${filtered.length === 0 ? renderEmptyState() : filtered.map(renderReminderCard).join("")}
      </div>
    </div>
  `;

  // Обробники
  initPlannerHandlers(container);
}

function filterReminders(list: ReminderFromRPC[]): ReminderFromRPC[] {
  if (currentFilter === "all") return list;
  return list.filter((r) => r.status === currentFilter);
}

function renderEmptyState(): string {
  return `
    <div class="ai-planner-empty">
      <div class="ai-planner-empty-icon">📋</div>
      <div class="ai-planner-empty-text">Нагадувань поки немає</div>
      <div class="ai-planner-empty-hint">Натисніть ➕ Створити або скажіть Атласу:<br>«Нагадай мені в середу...»</div>
    </div>
  `;
}

function renderReminderCard(r: ReminderFromRPC): string {
  const priorityClass = `ai-planner-card--${r.priority}`;
  const statusClass =
    r.status !== "active" ? `ai-planner-card--${r.status}` : "";

  const timeInfo =
    r.reminder_type === "once"
      ? `🕐 ${formatDateTime(r.trigger_at || r.next_trigger_at)}`
      : r.reminder_type === "recurring"
        ? `🔄 ${formatSchedule(r.schedule)}`
        : `📊 Умовна перевірка`;

  const nextTrigger =
    r.next_trigger_at && r.status === "active"
      ? `⏭️ Наступне: ${formatDateTime(r.next_trigger_at)}`
      : "";

  return `
    <div class="ai-planner-card ${priorityClass} ${statusClass}" data-reminder-id="${r.reminder_id}">
      <div class="ai-planner-card-header">
        <div class="ai-planner-card-title">${escapeHtml(r.title)}</div>
        <div class="ai-planner-card-actions">
          ${
            r.status !== "completed"
              ? `
            <button class="ai-planner-card-action ai-planner-card-action--pause" data-action="pause" data-id="${r.reminder_id}" title="${r.status === "paused" ? "Відновити" : "Пауза"}">
              ${r.status === "paused" ? "▶️" : "⏸️"}
            </button>
          `
              : ""
          }
          <button class="ai-planner-card-action ai-planner-card-action--delete" data-action="delete" data-id="${r.reminder_id}" title="Видалити">🗑️</button>
        </div>
      </div>

      ${r.description ? `<div style="font-size:11px;color:#777;margin-bottom:4px">${escapeHtml(r.description)}</div>` : ""}

      <div class="ai-planner-card-meta">
        <span class="ai-planner-card-badge ai-planner-card-badge--type-${r.reminder_type}">${TYPE_LABELS[r.reminder_type] || r.reminder_type}</span>
        <span class="ai-planner-card-badge ai-planner-card-badge--channel-${r.channel}">${CHANNEL_LABELS[r.channel] || r.channel}</span>
        ${r.priority !== "normal" ? `<span class="ai-planner-card-badge ai-planner-card-badge--priority-${r.priority}">${PRIORITY_LABELS[r.priority]}</span>` : ""}
      </div>

      <div class="ai-planner-card-time">${timeInfo}</div>
      ${nextTrigger ? `<div class="ai-planner-card-time" style="margin-top:2px">${nextTrigger}</div>` : ""}

      <div class="ai-planner-card-footer">
        <div class="ai-planner-card-recipients">${formatRecipients(r.recipients)}</div>
        ${r.trigger_count > 0 ? `<div class="ai-planner-card-trigger-count">🔔 ${r.trigger_count}×</div>` : ""}
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ═══════════════════════════════════════
// ⚙️ ОБРОБНИКИ
// ═══════════════════════════════════════

function initPlannerHandlers(container: HTMLElement): void {
  // Кнопка створити
  container.querySelector("#planner-add-btn")?.addEventListener("click", () => {
    editingReminderId = null;
    showReminderModal(container);
  });

  // Фільтри
  container.querySelectorAll(".ai-planner-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = (btn as HTMLElement).dataset.filter as any;
      renderPlannerPanel(container);
    });
  });

  // Дії на картках
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.action;
      const id = Number((btn as HTMLElement).dataset.id);
      if (!id) return;

      if (action === "delete") {
        const deleteBtn = btn as HTMLElement;
        const card = deleteBtn.closest(".ai-planner-card") as HTMLElement;
        if (!card || deleteBtn.dataset.counting === "true") return;

        deleteBtn.dataset.counting = "true";
        deleteBtn.innerHTML = "";
        deleteBtn.classList.add("ai-planner-card-action--counting");

        // Завжди показувати actions під час відліку
        const actionsEl = deleteBtn.closest(
          ".ai-planner-card-actions",
        ) as HTMLElement;
        if (actionsEl)
          actionsEl.classList.add("ai-planner-card-actions--counting");

        const countdown = document.createElement("span");
        countdown.className = "ai-planner-delete-countdown";
        countdown.textContent = "5";
        deleteBtn.appendChild(countdown);

        let timeLeft = 5;
        let cancelled = false;

        const interval = setInterval(() => {
          timeLeft--;
          countdown.textContent = String(timeLeft);
          if (timeLeft <= 0) {
            clearInterval(interval);
            if (!cancelled) {
              card.style.transition = "opacity 0.3s, transform 0.3s";
              card.style.opacity = "0";
              card.style.transform = "translateX(30px)";
              setTimeout(async () => {
                const ok = await deleteReminder(id);
                if (ok) {
                  showToast("Видалено", "success");
                  await refreshPlanner(container);
                } else {
                  showToast("Помилка видалення", "error");
                  card.style.opacity = "1";
                  card.style.transform = "";
                }
              }, 300);
            }
          }
        }, 1000);

        // Скасування при кліку на кружок
        countdown.addEventListener("click", (ce) => {
          ce.stopPropagation();
          cancelled = true;
          clearInterval(interval);
          deleteBtn.dataset.counting = "";
          deleteBtn.classList.remove("ai-planner-card-action--counting");
          if (actionsEl)
            actionsEl.classList.remove("ai-planner-card-actions--counting");
          deleteBtn.innerHTML = "🗑️";
        });
      } else if (action === "pause") {
        const reminder = reminders.find((r) => r.reminder_id === id);
        if (reminder) {
          const ok = await togglePause(id, reminder.status);
          if (ok) {
            showToast(
              reminder.status === "paused" ? "Відновлено ▶️" : "На паузі ⏸️",
              "info",
            );
            await refreshPlanner(container);
          }
        }
      }
    });
  });

  // Двойний клік на картку — редагування
  container.querySelectorAll(".ai-planner-card").forEach((card) => {
    card.addEventListener("dblclick", () => {
      const id = Number((card as HTMLElement).dataset.reminderId);
      if (!id) return;
      editingReminderId = id;
      showReminderModal(
        container,
        reminders.find((r) => r.reminder_id === id),
      );
    });
  });
}

// ── Оновити список ──

async function refreshPlanner(container: HTMLElement): Promise<void> {
  reminders = await loadReminders();
  await renderPlannerPanel(container);
}

// ── Toast ──

function showToast(
  text: string,
  type: "success" | "error" | "info" = "info",
): void {
  const toast = document.createElement("div");
  toast.className = `ai-planner-toast ai-planner-toast--${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ═══════════════════════════════════════
// 🪟 МОДАЛКА СТВОРЕННЯ / РЕДАГУВАННЯ
// ═══════════════════════════════════════

function showReminderModal(
  container: HTMLElement,
  existing?: ReminderFromRPC,
): void {
  // Видаляємо попередній оверлей, якщо є
  container
    .closest(".ai-chat-window")
    ?.querySelector(".ai-planner-modal-overlay")
    ?.remove();

  const isEdit = !!existing;
  const r = existing || ({} as any);

  const overlay = document.createElement("div");
  overlay.className = "ai-planner-modal-overlay";
  overlay.innerHTML = `
    <div class="ai-planner-modal">
      <div class="ai-planner-modal-header">
        <div class="ai-planner-modal-title">${isEdit ? "✏️ Редагувати" : "➕ Нове нагадування"}</div>
        <button class="ai-planner-modal-close" id="planner-modal-close">✕</button>
      </div>
      <div class="ai-planner-modal-body">
        <!-- Назва -->
        <div class="ai-planner-field">
          <label class="ai-planner-label">Назва *</label>
          <input class="ai-planner-input" id="planner-title" type="text"
            placeholder="Нагадай розрахувати слюсарів..."
            value="${escapeHtml(r.title || "")}" />
        </div>

        <!-- Опис -->
        <div class="ai-planner-field">
          <label class="ai-planner-label">Опис</label>
          <textarea class="ai-planner-textarea" id="planner-desc"
            placeholder="Додатковий опис (необов'язково)">${escapeHtml(r.description || "")}</textarea>
        </div>

        <!-- Тип -->
        <div class="ai-planner-field">
          <label class="ai-planner-label">Тип</label>
          <div class="ai-planner-btn-group" id="planner-type-group">
            <button class="ai-planner-btn-option ${(r.reminder_type || "once") === "once" ? "ai-planner-btn-option--active" : ""}" data-value="once">⏰ Одноразове</button>
            <button class="ai-planner-btn-option ${r.reminder_type === "recurring" ? "ai-planner-btn-option--active" : ""}" data-value="recurring">🔄 Повторюване</button>
            <button class="ai-planner-btn-option ${r.reminder_type === "conditional" ? "ai-planner-btn-option--active" : ""}" data-value="conditional">📊 Умовне</button>
          </div>
        </div>

        <!-- Дата/час (для once) -->
        <div class="ai-planner-field" id="planner-once-fields" style="display:${(r.reminder_type || "once") === "once" ? "flex" : "none"}">
          <label class="ai-planner-label">Коли нагадати</label>
          <input class="ai-planner-input" id="planner-trigger-at" type="datetime-local"
            value="${r.trigger_at ? new Date(r.trigger_at).toISOString().slice(0, 16) : ""}" />
        </div>

        <!-- Розклад (для recurring) -->
        <div id="planner-recurring-fields" style="display:${r.reminder_type === "recurring" ? "flex" : "none"};flex-direction:column;gap:10px">
          <div class="ai-planner-field">
            <label class="ai-planner-label">Частота</label>
            <select class="ai-planner-select" id="planner-schedule-type">
              <option value="daily" ${r.schedule?.type === "daily" ? "selected" : ""}>Щодня</option>
              <option value="weekly" ${r.schedule?.type === "weekly" ? "selected" : ""}>Щотижня</option>
              <option value="monthly" ${r.schedule?.type === "monthly" ? "selected" : ""}>Щомісяця</option>
              <option value="interval" ${r.schedule?.type === "interval" ? "selected" : ""}>Через N годин</option>
            </select>
          </div>
          <div class="ai-planner-row">
            <div class="ai-planner-field" id="planner-time-field">
              <label class="ai-planner-label">Час</label>
              <input class="ai-planner-input" id="planner-schedule-time" type="time"
                value="${r.schedule?.time || "09:00"}" />
            </div>
            <div class="ai-planner-field" id="planner-interval-field" style="display:${r.schedule?.type === "interval" ? "flex" : "none"}">
              <label class="ai-planner-label">Годин</label>
              <input class="ai-planner-input" id="planner-schedule-hours" type="number" min="1" max="168"
                value="${r.schedule?.hours || 4}" />
            </div>
          </div>
          <div class="ai-planner-field" id="planner-days-field" style="display:${r.schedule?.type === "weekly" ? "block" : "none"}">
            <label class="ai-planner-label">Дні тижня</label>
            <div class="ai-planner-btn-group" id="planner-days-group">
              ${["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
                .map((d) => {
                  const names: Record<string, string> = {
                    mon: "Пн",
                    tue: "Вт",
                    wed: "Ср",
                    thu: "Чт",
                    fri: "Пт",
                    sat: "Сб",
                    sun: "Нд",
                  };
                  const isActive = r.schedule?.days?.includes(d);
                  return `<button class="ai-planner-btn-option ${isActive ? "ai-planner-btn-option--active" : ""}" data-day="${d}">${names[d]}</button>`;
                })
                .join("")}
            </div>
          </div>
          <div class="ai-planner-field" id="planner-month-day-field" style="display:${r.schedule?.type === "monthly" ? "flex" : "none"}">
            <label class="ai-planner-label">День місяця</label>
            <input class="ai-planner-input" id="planner-schedule-day" type="number" min="1" max="31"
              value="${r.schedule?.day || 1}" />
          </div>
        </div>

        <!-- Умовний запит (для conditional) -->
        <div class="ai-planner-field" id="planner-conditional-fields" style="display:${r.reminder_type === "conditional" ? "flex" : "none"}">
          <label class="ai-planner-label">SQL-умова (які записи перевіряти)</label>
          <textarea class="ai-planner-textarea" id="planner-condition-query" style="min-height:80px;font-family:monospace;font-size:12px"
            placeholder="SELECT act_id, data->>'ПІБ' FROM acts WHERE date_off IS NULL AND date_on < NOW() - INTERVAL '21 days'">${escapeHtml(r.condition_query || "")}</textarea>
        </div>

        <!-- Пріоритет -->
        <div class="ai-planner-field">
          <label class="ai-planner-label">Пріоритет</label>
          <div class="ai-planner-btn-group" id="planner-priority-group">
            <button class="ai-planner-btn-option ${(r.priority || "normal") === "low" ? "ai-planner-btn-option--active" : ""}" data-value="low">🔹 Низький</button>
            <button class="ai-planner-btn-option ${(r.priority || "normal") === "normal" ? "ai-planner-btn-option--active" : ""}" data-value="normal">🔷 Звичайний</button>
            <button class="ai-planner-btn-option ${(r.priority || "normal") === "high" ? "ai-planner-btn-option--active" : ""}" data-value="high">🔶 Високий</button>
            <button class="ai-planner-btn-option ${(r.priority || "normal") === "urgent" ? "ai-planner-btn-option--active" : ""}" data-value="urgent">🔴 Терміновий</button>
          </div>
        </div>

        <!-- Канал -->
        <div class="ai-planner-field">
          <label class="ai-planner-label">Куди надіслати</label>
          <div class="ai-planner-btn-group" id="planner-channel-group">
            <button class="ai-planner-btn-option ${(r.channel || "app") === "app" ? "ai-planner-btn-option--active" : ""}" data-value="app">📱 Додаток</button>
            <button class="ai-planner-btn-option ${r.channel === "telegram" ? "ai-planner-btn-option--active" : ""}" data-value="telegram">✈️ Telegram</button>
            <button class="ai-planner-btn-option ${r.channel === "both" ? "ai-planner-btn-option--active" : ""}" data-value="both">📱✈️ Обидва</button>
          </div>
        </div>

        <!-- Адресати -->
        <div class="ai-planner-field">
          <label class="ai-planner-label">Кому</label>
          <div class="ai-planner-dropdown" id="planner-recipients-dropdown">
            <div class="ai-planner-dropdown-selected" id="planner-recipients-toggle">
              <span id="planner-recipients-label">${getRecipientsLabel(r.recipients)}</span>
              <svg class="ai-planner-dropdown-arrow" width="12" height="12" viewBox="0 0 20 20" fill="#999"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
            </div>
            <div class="ai-planner-dropdown-menu" id="planner-recipients-menu">
              <div class="ai-planner-dropdown-item ${!r.recipients || r.recipients === "self" || r.recipients === '"self"' ? "ai-planner-dropdown-item--active" : ""}" data-value="self">👤 Тільки мені</div>
              <div class="ai-planner-dropdown-item ${r.recipients === "all" || r.recipients === '"all"' ? "ai-planner-dropdown-item--active" : ""}" data-value="all">👥 Всім</div>
              <div class="ai-planner-dropdown-item ${r.recipients === "mechanics" || r.recipients === '"mechanics"' ? "ai-planner-dropdown-item--active" : ""}" data-value="mechanics">🔧 Слюсарям</div>
              ${telegramUsers.length > 0 ? '<div class="ai-planner-dropdown-divider"></div>' : ""}
              ${telegramUsers
                .map((u) => {
                  const isSelected =
                    Array.isArray(r.recipients) &&
                    r.recipients.includes(u.slyusar_id);
                  return `<div class="ai-planner-dropdown-item ${isSelected ? "ai-planner-dropdown-item--active" : ""}" data-value="user_${u.slyusar_id}">✈️ ${escapeHtml(u.name)}</div>`;
                })
                .join("")}
            </div>
            <input type="hidden" id="planner-recipients" value="${getRecipientsValue(r.recipients)}" />
          </div>
        </div>
      </div>

      <div class="ai-planner-modal-footer">
        ${isEdit ? `<button class="ai-planner-btn ai-planner-btn--delete" id="planner-modal-delete">🗑️ Видалити</button>` : ""}
        <button class="ai-planner-btn ai-planner-btn--cancel" id="planner-modal-cancel">↩️ Скасувати</button>
        <button class="ai-planner-btn ai-planner-btn--save" id="planner-modal-save">${isEdit ? "💾 Зберегти" : "➕ Створити"}</button>
      </div>
    </div>
  `;

  container.closest(".ai-chat-window")!.appendChild(overlay);

  // ── Обробники модалки ──
  initModalHandlers(overlay, container, isEdit);
}

function initModalHandlers(
  overlay: HTMLElement,
  plannerContainer: HTMLElement,
  isEdit: boolean,
): void {
  // Закрити
  const close = () => overlay.remove();
  overlay
    .querySelector("#planner-modal-close")
    ?.addEventListener("click", close);
  overlay
    .querySelector("#planner-modal-cancel")
    ?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Кастомний дропдаун «Кому»
  const dropdown = overlay.querySelector(
    "#planner-recipients-dropdown",
  ) as HTMLElement;
  const toggle = overlay.querySelector(
    "#planner-recipients-toggle",
  ) as HTMLElement;
  const menu = overlay.querySelector("#planner-recipients-menu") as HTMLElement;
  const hiddenInput = overlay.querySelector(
    "#planner-recipients",
  ) as HTMLInputElement;
  const label = overlay.querySelector(
    "#planner-recipients-label",
  ) as HTMLElement;

  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("ai-planner-dropdown--open");
  });

  menu?.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest(
      ".ai-planner-dropdown-item",
    ) as HTMLElement;
    if (!item) return;
    menu
      .querySelectorAll(".ai-planner-dropdown-item")
      .forEach((i) => i.classList.remove("ai-planner-dropdown-item--active"));
    item.classList.add("ai-planner-dropdown-item--active");
    hiddenInput.value = item.dataset.value || "self";
    label.textContent = item.textContent || "👤 Тільки мені";
    dropdown.classList.remove("ai-planner-dropdown--open");
  });

  overlay.addEventListener("click", () => {
    dropdown?.classList.remove("ai-planner-dropdown--open");
  });

  // Вибір типу
  let selectedType =
    (
      overlay.querySelector(
        "#planner-type-group .ai-planner-btn-option--active",
      ) as HTMLElement
    )?.dataset.value || "once";

  overlay
    .querySelector("#planner-type-group")
    ?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        ".ai-planner-btn-option",
      ) as HTMLElement;
      if (!btn) return;
      overlay
        .querySelectorAll("#planner-type-group .ai-planner-btn-option")
        .forEach((b) => b.classList.remove("ai-planner-btn-option--active"));
      btn.classList.add("ai-planner-btn-option--active");
      selectedType = btn.dataset.value || "once";

      // Показати/сховати поля
      (
        overlay.querySelector("#planner-once-fields") as HTMLElement
      ).style.display = selectedType === "once" ? "flex" : "none";
      (
        overlay.querySelector("#planner-recurring-fields") as HTMLElement
      ).style.display = selectedType === "recurring" ? "flex" : "none";
      (
        overlay.querySelector("#planner-conditional-fields") as HTMLElement
      ).style.display = selectedType === "conditional" ? "flex" : "none";
    });

  // Частота (для recurring)
  const scheduleType = overlay.querySelector(
    "#planner-schedule-type",
  ) as HTMLSelectElement;
  scheduleType?.addEventListener("change", () => {
    const v = scheduleType.value;
    (
      overlay.querySelector("#planner-days-field") as HTMLElement
    ).style.display = v === "weekly" ? "block" : "none";
    (
      overlay.querySelector("#planner-month-day-field") as HTMLElement
    ).style.display = v === "monthly" ? "flex" : "none";
    (
      overlay.querySelector("#planner-interval-field") as HTMLElement
    ).style.display = v === "interval" ? "flex" : "none";
    (
      overlay.querySelector("#planner-time-field") as HTMLElement
    ).style.display = v === "interval" ? "none" : "flex";
  });

  // Дні тижня — мультивибір
  overlay
    .querySelector("#planner-days-group")
    ?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        ".ai-planner-btn-option",
      ) as HTMLElement;
      if (!btn) return;
      btn.classList.toggle("ai-planner-btn-option--active");
    });

  // Пріоритет
  let selectedPriority =
    (
      overlay.querySelector(
        "#planner-priority-group .ai-planner-btn-option--active",
      ) as HTMLElement
    )?.dataset.value || "normal";
  overlay
    .querySelector("#planner-priority-group")
    ?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        ".ai-planner-btn-option",
      ) as HTMLElement;
      if (!btn) return;
      overlay
        .querySelectorAll("#planner-priority-group .ai-planner-btn-option")
        .forEach((b) => b.classList.remove("ai-planner-btn-option--active"));
      btn.classList.add("ai-planner-btn-option--active");
      selectedPriority = btn.dataset.value || "normal";
    });

  // Канал
  let selectedChannel =
    (
      overlay.querySelector(
        "#planner-channel-group .ai-planner-btn-option--active",
      ) as HTMLElement
    )?.dataset.value || "app";
  overlay
    .querySelector("#planner-channel-group")
    ?.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        ".ai-planner-btn-option",
      ) as HTMLElement;
      if (!btn) return;
      overlay
        .querySelectorAll("#planner-channel-group .ai-planner-btn-option")
        .forEach((b) => b.classList.remove("ai-planner-btn-option--active"));
      btn.classList.add("ai-planner-btn-option--active");
      selectedChannel = btn.dataset.value || "app";
    });

  // Видалити (тільки edit)
  overlay
    .querySelector("#planner-modal-delete")
    ?.addEventListener("click", async () => {
      if (editingReminderId && confirm("Видалити це нагадування?")) {
        const ok = await deleteReminder(editingReminderId);
        if (ok) {
          showToast("Видалено", "success");
          close();
          await refreshPlanner(plannerContainer);
        } else {
          showToast("Помилка видалення", "error");
        }
      }
    });

  // Зберегти
  overlay
    .querySelector("#planner-modal-save")
    ?.addEventListener("click", async () => {
      const title = (
        overlay.querySelector("#planner-title") as HTMLInputElement
      ).value.trim();
      if (!title) {
        showToast("Вкажіть назву!", "error");
        return;
      }

      const description =
        (
          overlay.querySelector("#planner-desc") as HTMLTextAreaElement
        ).value.trim() || null;
      const recipientsVal = (
        overlay.querySelector("#planner-recipients") as HTMLInputElement
      ).value;

      const parsedRecipients = recipientsVal.startsWith("user_")
        ? [Number(recipientsVal.replace("user_", ""))]
        : recipientsVal;

      const reminder: Partial<Reminder> = {
        title,
        description,
        reminder_type: selectedType as any,
        priority: selectedPriority as any,
        channel: selectedChannel as any,
        recipients: parsedRecipients as any,
      };

      // Тип-специфічні поля
      if (selectedType === "once") {
        const triggerAt = (
          overlay.querySelector("#planner-trigger-at") as HTMLInputElement
        ).value;
        if (!triggerAt) {
          showToast("Вкажіть дату/час!", "error");
          return;
        }
        reminder.trigger_at = new Date(triggerAt).toISOString();
      } else if (selectedType === "recurring") {
        const schedType = (
          overlay.querySelector("#planner-schedule-type") as HTMLSelectElement
        ).value;
        const schedule: any = { type: schedType };

        if (
          schedType === "daily" ||
          schedType === "weekly" ||
          schedType === "monthly"
        ) {
          schedule.time =
            (
              overlay.querySelector(
                "#planner-schedule-time",
              ) as HTMLInputElement
            ).value || "09:00";
        }

        if (schedType === "weekly") {
          schedule.days = Array.from(
            overlay.querySelectorAll(
              "#planner-days-group .ai-planner-btn-option--active",
            ),
          )
            .map((btn) => (btn as HTMLElement).dataset.day)
            .filter(Boolean);
          if (schedule.days.length === 0) {
            showToast("Оберіть хоча б один день!", "error");
            return;
          }
        }

        if (schedType === "monthly") {
          schedule.day =
            Number(
              (
                overlay.querySelector(
                  "#planner-schedule-day",
                ) as HTMLInputElement
              ).value,
            ) || 1;
        }

        if (schedType === "interval") {
          schedule.hours =
            Number(
              (
                overlay.querySelector(
                  "#planner-schedule-hours",
                ) as HTMLInputElement
              ).value,
            ) || 4;
        }

        reminder.schedule = schedule;
      } else if (selectedType === "conditional") {
        const condQuery = (
          overlay.querySelector(
            "#planner-condition-query",
          ) as HTMLTextAreaElement
        ).value.trim();
        if (!condQuery) {
          showToast("Вкажіть SQL-умову!", "error");
          return;
        }
        reminder.condition_query = condQuery;
      }

      // Зберігаємо
      let ok: boolean;
      if (isEdit && editingReminderId) {
        ok = await updateReminder(editingReminderId, reminder as any);
      } else {
        ok = await createReminder(reminder);
      }

      if (ok) {
        showToast(isEdit ? "Збережено ✅" : "Створено ✅", "success");
        close();
        await refreshPlanner(plannerContainer);
      } else {
        showToast("Помилка збереження", "error");
      }
    });
}

// ═══════════════════════════════════════
// 🚀 ІНІЦІАЛІЗАЦІЯ (викликається з aiChat.ts)
// ═══════════════════════════════════════

export async function initPlannerTab(container: HTMLElement): Promise<void> {
  // Показати спіннер
  container.innerHTML = `
    <div class="ai-planner-loading">
      <div class="ai-spinner"></div>
      <span>Завантаження планувальника...</span>
    </div>
  `;

  // Завантажити
  await loadTelegramUsers();
  reminders = await loadReminders();
  await renderPlannerPanel(container);
}

// ═══════════════════════════════════════
// 🔧 FUNCTION CALLING — Tool Declaration
// ═══════════════════════════════════════

/** Tool declaration для Gemini/Groq Function Calling */
export function getReminderToolDeclaration() {
  return {
    name: "create_reminder",
    description:
      "Створити нагадування або заплановану задачу для користувача СТО. " +
      "Використовуй коли користувач каже 'нагадай', 'нагадуй', 'запиши нагадування', " +
      "'запланувати', 'не забудь', 'через годину нагадай', 'в середу нагадай' тощо. " +
      "Повертає створене нагадування з ID.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Коротка назва нагадування. Наприклад: 'Розрахувати слюсарів', 'Перевірити відкриті акти'",
        },
        description: {
          type: "string",
          description:
            "Детальний опис (необов'язково). Додаткова інформація для нагадування.",
        },
        reminder_type: {
          type: "string",
          enum: ["once", "recurring", "conditional"],
          description:
            "Тип нагадування: " +
            "'once' = одноразове (конкретна дата/час), " +
            "'recurring' = повторюване (щодня/щотижня/щомісяця), " +
            "'conditional' = умовне (перевіряє БД і спрацьовує якщо є результати)",
        },
        trigger_at: {
          type: "string",
          description:
            "ISO дата/час спрацювання для 'once'. Наприклад: '2026-03-05T09:00:00'. " +
            "Якщо користувач каже 'в середу' — обчисли найближчу середу.",
        },
        schedule_type: {
          type: "string",
          enum: ["daily", "weekly", "monthly", "interval"],
          description:
            "Тип розкладу для 'recurring': daily/weekly/monthly/interval",
        },
        schedule_time: {
          type: "string",
          description:
            "Час спрацювання у форматі 'HH:MM'. За замовчуванням '09:00'.",
        },
        schedule_days: {
          type: "array",
          items: {
            type: "string",
            enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          },
          description:
            "Дні тижня для 'weekly'. Наприклад: ['mon', 'wed', 'fri']",
        },
        schedule_day: {
          type: "number",
          description: "День місяця для 'monthly' (1-31).",
        },
        schedule_hours: {
          type: "number",
          description: "Інтервал в годинах для 'interval'.",
        },
        recipients: {
          type: "string",
          enum: ["self", "all", "mechanics"],
          description:
            "Кому надіслати: 'self' = тільки мені, 'all' = всім, 'mechanics' = всім слюсарям. За замовчуванням 'self'.",
        },
        channel: {
          type: "string",
          enum: ["app", "telegram", "both"],
          description:
            "Канал доставки: 'app' = в додатку, 'telegram' = Telegram, 'both' = обидва. За замовчуванням 'app'.",
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          description:
            "Пріоритет: low/normal/high/urgent. За замовчуванням 'normal'.",
        },
        condition_query: {
          type: "string",
          description:
            "SQL SELECT-запит для 'conditional'. Якщо повертає рядки — нагадування спрацьовує. " +
            "Приклад: SELECT act_id, data->>'ПІБ' AS client, data->>'Слюсар' AS slusar FROM acts WHERE date_off IS NULL AND date_on < NOW() - INTERVAL '21 days'",
        },
      },
      required: ["title", "reminder_type"],
    },
  };
}

/** Виконує створення нагадування через Function Calling */
export async function executeCreateReminder(
  args: Record<string, any>,
): Promise<string> {
  try {
    const reminder: Partial<Reminder> = {
      title: args.title,
      description: args.description || null,
      reminder_type: args.reminder_type || "once",
      priority: (args.priority || "normal") as any,
      channel: (args.channel || "app") as any,
      recipients: (args.recipients || "self") as any,
    };

    // Одноразове
    if (args.reminder_type === "once" && args.trigger_at) {
      reminder.trigger_at = args.trigger_at;
    }

    // Повторюване
    if (args.reminder_type === "recurring") {
      const schedule: any = {
        type: args.schedule_type || "daily",
      };
      if (args.schedule_time) schedule.time = args.schedule_time;
      else schedule.time = "09:00";

      if (args.schedule_type === "weekly" && args.schedule_days) {
        schedule.days = args.schedule_days;
      }
      if (args.schedule_type === "monthly" && args.schedule_day) {
        schedule.day = args.schedule_day;
      }
      if (args.schedule_type === "interval" && args.schedule_hours) {
        schedule.hours = args.schedule_hours;
      }
      reminder.schedule = schedule;
    }

    // Умовне
    if (args.reminder_type === "conditional" && args.condition_query) {
      reminder.condition_query = args.condition_query;
    }

    const ok = await createReminder(reminder);

    if (ok) {
      return JSON.stringify({
        success: true,
        message: `✅ Нагадування "${args.title}" створено!`,
        reminder_type: args.reminder_type,
        trigger_at: args.trigger_at || null,
        schedule: reminder.schedule || null,
        recipients: args.recipients || "self",
        channel: args.channel || "app",
        priority: args.priority || "normal",
      });
    } else {
      return JSON.stringify({
        success: false,
        error: "Помилка створення нагадування",
      });
    }
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: `Помилка: ${err.message}`,
    });
  }
}
