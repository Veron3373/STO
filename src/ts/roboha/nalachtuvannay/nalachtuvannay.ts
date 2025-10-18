import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
import { resetPercentCache } from "../zakaz_naraudy/inhi/kastomna_tabluca";

const SETTINGS = {
  1: { id: "toggle-shop", label: "ПІБ _ Магазин", class: "_shop" },
  2: { id: "toggle-receiver", label: "Каталог", class: "_receiver" },
  4: { id: "percentage-value", label: "Відсоток", class: "_percentage" },
};

const ROLES = [
  "Адміністратор",
  "Приймальник",
  "Слюсар",
  "Запчастист",
  "Складовщик",
];

const ROLE_COLORS = {
  Адміністратор: {
    button: "linear-gradient(135deg, #4caf50 0%, #45a049 100%)",
    buttonHover: "linear-gradient(135deg, #45a049 0%, #3d8b40 100%)",
    border: "#4caf50",
    "modal-window": "#4caf50",
  },
  Приймальник: {
    button: "linear-gradient(135deg, #2196F3 0%, #1976D2 100%)",
    buttonHover: "linear-gradient(135deg, #1976D2 0%, #1565C0 100%)",
    border: "#2196F3",
    "modal-window": "#2196F3",
  },
  Слюсар: {
    button: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
    buttonHover: "linear-gradient(135deg, #F57C00 0%, #E65100 100%)",
    border: "#FF9800",
    "modal-window": "#FF9800",
  },
  Запчастист: {
    button: "linear-gradient(135deg, #9C27B0 0%, #7B1FA2 100%)",
    buttonHover: "linear-gradient(135deg, #7B1FA2 0%, #6A1B9A 100%)",
    border: "#9C27B0",
    "modal-window": "#9C27B0",
  },
  Складовщик: {
    button: "linear-gradient(135deg, #F44336 0%, #D32F2F 100%)",
    buttonHover: "linear-gradient(135deg, #D32F2F 0%, #C62828 100%)",
    border: "#F44336",
    "modal-window": "#F44336",
  },
};

const ROLE_SETTINGS = {
  Приймальник: [
    { id: 1, label: "Налаштування" },
    { divider: true },
    { id: 2, label: "Додати" },
    { id: 3, label: "Додати Співробітники" },
    { divider: true },
    { id: 4, label: "Бухгалтерія" },
    { id: 5, label: "Бухгалтерія 👥 Співробітники" },
    { id: 6, label: "Бухгалтерія 👥 Співробітники розраховувати💲" },
    { id: 7, label: "Бухгалтерія 👥 Співробітники відміна розраховувати 💰" },
    { id: 8, label: "Бухгалтерія 🏪 Магазин" },
    { id: 9, label: "Бухгалтерія 🏪 Магазин розраховувати💲" },
    { id: 10, label: "Бухгалтерія 🏪 Магазин відміна розраховувати 💰" },
    { id: 11, label: "Бухгалтерія 🏪 Магазин ↩️ повертати в магазин ⬅️🚚" },
    {
      id: 12,
      label: "Бухгалтерія 🏪 Магазин ↩️ відміна повернення в магазин 🚚➡️",
    },
    { id: 13, label: "Бухгалтерія 📊 По Актам" },
    { divider: true },
    { id: 14, label: "📋 Акт Ціна та Сумма" },
    { id: 15, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 16, label: "📋 Акт Відкриття акту 🔒" },
  ],
  Слюсар: [
    { id: 1, label: "📋 Акт Ціна та Сумма" },
    { id: 2, label: "📋 Акт Закрити акт 🗝️" },
    { id: 3, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 4, label: "📋 Акт Відкриття акту 🔒" },
  ],
  Запчастист: [
    { id: 1, label: "Додати" },
    { divider: true },
    { id: 2, label: "Бухгалтерія" },
    { id: 3, label: "Бухгалтерія 👥 Співробітники" },
    { id: 4, label: "Бухгалтерія 👥 Співробітники розраховувати💲" },
    { id: 5, label: "Бухгалтерія 👥 Співробітники відміна розраховувати 💰" },
    { id: 6, label: "Бухгалтерія 🏪 Магазин" },
    { id: 7, label: "Бухгалтерія 🏪 Магазин розраховувати💲" },
    { id: 8, label: "Бухгалтерія 🏪 Магазин відміна розраховувати 💰" },
    { id: 9, label: "Бухгалтерія 🏪 Магазин ↩️ повертати в магазин ⬅️🚚" },
    {
      id: 10,
      label: "Бухгалтерія 🏪 Магазин відміна ↩️ повернення в магазин 🚚➡️",
    },
    { id: 11, label: "Бухгалтерія 📊 По Актам" },
    { divider: true },
    { id: 12, label: "Відображати всі Акти 📋" },
    { id: 13, label: "Відображати Акт 📋" },
    { divider: true },
    { id: 14, label: "📋 Акт Ціна та Сумма" },
    { id: 15, label: "📋 Акт Зариття акту 🗝️" },
    { id: 16, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 17, label: "📋 Акт Відкриття акту 🔒" },
    { id: 18, label: "📋 Акт ➕ Додати рядок" },
    { id: 19, label: "📋 Акт Видалити ⚙️ деталь або 🛠️ роботу" },
  ],
  Складовщик: [
    { id: 1, label: "Додати" },
    { id: 2, label: "Додати Співробітники" },
    { divider: true },
    { id: 3, label: "Бухгалтерія 🏪 Магазин" },
    { id: 4, label: "Бухгалтерія 🏪 Магазин розраховувати💲" },
    { id: 5, label: "Бухгалтерія 🏪 Магазин відміна розраховувати 💰" },
    { id: 6, label: "Бухгалтерія 🏪 Магазин ↩️ повертати в магазин ⬅️🚚" },
    {
      id: 7,
      label: "Бухгалтерія 🏪 Магазин ↩️ відміна повернення в магазин 🚚➡️",
    },
    { id: 8, label: "Бухгалтерія 📊 По Актам" },
    { divider: true },
    { id: 9, label: "Відображати всі Акти" },
    { id: 10, label: "Відображати Акт" },
    { divider: true },
    { id: 11, label: "📋 Акт Ціна та Сумма" },
    { id: 12, label: "📋 Акт Зариття акту 🗝️" },
    { id: 13, label: "📋 Акт Закриття акту із зауваженнями ⚠️" },
    { id: 14, label: "📋 Акт Відкриття акту 🔒🗝️" },
    { id: 15, label: "📋 Акт ➕ Додати рядок" },
    { id: 16, label: "📋 Акт Видалити ⚙️ деталь або 🛠️ роботу" },
  ],
};

