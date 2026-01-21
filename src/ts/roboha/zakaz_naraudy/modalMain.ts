// src\ts\roboha\zakaz_naraudy\modalMain.ts
import { cacheHiddenColumnsData } from "./inhi/zberechennya_zmin_y_danux_aktu";
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "./inhi/vspluvauhe_povidomlenna";
import {
  refreshPhotoData,
  safeParseJSON,
} from "./inhi/ctvorennia_papku_googleDrive.";
import { initPhoneClickHandler } from "./inhi/telefonna_pidskazka";
import {
  setupAutocompleteForEditableCells,
  refreshQtyWarningsIn,
  initializeActWarnings,
} from "./inhi/kastomna_tabluca";
import {
  createViknoPidtverdchennayZakruttiaAkty,
  viknoPidtverdchennayZakruttiaAktyId,
} from "./inhi/vikno_pidtverdchennay_zakruttia_akty";
import {
  createViknoVvodyParolu,
  viknoVvodyParoluId,
} from "./inhi/vikno_vvody_parolu";
import { printModalToPdf } from "./inhi/ctvorenyaPDF";
import {
  globalCache,
  loadGlobalData,
  ZAKAZ_NARAYD_MODAL_ID,
  ZAKAZ_NARAYD_BODY_ID,
  EDITABLE_PROBIG_ID,
  EDITABLE_REASON_ID,
  ACT_ITEMS_TABLE_CONTAINER_ID,
  formatNumberWithSpaces,
  EDITABLE_RECOMMENDATIONS_ID,
} from "./globalCache";
import {
  createModal,
  calculateRowSum,
  addNewRow,
  generateTableHTML,
  createTableRow,
  updateCalculatedSumsInFooter,
  updateAllSlyusarSumsFromHistory,
  getSlyusarWorkPercent,
  calculateSlyusarSum,
  getRecordIdFromHistory, // ✅ Додано для завантаження recordId з історії
  forceRecalculateSlyusarSalary, // ✅ Додано для примусового перерахунку при зміні слюсаря
} from "./modalUI";
import { showModalAllOtherBases } from "../dodatu_inchi_bazu/dodatu_inchi_bazu_danux";
import { formatDate, formatDateTime } from "./inhi/formatuvannya_datu";
import { addSaveHandler } from "./inhi/zberechennya_zmin_y_danux_aktu";
import {
  userAccessLevel,
  userName as currentUserName,
  canUserOpenActs,
  canUserSeeZarplataColumn,
  canUserSeePriceColumns,
  canUserAddRowToAct,
} from "../tablucya/users";

import {
  createModalActRaxunok,
  initModalActRaxunokHandlers,
  initCreateActRaxunokButton,
  MODAL_ACT_RAXUNOK_ID,
} from "./inhi/faktura"; // <--- НОВИЙ ФАЙЛ

import { checkAndHighlightChanges } from "./inhi/act_changes_highlighter";
import { removeNotificationsForAct } from "../tablucya/povidomlennya_tablucya";
import { handleSmsButtonClick } from "../sms/sendActSMS";
import { refreshActsTable } from "../tablucya/tablucya";

function initDeleteRowHandler(): void {
  const body = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  if (!body) return;

  body.addEventListener("click", (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    if (
      target.classList.contains("delete-row-btn") ||
      target.textContent === "🗑️"
    ) {
      e.preventDefault();
      e.stopPropagation();

      if (globalCache.isActClosed) {
        showNotification(
          "Неможливо видалити рядок у закритому акті",
          "warning",
          1000
        );
        return;
      }

      const row = target.closest("tr");
      if (row) {
        row.remove();

        const tableBody = document.querySelector(
          `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody`
        );
        if (tableBody) {
          const rows = Array.from(tableBody.querySelectorAll("tr"));
          rows.forEach((r, idx) => {
            const indexCell = r.querySelector(".row-index");
            if (indexCell) {
              const nameCell = r.querySelector(
                '[data-name="name"]'
              ) as HTMLElement;
              const type = nameCell?.getAttribute("data-type");
              let icon = "";
              if (type === "works") icon = "🛠️";
              else if (type === "details") icon = "⚙️";

              indexCell.textContent = `${icon} ${idx + 1}`.trim();
            }
          });
        }

        updateCalculatedSumsInFooter();
        showNotification("Рядок видалено", "success", 1000);
      }
    }
  });
}



const handleIndexIconClick = async (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  const indexCell = target.closest(".row-index") as HTMLElement;

  if (indexCell) {
    const row = indexCell.closest("tr") as HTMLTableRowElement;
    if (!row) return;

    const nameCell = row.querySelector('[data-name="name"]');
    const catalogCell = row.querySelector(".catalog-cell");

    if (!nameCell || !catalogCell) return;

    const workName = nameCell.textContent?.trim() || "";
    const catalogValue = catalogCell.textContent?.trim() || "";
    const type = nameCell.getAttribute("data-type");

    // Логіка працює тільки якщо каталог пустий (немає в базі)
    if (catalogValue !== "") return;

    // Функція запуску логіки "Запчастина" (відкриття модалки складу)
    const runPartLogic = () => {
      // Змінюємо тип рядка на деталі, якщо він ще не такий
      if (type !== "details") {
        nameCell.setAttribute("data-type", "details");
        // Оновлюємо іконку
        if (indexCell.firstChild) {
          indexCell.innerHTML = indexCell.innerHTML.replace("🛠️", "⚙️");
        }
      }

      showModalAllOtherBases();

      // Чекаємо поки відкриється модалка і заповнюємо дані
      setTimeout(() => {
        // 1. Натискаємо кнопку "Склад"
        const buttons = document.querySelectorAll(
          ".toggle-button-all_other_bases"
        );
        buttons.forEach((btn) => {
          if (btn.textContent?.includes("Склад")) {
            (btn as HTMLElement).click();
          }
        });

        // 2. Заповнюємо інпути
        const scladDetailInput = document.getElementById(
          "sclad_detail"
        ) as HTMLInputElement;
        const scladDateInput = document.getElementById(
          "sclad_date"
        ) as HTMLInputElement;

        if (scladDetailInput) {
          scladDetailInput.value = workName;
          scladDetailInput.dispatchEvent(new Event("input"));
        }
        if (scladDateInput) {
          const today = new Date().toISOString().split("T")[0];
          scladDateInput.value = today;
          scladDateInput.dispatchEvent(new Event("input"));
        }
      }, 300);

      // Слухаємо подію оновлення бази (коли юзер збереже деталь)
      const onDataUpdated = async () => {
        try {
          const { data: details } = await supabase
            .from("details")
            .select("detail_id, data")
            .order("detail_id", { ascending: false })
            .limit(5);

          if (details) {
            const match = details.find((d) => d.data === workName);
            if (match) {
              if (catalogCell) {
                catalogCell.textContent = String(match.detail_id);
                catalogCell.dispatchEvent(new Event("input", { bubbles: true }));
                showNotification("Catalog оновлено автоматично!", "success");
              }
            }
          }
        } catch (err) {
          console.error("Error auto-updating catalog:", err);
        }
        document.removeEventListener("other-base-data-updated", onDataUpdated);
      };
      document.addEventListener("other-base-data-updated", onDataUpdated);
    };

    // Функція запуску логіки "Робота" (збереження в works)
    const runWorkLogic = async () => {
      try {
        // Змінюємо тип рядка на works, якщо він ще не такий
        if (type !== "works") {
          nameCell.setAttribute("data-type", "works");
          if (indexCell.firstChild) {
            indexCell.innerHTML = indexCell.innerHTML.replace("⚙️", "🛠️");
          }
        }

        // ✅ ВИПРАВЛЕНО: Перевіряємо чи така робота вже існує в БД
        const { data: existingWork, error: searchError } = await supabase
          .from("works")
          .select("work_id")
          .eq("data", workName)
          .limit(1)
          .maybeSingle();

        if (searchError) {
          console.error("Помилка пошуку роботи:", searchError);
        }

        // Якщо робота вже існує - використовуємо її work_id
        if (existingWork && existingWork.work_id) {
          catalogCell.textContent = String(existingWork.work_id);
          catalogCell.dispatchEvent(new Event("input", { bubbles: true }));
          if (indexCell) indexCell.style.cursor = "";
          showNotification(`Робота вже існує в базі (ID: ${existingWork.work_id})`, "info");
          return;
        }

        // Отримуємо наступний ID
        const { data: maxIdData, error: idError } = await supabase
          .from("works")
          .select("work_id")
          .order("work_id", { ascending: false })
          .limit(1)
          .single();

        let nextId = 1;
        if (!idError && maxIdData) {
          nextId = Number(maxIdData.work_id) + 1;
        }

        const { data, error } = await supabase
          .from("works")
          .insert({ work_id: nextId, data: workName })
          .select("work_id")
          .single();

        if (error) throw error;

        if (data && data.work_id) {
          catalogCell.textContent = String(data.work_id);
          catalogCell.dispatchEvent(new Event("input", { bubbles: true }));
          if (indexCell) indexCell.style.cursor = "";
        }

        showNotification("Роботу успішно збережено в базу даних!", "success");
      } catch (err: any) {
        console.error("Error saving work:", err);
        showNotification(
          "Помилка при збереженні роботи: " + err.message,
          "error"
        );
      }
    };
    if (indexCell.textContent?.includes("🛠️")) {
      e.preventDefault();
      e.stopPropagation();

      const role = userAccessLevel;

      if (role === "Слюсар") {
        // Слюсарю завжди дозволено тільки Роботу, без модалки
        runWorkLogic();
        return;
      }

      let allowed = false;

      if (role === "Адміністратор") {
        allowed = true;
      } else if (role === "Приймальник") {
        // setting_id = 2, col = "Приймальник"
        allowed = await getRoleSettingBool(2, "Приймальник");
      } else if (role === "Запчастист") {
        // setting_id = 1, col = "Запчастист"
        allowed = await getRoleSettingBool(1, "Запчастист");
      } else if (role === "Складовщик") {
        // setting_id = 1, col = "Складовщик"
        allowed = await getRoleSettingBool(1, "Складовщик");
      } else {
        // Інші ролі за замовчуванням
        allowed = false;
      }

      if (allowed) {
        createChoiceModal(
          () => runWorkLogic(), // On Work
          () => runPartLogic(), // On Part
          () => { } // On Cancel
        );
      } else {
        // showNotification("Функція недоступна", "warning"); // Опціонально можна розкоментувати
      }
    }
    // ⚙️ ДЛЯ ДЕТАЛЕЙ при кліку на ⚙️ -> Пряма дія
    else if (indexCell.textContent?.includes("⚙️")) {
      e.preventDefault();
      e.stopPropagation();
      runPartLogic();
    }
  }
};