const ROLE_TO_COLUMN = {
  Адміністратор: "data",
  Приймальник: "Приймальник",
  Слюсар: "Слюсар",
  Запчастист: "Запчастист",
  Складовщик: "Складовщик",
};

function createToggle(id: string, label: string, cls: string): string {
  return `
    <label class="toggle-switch ${cls}">
      <input type="checkbox" id="${id}" />
      <span class="slider"></span>
      <span class="label-text">${label}</span>
    </label>
  `;
}

function createRoleToggles(role: string): string {
  const settings = ROLE_SETTINGS[role as keyof typeof ROLE_SETTINGS];
  if (!settings) return "";
  return settings
    .map((s: any) => {
      if (s.divider) {
        return `<div class="settings-divider"></div>`;
      }
      return createToggle(`role-toggle-${s.id}`, s.label, `_role_${s.id}`);
    })
    .join("");
}

async function loadSettings(modal: HTMLElement): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("setting_id, data, procent")
      .in("setting_id", [1, 2, 4])
      .order("setting_id");

    if (error) throw error;

    Object.values(SETTINGS).forEach((s) => {
      const el = modal.querySelector(`#${s.id}`) as HTMLInputElement;
      if (el?.type === "checkbox") el.checked = false;
    });

    data?.forEach((row: any) => {
      const setting = SETTINGS[row.setting_id as keyof typeof SETTINGS];
      if (!setting) return;

      if (setting.id === "percentage-value") {
        const slider = modal.querySelector(
          "#percentage-slider"
        ) as HTMLInputElement;
        const input = modal.querySelector(
          "#percentage-input"
        ) as HTMLInputElement;
        const val = typeof row.procent === "number" ? row.procent : 0;
        if (slider) slider.value = String(val);
        if (input) input.value = String(val);
      } else {
        const checkbox = modal.querySelector(
          `#${setting.id}`
        ) as HTMLInputElement;
        if (checkbox) checkbox.checked = !!row.data;
      }
    });

    modal
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((cb) => {
        cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
      });
  } catch (err) {
    console.error(err);
    showNotification("Помилка завантаження налаштувань", "error", 2000);
  }
}

async function loadRoleSettings(
  modal: HTMLElement,
  role: string
): Promise<void> {
  const settings = ROLE_SETTINGS[role as keyof typeof ROLE_SETTINGS];
  const column = ROLE_TO_COLUMN[role as keyof typeof ROLE_TO_COLUMN];

  if (!settings || !column) return;

  try {
    // Фільтруємо тільки реальні налаштування (без divider)
    const settingIds = settings
      .filter((s: any) => !s.divider && s.id)
      .map((s: any) => s.id);

    const { data, error } = await supabase
      .from("settings")
      .select(`setting_id, "${column}"`)
      .in("setting_id", settingIds)
      .order("setting_id");

    if (error) throw error;

    settings.forEach((s: any) => {
      if (!s.divider && s.id) {
        const el = modal.querySelector(
          `#role-toggle-${s.id}`
        ) as HTMLInputElement;
        if (el?.type === "checkbox") el.checked = false;
      }
    });

    data?.forEach((row: any) => {
      const checkbox = modal.querySelector(
        `#role-toggle-${row.setting_id}`
      ) as HTMLInputElement;
      if (checkbox) checkbox.checked = !!row[column];
    });

    modal
      .querySelectorAll<HTMLInputElement>('[id^="role-toggle-"]')
      .forEach((cb) => {
        cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
      });
  } catch (err) {
    console.error(err);
    showNotification(
      `Помилка завантаження налаштувань для ролі ${role}`,
      "error",
      2000
    );
  }
}

async function saveSettings(modal: HTMLElement): Promise<boolean> {
  try {
    const roleButton = modal.querySelector(
      "#role-toggle-button"
    ) as HTMLButtonElement;
    const role = roleButton?.textContent || "Адміністратор";
    const column = ROLE_TO_COLUMN[role as keyof typeof ROLE_TO_COLUMN];

    if (role === "Адміністратор") {
      // Зберегти основні чекбокси для Адміністратора - КОЖЕН У СВОЮ КОМІРКУ
      const checkbox1 = modal.querySelector("#toggle-shop") as HTMLInputElement;
      const { error: error1 } = await supabase
        .from("settings")
        .update({ [column]: checkbox1?.checked ?? false })
        .eq("setting_id", 1);
      if (error1) throw error1;

      const checkbox2 = modal.querySelector(
        "#toggle-receiver"
      ) as HTMLInputElement;
      const { error: error2 } = await supabase
        .from("settings")
        .update({ [column]: checkbox2?.checked ?? false })
        .eq("setting_id", 2);
      if (error2) throw error2;

      // Зберегти відсоток для Адміністратора - У СВОЮ КОМІРКУ
      const input = modal.querySelector(
        "#percentage-input"
      ) as HTMLInputElement;
      const raw = Number(input?.value ?? 0);
      const value = Math.min(
        100,
        Math.max(0, Math.floor(isFinite(raw) ? raw : 0))
      );

      const { error: error4 } = await supabase
        .from("settings")
        .update({ procent: value })
        .eq("setting_id", 4);
      if (error4) throw error4;
    } else {
      // Зберегти налаштування для інших ролей - КОЖЕН TOGGLE У СВОЮ КОМІРКУ
      const settings = ROLE_SETTINGS[role as keyof typeof ROLE_SETTINGS];
      if (settings) {
        // Фільтруємо тільки реальні налаштування (без divider)
        const realSettings = settings.filter((s: any) => !s.divider && s.id);

        const updates = await Promise.all(
          realSettings.map(async (setting: any) => {
            const checkbox = modal.querySelector(
              `#role-toggle-${setting.id}`
            ) as HTMLInputElement;
            const value = checkbox?.checked ?? false;

            const { error } = await supabase
              .from("settings")
              .update({ [column]: value })
              .eq("setting_id", setting.id);

            if (error) {
              console.error(
                `Помилка при збереженні setting_id ${setting.id}:`,
                error
              );
              throw error;
            }

            return { setting_id: setting.id, [column]: value };
          })
        );

        console.log("Збережено налаштування:", updates);
      }
    }

    resetPercentCache();
    showNotification("Налаштування збережено!", "success", 1500);
    return true;
  } catch (err) {
    console.error("Save error details:", err);
    showNotification("Помилка збереження", "error", 1500);
    return false;
  }
}