function initIndexIconHandler(): void {
  const body = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  if (!body) return;

  // Видаляємо попередній слухач, щоб уникнути дублювання
  body.removeEventListener("click", handleIndexIconClick);
  // Додаємо новий
  body.addEventListener("click", handleIndexIconClick);
}

function createChoiceModal(
  onWork: () => void,
  onPart: () => void,
  onCancel: () => void
): void {
  const styleId = "choice-modal-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .custom-choice-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        font-family: 'Roboto', sans-serif;
      }
      .custom-choice-modal {
        background: #fff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        text-align: center;
        max-width: 400px;
        width: 90%;
        color: #333;
      }
      .custom-choice-title {
        font-size: 18px;
        margin-bottom: 20px;
        font-weight: 500;
        color: #333;
      }
      .custom-choice-buttons {
        display: flex;
        gap: 15px;
        justify-content: center;
      }
      .custom-btn {
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.2s;
      }
      .btn-part {
        background: #2196F3;
        color: white;
      }
      .btn-part:hover {
        background: #1976D2;
      }
      .btn-work {
        background: #FF9800;
        color: white;
      }
      .btn-work:hover {
        background: #F57C00;
      }
      .btn-cancel-x {
        position: absolute;
        top: 10px;
        right: 15px;
        background: transparent;
        border: none;
        font-size: 20px;
        color: #999;
        cursor: pointer;
      }
      .btn-cancel-x:hover {
        color: #333;
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.className = "custom-choice-overlay";

  const modal = document.createElement("div");
  modal.className = "custom-choice-modal";
  modal.style.position = "relative";

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-cancel-x";
  closeBtn.innerHTML = "&times;";
  closeBtn.onclick = () => {
    document.body.removeChild(overlay);
    onCancel();
  };
  modal.appendChild(closeBtn);

  const title = document.createElement("h3");
  title.textContent = "Записати дані в базу даних?";
  title.className = "custom-choice-title";
  modal.appendChild(title);

  const buttonsDiv = document.createElement("div");
  buttonsDiv.className = "custom-choice-buttons";

  const btnPart = document.createElement("button");
  btnPart.className = "custom-btn btn-part";
  btnPart.innerHTML = "⚙️ Запчастини";
  btnPart.onclick = () => {
    document.body.removeChild(overlay);
    onPart();
  };

  const btnWork = document.createElement("button");
  btnWork.className = "custom-btn btn-work";
  btnWork.innerHTML = "🛠️ Робота";
  btnWork.onclick = () => {
    document.body.removeChild(overlay);
    onWork();
  };

  buttonsDiv.appendChild(btnPart);
  buttonsDiv.appendChild(btnWork);
  modal.appendChild(buttonsDiv);
  overlay.appendChild(modal);

  // Close on outside click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
      onCancel();
    }
  });

  document.body.appendChild(overlay);
}

/**
 * Допоміжна функція: читає boolean-настройку з таблиці settings
 * для конкретного рядка (setting_id) та колонки (назви ролі).
 * Якщо щось пішло не так — ПОВЕРТАЄ true (нічого не ховаємо).
 */
async function getRoleSettingBool(
  settingId: number,
  columnName: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select(columnName)
      .eq("setting_id", settingId)
      .maybeSingle();

    if (error) {
      console.error(
        `Помилка читання settings (setting_id=${settingId}, col=${columnName}):`,
        error
      );
      return true;
    }

    if (!data) {
      console.warn(
        `settings: не знайдено рядок setting_id=${settingId} для колонки ${columnName}`
      );
      return true;
    }

    const safeData: Record<string, unknown> = (data ?? {}) as unknown as Record<
      string,
      unknown
    >;
    const value = safeData[columnName];

    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(v)) return true;
      if (["false", "0", "no", "n"].includes(v)) return false;
    }

    return true;
  } catch (e) {
    console.error(
      `Виняток при читанні settings (setting_id=${settingId}, col=${columnName}):`,
      e
    );
    return true;
  }
}

/**
 * Перевіряє, чи потрібно показувати кнопку замка (закриття акту)
 * по ролі та налаштуванням таблиці settings.
 *
 * Мапа:
 *  - Слюсар      → settings.setting_id = 3,  колонка "Слюсар"
 *  - Запчастист  → settings.setting_id = 16, колонка "Запчастист"
 *  - Складовщик  → settings.setting_id = 13, колонка "Складовщик"
 *
 *  - Адміністратор → завжди TRUE
 *  - Приймальник та інші ролі → TRUE (поки що без обмежень)
 */
async function canUserSeeLockButton(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) return true;

  if (role === "Адміністратор") return true;

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Слюсар":
      settingId = 3;
      columnName = "Слюсар";
      break;

    case "Запчастист":
      settingId = 16;
      columnName = "Запчастист";
      break;

    case "Складовщик":
      settingId = 13;
      columnName = "Складовщик";
      break;

    default:
      return true;
  }

  if (!settingId || !columnName) return true;

  return await getRoleSettingBool(settingId, columnName);
}

/**
 * Чи можна показувати кнопку "Акт Рахунок? 🗂️"
 *
 * Мапа:
 *  - Приймальник → settings.setting_id = 18, колонка "Приймальник"
 *  - Запчастист  → settings.setting_id = 19, колонка "Запчастист"
 *  - Складовщик  → settings.setting_id = 16, колонка "Складовщик"
 *
 *  - Адміністратор → завжди TRUE
 *  - Слюсар та інші → TRUE (але Слюсар все одно обрізається по isRestricted)
 */
async function canUserSeeCreateActButton(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) return true;
  if (role === "Адміністратор") return true;

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 18;
      columnName = "Приймальник";
      break;

    case "Запчастист":
      settingId = 19;
      columnName = "Запчастист";
      break;

    case "Складовщик":
      settingId = 16;
      columnName = "Складовщик";
      break;

    default:
      return true;
  }

  if (!settingId || !columnName) return true;
  return await getRoleSettingBool(settingId, columnName);
}

/**
 * Чи можна показувати кнопку "Друк акту 🖨️"
 *
 * Мапа:
 *  - Приймальник → settings.setting_id = 19, колонка "Приймальник"
 *  - Запчастист  → settings.setting_id = 20, колонка "Запчастист"
 *  - Складовщик  → settings.setting_id = 17, колонка "Складовщик"
 */
async function canUserSeePrintActButton(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) return true;
  if (role === "Адміністратор") return true;

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 19;
      columnName = "Приймальник";
      break;

    case "Запчастист":
      settingId = 20;
      columnName = "Запчастист";
      break;

    case "Складовщик":
      settingId = 17;
      columnName = "Складовщик";
      break;

    default:
      return true;
  }

  if (!settingId || !columnName) return true;
  return await getRoleSettingBool(settingId, columnName);
}

/**
 * Чи можна показувати кнопку SMS ✉️ в акті
 *
 * Мапа:
 *  - Слюсар        → завжди FALSE (приховано)
 *  - Адміністратор → settings.setting_id = 5, колонка "data"
 *  - Приймальник   → settings.setting_id = 20, колонка "Приймальник"
 *  - Запчастист    → settings.setting_id = 21, колонка "Запчастист"
 *  - Складовщик    → settings.setting_id = 18, колонка "Складовщик"
 */
async function canUserSeeSmsButton(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) return true;

  // ✅ Слюсар завжди не бачить SMS
  if (role === "Слюсар") return false;

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Адміністратор":
      settingId = 5;
      columnName = "data";
      break;

    case "Приймальник":
      settingId = 20;
      columnName = "Приймальник";
      break;

    case "Запчастист":
      settingId = 21;
      columnName = "Запчастист";
      break;

    case "Складовщик":
      settingId = 18;
      columnName = "Складовщик";
      break;

    default:
      return true;
  }

  if (!settingId || !columnName) return true;
  return await getRoleSettingBool(settingId, columnName);
}

export async function showModal(actId: number): Promise<void> {
  const canOpen = await canUserOpenActs();

  if (!canOpen) {
    console.warn(`⚠️ Користувач не має доступу до відкриття акту ${actId}`);
    showNoAccessNotification();
    return;
  }

  createModal();
  const modal = document.getElementById(ZAKAZ_NARAYD_MODAL_ID);
  const body = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  if (!modal || !body) {
    console.error("❌ Модальне вікно або його тіло не знайдені.");
    return;
  }
  modal.setAttribute("data-act-id", actId.toString());
  showNotification("Завантаження даних акту...", "info", 2000);
  modal.classList.remove("hidden");
  body.innerHTML = "";

  try {
    // ✅ ВИПРАВЛЕННЯ: Перезавантажуємо дані слюсарів перед відкриттям акту
    // щоб зарплата завжди була актуальною
    console.log("🔄 Оновлення даних слюсарів перед відкриттям акту...");
    await loadGlobalData();

    // 🔽 Доступ до колонки "Зар-та" по ролі (по settings)
    if (userAccessLevel && userAccessLevel !== "Адміністратор") {
      const canSeeZarplata = await canUserSeeZarplataColumn();
      globalCache.settings.showZarplata = canSeeZarplata;
    }
    // Для Адміністратора залишаємо як прийшло з loadGlobalData()

    await createRequiredModals();

    const { data: act, error: actError } = await supabase
      .from("acts")
      .select("*")
      .eq("act_id", actId)
      .single();

    if (actError || !act) {
      handleLoadError(actError);
      return;
    }

    globalCache.currentActId = actId;
    globalCache.isActClosed = !!act.date_off;
    globalCache.currentActDateOn = act.date_on || null;

    // ✅ Зберігаємо приймальника в localStorage для використання при логуванні змін
    if (act.pruimalnyk) {
      localStorage.setItem("current_act_pruimalnyk", act.pruimalnyk);
      console.log(
        `✅ Збережено приймальника в localStorage: "${act.pruimalnyk}"`
      );
    } else {
      localStorage.removeItem("current_act_pruimalnyk");
      console.log(`ℹ️ Приймальник не вказано в акті ${actId}`);
    }

    const [clientData, carData] = await Promise.all([
      fetchClientData(act.client_id),
      fetchCarData(act.cars_id),
    ]);

    const actDetails = safeParseJSON(act.info || act.data || act.details) || {};

    cacheHiddenColumnsData(actDetails);
    globalCache.oldNumbers = new Map<number, number>();
    for (const d of actDetails?.["Деталі"] || []) {
      const id = Number(d?.sclad_id);
      const qty = Number(d?.["Кількість"] ?? 0);
      if (id) globalCache.oldNumbers.set(id, qty);
    }

    // 🔑 ВАЖЛИВО: визначаємо, чи показувати кнопки (за роллю + settings)
    const [
      canShowLockButton,
      canShowCreateActBtn,
      canShowPrintActBtn,
      canShowAddRowBtn,
      canShowSmsBtn,
    ] = await Promise.all([
      canUserSeeLockButton(),
      canUserSeeCreateActButton(),
      canUserSeePrintActButton(),
      canUserAddRowToAct(),
      canUserSeeSmsButton(),
    ]);

    renderModalContent(
      act,
      actDetails,
      clientData,
      carData,
      canShowLockButton,
      canShowCreateActBtn,
      canShowPrintActBtn,
      canShowAddRowBtn,
      canShowSmsBtn
    );

    // 🔽 ТУТ ВЖЕ Є ТАБЛИЦЯ В DOM — МОЖНА ХОВАТИ/ПОКАЗУВАТИ ЦІНА/СУМА
    const canSeePriceCols = await canUserSeePriceColumns();
    togglePriceColumnsVisibility(canSeePriceCols);

    // ✅ ВИПРАВЛЕНО: тепер чекаємо завершення встановлення зарплат з історії
    await updateAllSlyusarSumsFromHistory();

    // 🚀 Запускаємо операції паралельно для швидкості
    await Promise.all([
      fillMissingSlyusarSums(),
      addModalHandlers(actId, actDetails, clientData?.phone),
      refreshQtyWarningsIn(ACT_ITEMS_TABLE_CONTAINER_ID),
      refreshPhotoData(actId),
    ]);

    checkSlyusarSumWarningsOnLoad();
    applyAccessRestrictions();

    // 🔽 Підсвічування змін для Адміністратора та Приймальника (в фоні, не блокуємо)
    if (
      userAccessLevel === "Адміністратор" ||
      userAccessLevel === "Приймальник"
    ) {
      // Запускаємо без await щоб не блокувати відкриття акту
      checkAndHighlightChanges(actId).then(() => {
        removeNotificationsForAct(actId);
      }).catch(err => console.error("Помилка підсвічування:", err));
    }

    // 🔽 Перевірка прав на кнопку "Додати рядок" - тепер це робиться при рендері
    // await toggleAddRowButtonVisibility();

    // 📢 ПІДПИСКА НА ЗМІНИ slusarsOn В РЕАЛЬНОМУ ЧАСІ (ОНОВЛЕННЯ ЗАГОЛОВКА)
    setupSlusarsOnRealtimeSubscription(actId);

    showNotification("Дані успішно завантажено", "success", 1500);
  } catch (error) {
    console.error("💥 Критична помилка при завантаженні акту:", error);
    showNotification(`Критична помилка завантаження акту`, "error");
    if (body) {
      body.innerHTML = `<p class="error-message">❌ Критична помилка завантаження акту. Перегляньте консоль.</p>`;
    }
  }
}