function updateRoleTogglesVisibility(modal: HTMLElement, role: string): void {
  const container = modal.querySelector("#role-toggles-container");
  const mainToggles = modal.querySelector("#main-toggles-container");
  const percentageControl = modal.querySelector(".percentage-control");
  const modalWindow = modal.querySelector(".modal-window") as HTMLElement;
  const roleButton = modal.querySelector("#role-toggle-button") as HTMLElement;

  if (!container) return;

  const colors = ROLE_COLORS[role as keyof typeof ROLE_COLORS];
  if (colors && modalWindow) {
    modalWindow.style.border = `2px solid ${colors["modal-window"]}`;
  }
  if (colors && roleButton) {
    roleButton.style.background = colors.button;
    roleButton.onmouseenter = () => {
      roleButton.style.background = colors.buttonHover;
    };
    roleButton.onmouseleave = () => {
      roleButton.style.background = colors.button;
    };
  }

  if (role === "Адміністратор") {
    container.innerHTML = "";
    if (mainToggles) (mainToggles as HTMLElement).style.display = "";
    if (percentageControl)
      (percentageControl as HTMLElement).style.display = "";
    loadSettings(modal);
  } else {
    if (mainToggles) (mainToggles as HTMLElement).style.display = "none";
    if (percentageControl)
      (percentageControl as HTMLElement).style.display = "none";

    const togglesHTML = createRoleToggles(role);
    container.innerHTML = togglesHTML;

    container
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((cb) => {
        cb.addEventListener("change", () => {
          cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
        });
      });

    loadRoleSettings(modal, role);
  }
}

export async function createSettingsModal(): Promise<void> {
  if (document.getElementById("modal-settings")) return;

  const modal = document.createElement("div");
  modal.id = "modal-settings";
  modal.className = "modal-settings hidden";

  const toggles = Object.values(SETTINGS)
    .filter((s) => s.id !== "percentage-value")
    .map((s) => createToggle(s.id, s.label, s.class))
    .join("");

  const initialRole = ROLES[0];
  const colors = ROLE_COLORS[initialRole as keyof typeof ROLE_COLORS];

  modal.innerHTML = `
    <div class="modal-window" style="background-color: #ffffff; border: 2px solid ${colors["modal-window"]}">
      <button id="role-toggle-button" type="button" class="role-toggle-button" style="background: ${colors.button}">
        ${initialRole}
      </button>

      <div id="role-toggles-container"></div>
      
      <div id="main-toggles-container">
        ${toggles}
      </div>
      
      <div class="percentage-control">
        <label class="percentage-label">
          <span class="percentage-title">Відсоток</span>
          <div class="percentage-input-wrapper">
            <input type="range" id="percentage-slider" min="0" max="100" value="0" step="1" />
            <div class="percentage-value-display">
              <input type="number" id="percentage-input" min="0" max="100" value="0" />
              <span class="percent-sign">%</span>
            </div>
          </div>
        </label>
      </div>

      <div class="modal-actions">
        <button id="modal-cancel-button" type="button">Вийти</button>
        <button id="modal-ok-button" type="button">ОК</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const roleButton = modal.querySelector(
    "#role-toggle-button"
  ) as HTMLButtonElement;
  let currentRoleIndex = 0;

  if (roleButton) {
    roleButton.addEventListener("click", () => {
      currentRoleIndex = (currentRoleIndex + 1) % ROLES.length;
      const newRole = ROLES[currentRoleIndex];
      roleButton.textContent = newRole;
      updateRoleTogglesVisibility(modal, newRole);
    });
  }

  const slider = modal.querySelector("#percentage-slider") as HTMLInputElement;
  const input = modal.querySelector("#percentage-input") as HTMLInputElement;

  const updateInputFromSlider = () => {
    if (input && slider) {
      input.value = slider.value;
    }
  };

  if (slider) {
    slider.addEventListener("input", updateInputFromSlider);
  }

  if (input) {
    input.addEventListener("input", () => {
      if (slider) {
        const numValue = parseInt(input.value) || 0;
        if (numValue >= 0 && numValue <= 100) {
          slider.value = String(numValue);
          updateInputFromSlider();
        } else {
          input.value = slider.value;
        }
      }
    });
  }

  modal
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((cb) => {
      cb.addEventListener("change", () => {
        cb.closest(".toggle-switch")?.classList.toggle("active", cb.checked);
      });
    });

  await loadSettings(modal);

  modal
    .querySelector("#modal-ok-button")
    ?.addEventListener("click", async () => {
      if (await saveSettings(modal)) {
        // modal.classList.add("hidden");
      }
    });

  modal.querySelector("#modal-cancel-button")?.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

export async function openSettingsModal(): Promise<void> {
  const modal = document.getElementById("modal-settings");
  if (modal) {
    const roleButton = modal.querySelector(
      "#role-toggle-button"
    ) as HTMLButtonElement;
    const role = roleButton?.textContent?.trim() || ROLES[0];
    updateRoleTogglesVisibility(modal, role);
    modal.classList.remove("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector('[data-action="openSettings"]');
  btn?.addEventListener("click", async (e: Event) => {
    e.preventDefault();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      alert("⛔ Доступ заблоковано, Ви не авторизовані");
      return;
    }
    if (!document.getElementById("modal-settings")) {
      await createSettingsModal();
    }
    await openSettingsModal();
  });
});