async function fillMissingSlyusarSums(): Promise<void> {
  if (!globalCache.settings.showZarplata || userAccessLevel === "Слюсар")
    return;
  if (!globalCache.settings.showPibMagazin) return;
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return;

  const rows = Array.from(
    container.querySelectorAll<HTMLTableRowElement>("tbody tr")
  );

  for (const row of rows) {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const typeFromCell = nameCell?.getAttribute("data-type");

    if (typeFromCell !== "works") continue;

    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;

    if (slyusarSumCell.textContent?.trim()) continue;

    const pibCell = row.querySelector(
      '[data-name="pib_magazin"]'
    ) as HTMLElement;
    const slyusarName = pibCell?.textContent?.trim() || "";

    if (!slyusarName) continue;

    const percent = await getSlyusarWorkPercent(slyusarName);

    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const sum =
      parseFloat(sumCell?.textContent?.replace(/\s/g, "") || "0") || 0;

    if (sum <= 0) continue;

    const slyusarSum = calculateSlyusarSum(sum, percent);
    slyusarSumCell.textContent = formatNumberWithSpaces(slyusarSum);
  }
}

function checkSlyusarSumWarningsOnLoad(): void {
  // ✅ Слюсар не бачить колонку "Сума", тому не показуємо йому попередження про зарплату
  if (userAccessLevel === "Слюсар") return;

  if (!globalCache.settings.showZarplata) return;
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return;

  const rows = Array.from(
    container.querySelectorAll<HTMLTableRowElement>("tbody tr")
  );
  let hasWarnings = false;

  for (const row of rows) {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const typeFromCell = nameCell?.getAttribute("data-type");

    if (typeFromCell !== "works") continue;

    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;

    if (!sumCell || !slyusarSumCell) continue;

    const sum = parseFloat(sumCell.textContent?.replace(/\s/g, "") || "0") || 0;
    const slyusarSum =
      parseFloat(slyusarSumCell.textContent?.replace(/\s/g, "") || "0") || 0;

    if (slyusarSum > sum) {
      hasWarnings = true;
      slyusarSumCell.setAttribute("data-warnzp", "1");
      slyusarSumCell.classList.add("slyusar-sum-cell");
    }
  }

  if (hasWarnings) {
    showNotification(
      "⚠️ Увага: Знайдено помилки. Зарплата більша ніж сума роботи у деяких рядках",
      "warning",
      3000
    );
  }
}

function showNoAccessNotification(): void {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5722;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10001;
    font-size: 16px;
    animation: slideInOut 3s ease;
  `;
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 24px;">🔒</span>
      <span>У вас немає доступу до перегляду актів</span>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideInOut {
      0% { transform: translateX(100%); opacity: 0; }
      10% { transform: translateX(0); opacity: 1; }
      90% { transform: translateX(0); opacity: 1; }
      100% { transform: translateX(100%); opacity: 0; }
    }
  `;

  if (!document.getElementById("no-access-notification-style")) {
    style.id = "no-access-notification-style";
    document.head.appendChild(style);
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

async function applyAccessRestrictionsToNewRow(): Promise<void> {
  const table = document.querySelector(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} table`
  );
  if (!table) return;

  const lastRow = table.querySelector("tbody tr:last-child");
  if (!lastRow) return;

  // Перевіряємо чи користувач може бачити колонки ціни/суми
  const canSeePriceCols = await canUserSeePriceColumns();

  // Застосовуємо видимість до всіх колонок ціни/суми в останньому рядку
  const priceCells = lastRow.querySelectorAll<HTMLElement>(
    '[data-col="price"], [data-col="sum"]'
  );
  priceCells.forEach((cell) => {
    cell.style.display = canSeePriceCols ? "" : "none";
  });

  // Перевіряємо видимість колонки зарплати
  const slyusarSumCell = lastRow.querySelector(
    '[data-name="slyusar_sum"]'
  ) as HTMLElement;
  if (slyusarSumCell && !globalCache.settings.showZarplata) {
    slyusarSumCell.style.display = "none";
  }
}

/**
 * Обмеження доступу:
 *  - Слюсар: ховаємо друк, склад, забороняємо створення папки для фото.
 *  - Замок тепер НЕ ховаємо тут, а керуємось canUserSeeLockButton().
 */
function applyAccessRestrictions(): void {
  if (userAccessLevel === "Слюсар") {
    const printActButton = document.getElementById("print-act-button");
    if (printActButton) printActButton.classList.add("hidden");
    restrictPhotoAccess();
  }
}

function restrictPhotoAccess(): void {
  const photoCell = document.querySelector(
    "table.zakaz_narayd-table.left tr:nth-child(5) td:nth-child(2)"
  ) as HTMLTableCellElement | null;

  if (!photoCell) return;

  const existingHandler = (photoCell as any).__gd_click__;
  if (existingHandler) {
    photoCell.removeEventListener("click", existingHandler);
  }

  const restrictedClickHandler = async (e: MouseEvent) => {
    e.preventDefault();

    const modal = document.getElementById("zakaz_narayd-custom-modal");
    const actIdStr = modal?.getAttribute("data-act-id");
    if (!actIdStr) return;
    const actId = Number(actIdStr);

    try {
      // Фото тепер зберігається в окремій колонці photo_url
      const { data: act, error } = await supabase
        .from("acts")
        .select("photo_url, date_off")
        .eq("act_id", actId)
        .single();

      if (error || !act) {
        showNotification("Помилка отримання даних акту", "error");
        return;
      }

      const photoUrl = act.photo_url;
      const hasLink = !!photoUrl && photoUrl.length > 0;

      if (hasLink) {
        window.open(photoUrl, "_blank");
        return;
      }

      showNotification(
        "Створення папки заборонено для вашого рівня доступу",
        "warning"
      );
    } catch (err) {
      console.error("❌ Помилка при перевірці фото:", err);
      showNotification("Помилка при перевірці фото", "error");
    }
  };

  (photoCell as any).__gd_click__ = restrictedClickHandler;
  photoCell.addEventListener("click", restrictedClickHandler);
}

async function createRequiredModals(): Promise<void> {
  let elem = document.getElementById(viknoPidtverdchennayZakruttiaAktyId);
  if (elem) elem.remove();
  document.body.appendChild(createViknoPidtverdchennayZakruttiaAkty());

  elem = document.getElementById(viknoVvodyParoluId);
  if (elem) elem.remove();
  document.body.appendChild(createViknoVvodyParolu());

  elem = document.getElementById(MODAL_ACT_RAXUNOK_ID);
  if (elem) elem.remove();
  const actRaxunokModal = createModalActRaxunok();
  document.body.appendChild(actRaxunokModal);

  initModalActRaxunokHandlers();

  console.log("✅ Модальне вікно actRaxunok створено та ініціалізовано");
}

async function fetchClientData(clientId: number | null): Promise<any> {
  if (!clientId) return null;
  const { data: client } = await supabase
    .from("clients")
    .select("data")
    .eq("client_id", clientId)
    .single();
  return client?.data ? safeParseJSON(client.data) : null;
}

async function fetchCarData(carId: number | null): Promise<any> {
  if (!carId) return null;
  const { data: car } = await supabase
    .from("cars")
    .select("data")
    .eq("cars_id", carId)
    .single();
  return car?.data ? safeParseJSON(car.data) : null;
}

function handleLoadError(error: any): void {
  const body = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  showNotification(
    `Помилка завантаження акту: ${error?.message || "Перевірте підключення."}`,
    "error"
  );
  if (body) {
    body.innerHTML = `<p class="error-message">❌ Не вдалося завантажити акт. ${error?.message || "Перевірте підключення."
      }</p>`;
  }
}

function renderModalContent(
  act: any,
  actDetails: any,
  clientData: any,
  carData: any,
  canShowLockButton: boolean,
  canShowCreateActBtn: boolean,
  canShowPrintActBtn: boolean,
  canShowAddRowBtn: boolean,
  canShowSmsBtn: boolean
): void {
  const body = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  if (!body) return;
  const isClosed = globalCache.isActClosed;
  const isRestricted = userAccessLevel === "Слюсар";

  const showCatalog = globalCache.settings.showCatalog;
  const showPibMagazin = globalCache.settings.showPibMagazin;

  const clientInfo = {
    fio: clientData?.["ПІБ"] || clientData?.fio || "—",
    phone: clientData?.["Телефон"] || clientData?.phone || "—",
    note: clientData?.["Додаткові"] || "—",
  };
  const carInfo = {
    auto: carData?.["Авто"] || "",
    year: carData?.["Рік"] || "",
    nomer: carData?.["Номер авто"] || "",
    vin: carData?.["Vincode"] || "—",
    engine:
      [carData?.["КодДВЗ"], carData?.["Обʼєм"], carData?.["Пальне"]]
        .filter(Boolean)
        .join(" _ ") || "—",
  };
  const editableAttr = `contenteditable="${!isClosed}"`;
  const editableClass = isClosed ? "cursor-not-allowed" : "";
  const photoCellHtml = `<div id="photo-section-slot"></div>`;

  // ✅ Підготовка для підрахунку індексів робіт для кожного слюсаря
  const slyusarWorkIndexMap = new Map<string, number>();
  // ✅ Підготовка для підрахунку індексів деталей для кожного магазину
  const shopDetailIndexMap = new Map<string, number>();
  
  const allItems = [
    ...(actDetails?.["Деталі"] || []).map((item: any) => {
      const shopName = showPibMagazin ? item["Магазин"] || "" : "";
      const detailName = item["Деталь"] || "";
      
      // ✅ Визначаємо індекс деталі для цього магазину
      const shopKey = shopName.toLowerCase();
      const detailIndex = shopDetailIndexMap.get(shopKey) ?? 0;
      shopDetailIndexMap.set(shopKey, detailIndex + 1);
      
      // ✅ Беремо recordId з acts.data.Деталі (якщо є) або undefined
      const recordId = item["recordId"] || undefined;
      
      return {
        type: "detail",
        name: detailName,
        quantity: item["Кількість"] || 0,
        price: item["Ціна"] || 0,
        sum: item["Сума"] || 0,
        person_or_store: shopName,
        catalog: showCatalog ? item["Каталог"] || "" : "",
        sclad_id: showCatalog ? item["sclad_id"] || null : null,
        slyusar_id: null,
        recordId, // ✅ Додаємо recordId для деталей
      };
    }),
    ...(actDetails?.["Роботи"] || []).map((item: any) => {
      const slyusarName = showPibMagazin ? item["Слюсар"] || "" : "";
      const workName = item["Робота"] || "";
      
      // ✅ Визначаємо індекс роботи для цього слюсаря
      const slyusarKey = slyusarName.toLowerCase();
      const workIndex = slyusarWorkIndexMap.get(slyusarKey) ?? 0;
      slyusarWorkIndexMap.set(slyusarKey, workIndex + 1);
      
      // ✅ ПРІОРИТЕТ: беремо recordId з acts.data.Роботи (якщо є), інакше шукаємо в історії слюсаря
      const recordId = item["recordId"] || (slyusarName ? getRecordIdFromHistory(slyusarName, workName, act.act_id, workIndex) : undefined);
      
      return {
        type: "work",
        name: workName,
        quantity: item["Кількість"] || 0,
        price: item["Ціна"] || 0,
        sum: item["Сума"] || 0,
        person_or_store: slyusarName,
        catalog: showCatalog ? item["Каталог"] || "" : "",
        sclad_id: showCatalog ? null : null,
        slyusar_id: item["slyusar_id"] || null,
        recordId, // ✅ Додаємо recordId для точного пошуку при збереженні
      };
    }),
  ].filter((item) => item.name.trim() !== "");

  if (allItems.length === 0) {
    allItems.push({
      type: undefined,
      name: "",
      quantity: 0,
      price: 0,
      sum: 0,
      person_or_store: "",
      catalog: "",
      sclad_id: null,
      slyusar_id: null,
    });
  }

  globalCache.initialActItems = allItems;

  const showLockButton = canShowLockButton;

  // 💛 ПЕРЕВІРКА slusarsOn ДЛЯ ФАРБУВАННЯ ЗАГОЛОВКА (ТІЛЬКИ ДЛЯ ВІДКРИТИХ АКТІВ)
  const shouldShowSlusarsOn =
    act.slusarsOn === true &&
    !isClosed &&
    (userAccessLevel === "Адміністратор" ||
      userAccessLevel === "Слюсар" ||
      (userAccessLevel === "Приймальник" &&
        act.pruimalnyk === currentUserName));

  const headerClass = shouldShowSlusarsOn
    ? "zakaz_narayd-header zakaz_narayd-header-slusar-on"
    : "zakaz_narayd-header";

  // Генеруємо HTML кнопок для header
  const pruimalnykDisplay = act.pruimalnyk 
    ? `<span class="act-pruimalnyk-info">${act.pruimalnyk}</span>` 
    : "";

  const headerButtons = `
    <div class="zakaz_narayd-header-buttons">
      ${pruimalnykDisplay}
      ${showLockButton
      ? `<button class="status-lock-icon" id="status-lock-btn" data-act-id="${act.act_id}">
                   ${isClosed ? "🔒" : "🗝️"}
                   </button>`
      : ""
    }
      ${!isRestricted && canShowPrintActBtn
      ? `<button id="print-act-button" title="Друк акту" class="print-button">🖨️</button>`
      : ""
    }
      ${canShowSmsBtn
      ? (() => {
        let tooltip = "Немає SMS";
        const isSent = !!act.sms;
        if (isSent) {
          try {
            const dateString = String(act.sms).replace(" ", "T");
            const d = new Date(dateString);
            if (!isNaN(d.getTime())) {
              const { date, time } = formatDateTime(d);
              tooltip = `${time} / ${date}`;
            } else {
              tooltip = String(act.sms);
            }
          } catch {
            tooltip = String(act.sms);
          }
        }
        return !isSent
          ? `<button class="status-lock-icon" id="sms-btn" data-act-id="${act.act_id}" title="${tooltip}">✉️</button>`
          : `<button class="status-lock-icon" id="sms-btn" data-act-id="${act.act_id}" title="${tooltip}">📨</button>`;
      })()
      : ""
    }
      ${!isRestricted && canShowCreateActBtn
      ? `<button type="button" class="status-lock-icon" id="create-act-btn" title="Акт Рахунок?">🗂️</button>`
      : ""
    }
    </div>
  `;

  // Визначаємо стиль для header (не застосовуємо колір якщо slusarsOn активний - буде золотистий)
  const headerStyle = shouldShowSlusarsOn ? "" : `background-color: ${globalCache.generalSettings.headerColor};`;

  body.innerHTML = `
    <div class="${headerClass}" style="${headerStyle}">
      <div class="zakaz_narayd-header-info">
        <h1>${globalCache.generalSettings.stoName}</h1>
        <p>Адрес: ${globalCache.generalSettings.address}</p>
        <p>${globalCache.generalSettings.phone} тел</p>
      </div>
      ${headerButtons}
    </div>
    <div class="zakaz_narayd-table-container">
      <table class="zakaz_narayd-table left">
        ${createTableRow("Акт №", `<span id="act-number">${act.act_id}</span>`)}
        ${createTableRow("Клієнт", clientInfo.fio)}
        ${createTableRow(
    "Телефон",
    `<span style="color: blue;">${clientInfo.phone}</span>`
  )}
        ${createTableRow("Примітка:", clientInfo.note)}
        ${createTableRow("Фото", photoCellHtml)}
      </table>
      <table class="zakaz_narayd-table right">
        ${createTableRow(
    isClosed ? "Закритий" : "Відкритий",
    `${isClosed
      ? `<span class="red">${formatDate(act.date_off)}</span> | <span class="green">${formatDate(act.date_on)}</span>`
      : `<span class="green">${formatDate(act.date_on) || "-"}</span>`
    }`
  )}
        ${createTableRow(
    "Автомобіль",
    `${(carInfo.auto || "").trim()} ${(carInfo.year || "").trim()} ${(
      carInfo.nomer || ""
    ).trim()}`.trim() || "—"
  )}
        ${createTableRow("Vincode", carInfo.vin)}
        ${createTableRow("Двигун", carInfo.engine)}
        ${createTableRow(
    "Пробіг",
    `<span id="${EDITABLE_PROBIG_ID}" ${editableAttr} class="editable ${editableClass}">${formatNumberWithSpaces(
      actDetails?.["Пробіг"],
      0,
      0
    )}</span>`
  )}
      </table>
    </div>
    <div class="reason-container">
      <div class="zakaz_narayd-reason-line">
        <div class="reason-text">
          <strong>Причина звернення:</strong>
          <span id="${EDITABLE_REASON_ID}" class="highlight editable ${editableClass}" ${editableAttr} style="white-space: pre-wrap;">${actDetails?.["Причина звернення"] || "—"
    }</span>
        </div>
      </div>
      <div class="zakaz_narayd-reason-line">
        <div class="recommendations-text">
          <strong>Рекомендації:</strong>
          <span id="${EDITABLE_RECOMMENDATIONS_ID}" class="highlight editable ${editableClass}" ${editableAttr} style="white-space: pre-wrap;">${actDetails?.["Рекомендації"] || "—"
    }</span>
        </div>

      </div>
    </div>
    ${generateTableHTML(
      allItems,
      globalCache.settings.showPibMagazin,
      canShowAddRowBtn
    )}
    ${isClosed ? createClosedActClaimText() : ""}
  `;

  setTimeout(() => {
    const avansInput = document.getElementById(
      "editable-avans"
    ) as HTMLInputElement | null;
    const discountInput = document.getElementById(
      "editable-discount"
    ) as HTMLInputElement | null;
    const discountAmountInput = document.getElementById(
      "editable-discount-amount"
    ) as HTMLInputElement | null;

    if (avansInput) {
      const avansValue = Number(act?.avans ?? actDetails?.["Аванс"] ?? 0);
      avansInput.value = String(avansValue);
      avansInput.dispatchEvent(new Event("input"));
    }

    if (discountInput) {
      const discountValue = Number(
        act?.discount ?? actDetails?.["Знижка"] ?? 0
      );
      discountInput.value = String(discountValue);
      discountInput.dispatchEvent(new Event("input"));
    }

    if (discountAmountInput) {
      const discountAmountValue = Number(
        act?.discount_amount ?? actDetails?.["ПроцентЗнижки"] ?? 0
      );
      discountAmountInput.value = String(discountAmountValue);
      discountAmountInput.dispatchEvent(new Event("input"));
    }
  }, 60);
}

function createClosedActClaimText(): string {
  return `
    <div class="closed-act-info">
      <p><strong>Претензій до вартості замовлення, виконаних робіт, встановлених запчастин та використаних матеріалів не маю.</strong></p>
      <p><strong>Гарантійні зобов'язання</strong></p>
      <p>Виконавець гарантує відповідне відремонтованого ДТЗ (або його складових запчастин) вимогам технічної документації та нормативних документів виробника за умов виконання Замовником правил експлуатації ДТЗ. Гарантійний термін експлуатації на запасні частини встановлюється згідно з Законом України "Про захист прав споживачів". Гарантійні зобов'язання виконавця не розповсюджуються на запасні частини, надані Замовником. Деталі, що не були затребувані Замовником на момент видачі автомобіля, утилізуються та поверненню не підлягають. Цим підписом я надаю однозначну згоду на обробку моїх персональних даних з метою надання сервісних, гарантійних та інших супутніх послуг. Я повідомлений(на) про свої права, передбачені ст. 8 Закону України "Про захист персональних даних".</p>
      <br>
      <table>
        <tr><td><strong>Замовник:</strong> З об'ємом та вартістю робіт згоден</td><td><strong>Виконавець:</strong></td></tr>
        <tr><td><hr class="signature-line"></td><td><hr class="signature-line"></td></tr>
      </table>
    </div>
  `;
}

async function addModalHandlers(
  actId: number,
  actDetails: any,
  clientPhone: string
): Promise<void> {
  const isClosed = globalCache.isActClosed;
  const isRestricted = userAccessLevel === "Слюсар";
  const body = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  if (!body) return;

  import("./inhi/knopka_zamok").then(({ initStatusLockDelegation }) => {
    initStatusLockDelegation();
  });

  initPhoneClickHandler(body, clientPhone);
  addSaveHandler(actId, actDetails);
  initDeleteRowHandler();
  initIndexIconHandler();

  const smsBtn = document.getElementById("sms-btn");
  if (smsBtn) {
    smsBtn.addEventListener("click", () => {
      handleSmsButtonClick(actId);
    });
  }

  if (!isRestricted) {
    setTimeout(() => {
      initCreateActRaxunokButton();
      console.log("✅ Кнопка Акт/Рахунок ініціалізована");
    }, 100);

    const printButton = document.getElementById("print-act-button");
    printButton?.addEventListener("click", () => {
      const prev = globalCache.settings.showCatalog;
      globalCache.settings.showCatalog = false;
      try {
        printModalToPdf();
      } finally {
        globalCache.settings.showCatalog = prev;
      }
    });

    const skladButton = document.getElementById("sklad");
    skladButton?.addEventListener("click", () => showModalAllOtherBases());
  }

  if (!isClosed) {
    setupAutocompleteForEditableCells(
      ACT_ITEMS_TABLE_CONTAINER_ID,
      globalCache,
      () => {
        addNewRow(ACT_ITEMS_TABLE_CONTAINER_ID);
        void applyAccessRestrictionsToNewRow();
      }
    );

    initializeActWarnings(ACT_ITEMS_TABLE_CONTAINER_ID, actId);

    const addRowButton = document.getElementById("add-row-button");
    addRowButton?.addEventListener("click", async () => {
      addNewRow(ACT_ITEMS_TABLE_CONTAINER_ID);
      // Застосовуємо обмеження доступу для ВСІХ ролей
      await applyAccessRestrictionsToNewRow();
    });
  }

  const avansInput = document.getElementById(
    "editable-avans"
  ) as HTMLInputElement;
  if (avansInput) {
    avansInput.addEventListener("input", () => {
      updateCalculatedSumsInFooter();
    });
  }

  const discountInput = document.getElementById(
    "editable-discount"
  ) as HTMLInputElement;
  if (discountInput) {
    discountInput.addEventListener("input", () => {
      // Коли користувач вручну змінює відсоток, скидаємо флаг суми
      // щоб наступна зміна суми могла знову установити флаг
      (window as any).isDiscountAmountManuallySet = false;
      updateCalculatedSumsInFooter();
    });
  }

  body.addEventListener("input", handleInputChange);
  updateCalculatedSumsInFooter();
}

function expandName(shortenedName: string): string {
  if (!shortenedName || !shortenedName.includes(".....")) return shortenedName;

  const allNames = [...globalCache.works, ...globalCache.details];
  const [firstPart, lastPart] = shortenedName.split(".....");

  const fullName = allNames.find((name) => {
    const sentences = name
      .split(/(?<=\.)\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length < 2) return false;
    const lastSentence = sentences[sentences.length - 1];
    return (
      name.startsWith(firstPart) &&
      (name.endsWith(lastPart) || lastSentence === lastPart)
    );
  });

  return fullName || shortenedName;
}

function handleInputChange(event: Event): void {
  const target = event.target as HTMLElement;
  const dataName = target.getAttribute("data-name");
  if (globalCache.isActClosed) {
    showNotification("Неможливо редагувати закритий акт", "warning", 1000);
    return;
  }
  switch (dataName) {
    case "price":
    case "id_count": {
      const cleanedValue = target.textContent?.replace(/[^0-9]/g, "") || "";
      const formattedValue = formatNumberWithSpaces(cleanedValue, 0, 0);
      if (target.textContent !== formattedValue) {
        const selection = window.getSelection();
        const originalCaretPosition = selection?.focusOffset || 0;
        target.textContent = formattedValue;
        if (selection && target.firstChild) {
          const formattedLength = formattedValue.length;
          const originalLength = cleanedValue.length;
          const diff = formattedLength - originalLength;
          const newCaretPosition = Math.min(
            originalCaretPosition + diff,
            formattedLength
          );
          const range = document.createRange();
          range.setStart(target.firstChild, Math.max(0, newCaretPosition));
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      const row = target.closest("tr") as HTMLTableRowElement;
      if (row) {
        calculateRowSum(row).catch((err) => {
          console.error("Помилка при розрахунку суми:", err);
        });
      }
      break;
    }
    case "slyusar_sum": {
      const cleanedValue = target.textContent?.replace(/[^0-9]/g, "") || "";
      const formattedValue = formatNumberWithSpaces(cleanedValue, 0, 0);
      if (target.textContent !== formattedValue) {
        const selection = window.getSelection();
        const originalCaretPosition = selection?.focusOffset || 0;
        target.textContent = formattedValue;
        if (selection && target.firstChild) {
          const formattedLength = formattedValue.length;
          const originalLength = cleanedValue.length;
          const diff = formattedLength - originalLength;
          const newCaretPosition = Math.min(
            originalCaretPosition + diff,
            formattedLength
          );
          const range = document.createRange();
          range.setStart(target.firstChild, Math.max(0, newCaretPosition));
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      break;
    }
    case "name": {
      if ((target as any)._fromAutocomplete) {
        delete (target as any)._fromAutocomplete;
        updateCalculatedSumsInFooter();
        break;
      }

      const displayedName = target.textContent?.trim() || "";
      const fullName = expandName(displayedName);

      const isInWorks = globalCache.works.includes(fullName);
      const isInDetails = globalCache.details.includes(fullName);

      let type: "details" | "works";
      if (isInDetails && !isInWorks) {
        type = "details";
      } else if (isInWorks && !isInDetails) {
        type = "works";
      } else {
        type = "works";
      }

      target.setAttribute("data-type", type);

      console.log(`🔧 Тип для "${displayedName}" → "${fullName}": ${type}`, {
        isInDetails,
        isInWorks,
      });

      // ⬇️ ВИПРАВЛЕНО: Завжди підтягуємо ім'я для робіт, навіть якщо є значення
      if (displayedName && globalCache.settings.showPibMagazin) {
        const row = target.closest("tr") as HTMLTableRowElement;
        const pibMagCell = row?.querySelector(
          '[data-name="pib_magazin"]'
        ) as HTMLElement | null;

        if (row && pibMagCell) {
          if (type === "works") {
            const userName = getUserNameFromLocalStorage();
            const userLevel = getUserAccessLevelFromLocalStorage();

            if (userName && userLevel === "Слюсар") {
              // ⬇️ КРИТИЧНО: Встановлюємо ім'я ЗАВЖДИ для робіт (тільки якщо Слюсар)
              pibMagCell.textContent = userName;
              pibMagCell.setAttribute("data-type", "slyusars");
              void calculateRowSum(row);
            } else {
              // Якщо не слюсар - не заповнюємо автоматично (або очищаємо, якщо треба)
              // Але тут ми не очищаємо примусово, якщо вже щось є?
              // Логіка: "keep it clean".
              // Якщо це ручне введення, можливо користувач сам щось ввів?
              // Але функція expandName могла змінити текст.
              // Давайте дотримуватись "explicitly cleared/kept empty".
              // Якщо pibMagCell вже мав значення, чи треба його терти?
              // Раніше він не тер if (userName) else ...?
              // Раніше else не було.

              // Якщо користувач (Адмін) вибрав роботу, поле слюсаря має бути пустим?
              // Так.
              if (!pibMagCell.textContent?.trim()) {
                // Тільки якщо порожнє - залишаємо порожнім (і ставимо slyusars щоб був випадаючий список слюсарів)
                pibMagCell.setAttribute("data-type", "slyusars");
              }
            }
          } else {
            // Для деталей очищуємо, якщо порожньо
            if (!pibMagCell.textContent?.trim()) {
              pibMagCell.setAttribute("data-type", "shops");
            }
          }
        }
      }

      updateCalculatedSumsInFooter();
      break;
    }

    case "pib_magazin": {
      const row = target.closest("tr") as HTMLTableRowElement;
      if (row) {
        const newSlyusar = target.textContent?.trim() || "";
        const prevSlyusar = target.getAttribute("data-prev-value") || "";
        
        // ✅ Зберігаємо нове значення як попереднє для наступного разу
        target.setAttribute("data-prev-value", newSlyusar);
        
        // ✅ Перевіряємо поточну зарплату в інпуті
        const slyusarSumCell = row.querySelector('[data-name="slyusar_sum"]') as HTMLElement;
        const currentSalaryText = (slyusarSumCell?.textContent || "").replace(/\s/g, "").trim();
        const currentSalary = parseFloat(currentSalaryText) || 0;
        
        console.log(`📊 pib_magazin change: prev="${prevSlyusar}", new="${newSlyusar}", currentSalary=${currentSalary}, salaryText="${currentSalaryText}"`);
        
        // ✅ Якщо слюсар змінився І зарплата = 0 або пусто → примусовий перерахунок від відсотка
        if (prevSlyusar && prevSlyusar !== newSlyusar && (currentSalary === 0 || currentSalaryText === "")) {
          console.log(`🔄 Слюсар змінився: "${prevSlyusar}" → "${newSlyusar}" і зарплата = 0/${currentSalaryText === "" ? "пусто" : currentSalary}. Примусовий перерахунок.`);
          forceRecalculateSlyusarSalary(row).catch((err) => {
            console.error("Помилка при примусовому перерахунку зарплати:", err);
          });
        } else if (prevSlyusar && prevSlyusar !== newSlyusar && currentSalary > 0) {
          console.log(`ℹ️ Слюсар змінився: "${prevSlyusar}" → "${newSlyusar}", але зарплата вже ${currentSalary} — НЕ перераховуємо!`);
          // ✅ Встановлюємо флаг, що зарплату не треба перераховувати
          row.setAttribute("data-salary-locked", "true");
          updateCalculatedSumsInFooter();
        } else {
          // Звичайний розрахунок (з історії якщо є)
          calculateRowSum(row).catch((err) => {
            console.error("Помилка при розрахунку суми:", err);
          });
        }
      }
      break;
    }
    default:
      if (target.id === EDITABLE_PROBIG_ID) {
        const cleanedValue = target.textContent?.replace(/[^0-9]/g, "") || "";
        const formattedValue = formatNumberWithSpaces(cleanedValue, 0, 0);
        if (target.textContent !== formattedValue) {
          const selection = window.getSelection();
          const originalCaretPosition = selection?.focusOffset || 0;
          target.textContent = formattedValue;

          if (selection && target.firstChild) {
            const formattedLength = formattedValue.length;
            const originalLength = cleanedValue.length;
            const diff = formattedLength - originalLength;
            const newCaretPosition = Math.min(
              originalCaretPosition + diff,
              formattedLength
            );
            const range = document.createRange();
            range.setStart(target.firstChild, Math.max(0, newCaretPosition));
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
      break;
  }
}

/** Отримує ім'я користувача з localStorage */
export function getUserNameFromLocalStorage(): string | null {
  try {
    const USER_DATA_KEY = "userAuthData";
    const storedData = localStorage.getItem(USER_DATA_KEY);
    if (!storedData) return null;

    const userData = JSON.parse(storedData);
    return userData?.Name || null;
  } catch (error) {
    console.warn(
      "Помилка при отриманні імені користувача з localStorage:",
      error
    );
    return null;
  }
}

/** Отримує рівень доступу користувача з localStorage */
export function getUserAccessLevelFromLocalStorage(): string | null {
  try {
    const USER_DATA_KEY = "userAuthData";
    const storedData = localStorage.getItem(USER_DATA_KEY);
    if (!storedData) return null;

    const userData = JSON.parse(storedData);
    return userData?.["Доступ"] || null;
  } catch (error) {
    console.warn("Помилка при отриманні рівня доступу з localStorage:", error);
    return null;
  }
}

function togglePriceColumnsVisibility(show: boolean): void {
  const displayValue = show ? "" : "none";

  // Всі клітинки та заголовки з data-col="price" або data-col="sum"
  const priceCells = document.querySelectorAll<HTMLElement>(
    '[data-col="price"], [data-col="sum"]'
  );

  priceCells.forEach((el) => {
    el.style.display = displayValue;
  });

  // ✅ Також приховуємо/показуємо футер з сумами
  const sumsFooter = document.querySelector<HTMLElement>('.zakaz_narayd-sums-footer');
  if (sumsFooter) {
    sumsFooter.style.display = displayValue;
  }

  // ✅ Також оновлюємо стовпець "Сума" в таблиці списку актів
  toggleActsTableSumaColumn(show);
}

/**
 * Приховує/показує стовпець "Сума" в таблиці списку актів (без перезавантаження)
 */
function toggleActsTableSumaColumn(show: boolean): void {
  const actsTable = document.querySelector('#table-container-modal-sakaz_narad table');
  if (!actsTable) return;

  const displayValue = show ? "" : "none";

  // Знаходимо індекс стовпця "Сума" в заголовку
  const headers = actsTable.querySelectorAll('thead th');
  let sumaColumnIndex = -1;
  
  headers.forEach((th, index) => {
    if (th.textContent?.trim() === 'Сума') {
      sumaColumnIndex = index;
      (th as HTMLElement).style.display = displayValue;
    }
  });

  // Якщо стовпець "Сума" не існує і потрібно показати - перемальовуємо таблицю
  if (sumaColumnIndex === -1 && show) {
    console.log('🔄 Стовпець "Сума" не існує - перемальовуємо таблицю актів');
    refreshActsTable();
    return;
  }

  // Якщо стовпець існує - приховуємо/показуємо комірки в рядках
  if (sumaColumnIndex !== -1) {
    const rows = actsTable.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells[sumaColumnIndex]) {
        (cells[sumaColumnIndex] as HTMLElement).style.display = displayValue;
      }
    });
    console.log(`🔄 Стовпець "Сума" в таблиці актів: ${show ? 'показано' : 'приховано'}`);
  }
}

// ============================================================================
// 📢 REALTIME ПІДПИСКА НА ЗМІНИ slusarsOn (ОНОВЛЕННЯ ЗАГОЛОВКА)
// ============================================================================

let slusarsOnSubscription: ReturnType<typeof supabase.channel> | null = null;

/**
 * Підписується на зміни slusarsOn для конкретного акту
 * Оновлює жовте фарбування заголовка модального вікна в реальному часі
 */
function setupSlusarsOnRealtimeSubscription(actId: number): void {
  // Очищаємо попередню підписку, якщо є
  if (slusarsOnSubscription) {
    slusarsOnSubscription.unsubscribe();
    slusarsOnSubscription = null;
  }

  // Підписка тільки для Адміністратора, Слюсаря та Приймальника
  if (
    userAccessLevel !== "Адміністратор" &&
    userAccessLevel !== "Слюсар" &&
    userAccessLevel !== "Приймальник"
  ) {
    return;
  }

  console.log(
    `📡 Підписка на зміни slusarsOn для акту #${actId} (${userAccessLevel})`
  );

  slusarsOnSubscription = supabase
    .channel(`slusarsOn-act-${actId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "acts",
        filter: `act_id=eq.${actId}`,
      },
      async (payload) => {
        console.log("📡 [Realtime UPDATE] Зміна slusarsOn:", payload.new);

        const updatedAct = payload.new;
        if (!updatedAct) return;

        const newSlusarsOn = updatedAct.slusarsOn === true;
        const isClosed = !!updatedAct.date_off;

        // Оновлюємо заголовок
        const header = document.querySelector(".zakaz_narayd-header");
        if (header) {
          // Перевірка видимості (як в коді рендерингу)
          const shouldShowSlusarsOn =
            newSlusarsOn &&
            !isClosed &&
            (userAccessLevel === "Адміністратор" ||
              userAccessLevel === "Слюсар" ||
              (userAccessLevel === "Приймальник" &&
                updatedAct.pruimalnyk === currentUserName));

          if (shouldShowSlusarsOn) {
            header.classList.add("zakaz_narayd-header-slusar-on");
            console.log("✅ Заголовок пофарбовано в золотий (slusarsOn=true)");
          } else {
            header.classList.remove("zakaz_narayd-header-slusar-on");
            console.log(
              "✅ Золоте фарбування заголовка знято (slusarsOn=false)"
            );
          }
        }
      }
    )
    .subscribe();
}

/**
 * Очищає підписку на slusarsOn при закритті модального вікна
 * Викликається в modalUI.ts при закритті модалки
 */
export function cleanupSlusarsOnSubscription(): void {
  if (slusarsOnSubscription) {
    console.log("🧹 Очищення підписки на slusarsOn");
    slusarsOnSubscription.unsubscribe();
    slusarsOnSubscription = null;
  }
}
