// src\ts\roboha\zakaz_naraudy\modalMain.ts
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "./inhi/vspluvauhe_povidomlenna";
import {
  refreshPhotoData,
  safeParseJSON,
} from "./inhi/ctvorennia_papku_googleDrive.";
import { initPhoneClickHandler } from "./inhi/telefonna_pidskazka";
import { initOdometerInput } from "./inhi/odometr";
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
} from "./modalUI";
import { showModalAllOtherBases } from "../dodatu_inchi_bazu/dodatu_inchi_bazu_danux";
import { formatDate } from "./inhi/formatuvannya_datu";
import { addSaveHandler } from "./inhi/zberechennya_zmin_y_danux_aktu";
import { userAccessLevel } from "../tablucya/users"; // Імпорт рівня доступу користувача


import { canUserOpenActs } from "../tablucya/users";

/**
 * ОНОВЛЕНА функція showModal з перевіркою доступу
 */
export async function showModal(actId: number): Promise<void> {
  // НОВА ПЕРЕВІРКА: Чи може користувач відкривати акти?
  const canOpen = await canUserOpenActs();
  
  if (!canOpen) {
    console.warn(`⚠️ Користувач не має доступу до відкриття акту ${actId}`);
    showNoAccessNotification();
    return;
  }

  // Решта коду залишається без змін...
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
    await loadGlobalData();
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
    const [clientData, carData] = await Promise.all([
      fetchClientData(act.client_id),
      fetchCarData(act.cars_id),
    ]);
    const actDetails = safeParseJSON(act.info || act.data || act.details) || {};
    globalCache.oldNumbers = new Map<number, number>();
    for (const d of actDetails?.["Деталі"] || []) {
      const id = Number(d?.sclad_id);
      const qty = Number(d?.["Кількість"] ?? 0);
      if (id) globalCache.oldNumbers.set(id, qty);
    }
    renderModalContent(act, actDetails, clientData, carData);
    await addModalHandlers(actId, actDetails, clientData?.phone);
    await refreshQtyWarningsIn(ACT_ITEMS_TABLE_CONTAINER_ID);
    await refreshPhotoData(actId);

    applyAccessRestrictions();

    showNotification("Дані успішно завантажено", "success", 1500);
  } catch (error) {
    console.error("💥 Критична помилка при завантаженні акту:", error);
    showNotification(`Критична помилка завантаження акту`, "error");
    if (body) {
      body.innerHTML = `<p class="error-message">❌ Критична помилка завантаження акту. Перегляньте консоль.</p>`;
    }
  }
}

/**
 * НОВА функція: Повідомлення про відсутність доступу до відкриття акту
 */
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

/**
 * Застосування обмежень доступу до нових рядків таблиці
 */
function applyAccessRestrictionsToNewRow(): void {
  const table = document.querySelector(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} table`
  );
  if (!table) return;

  // Приховуємо комірки ціни та суми в останньому доданому рядку
  const lastRow = table.querySelector("tbody tr:last-child");
  if (lastRow) {
    const cells = lastRow.querySelectorAll("td");
    cells.forEach((cell) => {
      const dataName = cell.getAttribute("data-name");
      if (dataName === "price" || dataName === "sum") {
        cell.classList.add("hidden");
      }
    });
  }
}

/**
 * Застосування обмежень доступу для користувачів з обмеженим доступом
 */
function applyAccessRestrictions(): void {
  if (userAccessLevel === "Слюсар") {
    const statusLockBtn = document.getElementById("status-lock-btn");
    const printActButton = document.getElementById("print-act-button");
    const skladButton = document.getElementById("sklad");

    if (statusLockBtn) statusLockBtn.classList.add("hidden");
    if (printActButton) printActButton.classList.add("hidden");
    if (skladButton) skladButton.classList.add("hidden");
    restrictPhotoAccess();
  }
}

/**
 * Обмеження доступу до функціональності фото для обмежених користувачів
 */
function restrictPhotoAccess(): void {
  const photoCell = document.querySelector(
    "table.zakaz_narayd-table.left tr:nth-child(5) td:nth-child(2)"
  ) as HTMLTableCellElement | null;

  if (!photoCell) return;

  // Видаляємо існуючі обробники подій
  const existingHandler = (photoCell as any).__gd_click__;
  if (existingHandler) {
    photoCell.removeEventListener("click", existingHandler);
  }

  // Додаємо новий обробник з обмеженнями
  const restrictedClickHandler = async (e: MouseEvent) => {
    e.preventDefault();

    const modal = document.getElementById("zakaz_narayd-custom-modal");
    const actIdStr = modal?.getAttribute("data-act-id");
    if (!actIdStr) return;
    const actId = Number(actIdStr);

    try {
      // Отримуємо актуальні дані з БД
      const { data: act, error } = await supabase
        .from("acts")
        .select("data, date_off")
        .eq("act_id", actId)
        .single();

      if (error || !act) {
        showNotification("Помилка отримання даних акту", "error");
        return;
      }

      const actData = safeParseJSON(act.data) || {};
      const links: string[] = Array.isArray(actData?.["Фото"])
        ? actData["Фото"]
        : [];
      const hasLink = links.length > 0 && links[0];

      // Якщо є посилання - відкриваємо його
      if (hasLink) {
        window.open(links[0], "_blank");
        return;
      }

      // Якщо немає посилання - забороняємо створення для обмежених користувачів
      showNotification(
        "Створення папки заборонено для вашого рівня доступу",
        "warning"
      );
    } catch (err) {
      console.error("❌ Помилка при перевірці фото:", err);
      showNotification("Помилка при перевірці фото", "error");
    }
  };

  // Зберігаємо новий обробник
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
    body.innerHTML = `<p class="error-message">❌ Не вдалося завантажити акт. ${
      error?.message || "Перевірте підключення."
    }</p>`;
  }
}

function renderModalContent(
  act: any,
  actDetails: any,
  clientData: any,
  carData: any
): void {
  const body = document.getElementById(ZAKAZ_NARAYD_BODY_ID);
  if (!body) return;
  const isClosed = globalCache.isActClosed;
  const isRestricted = userAccessLevel === "Слюсар";
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
  const allItems = [
    ...(actDetails?.["Деталі"] || []).map((item: any) => ({
      type: "detail",
      name: item["Деталь"],
      quantity: item["Кількість"],
      price: item["Ціна"],
      sum: item["Сума"],
      person_or_store: item["Магазин"],
      catalog: item["Каталог"] || "",
      sclad_id: item["sclad_id"] || null,
      slyusar_id: null,
    })),
    ...(actDetails?.["Роботи"] || []).map((item: any) => ({
      type: "work",
      name: item["Робота"],
      quantity: item["Кількість"],
      price: item["Ціна"],
      sum: item["Сума"],
      person_or_store: item["Слюсар"],
      catalog: item["Каталог"] || "",
      sclad_id: null,
      slyusar_id: item["slyusar_id"] || null,
    })),
  ];
  // Збереження початкового стану рядків у globalCache
  globalCache.initialActItems = allItems;
  console.log("Initial act items saved:", globalCache.initialActItems);
  body.innerHTML = `
    <div class="zakaz_narayd-header">
      <div class="zakaz_narayd-header-info">
        <h1>B.S.Motorservice</h1>
        <p>Адрес: вул. Корольова, 6, Вінниця</p>
        <p>068 931 24 38 тел</p>
      </div>
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
          `
          <div class="status-row">
            <div class="status-dates">
              ${
                isClosed
                  ? `<span class="red">${formatDate(
                      act.date_off
                    )}</span> | <span class="green">${formatDate(
                      act.date_on
                    )}</span>`
                  : `<span class="green">${
                      formatDate(act.date_on) || "-"
                    }</span>`
              }
            </div>
            ${
              isRestricted
                ? ""
                : `<button class="status-lock-icon" id="status-lock-btn" data-act-id="${
                    act.act_id
                  }">
                   ${isClosed ? "🔒" : "🗝️"}
                   </button>`
            }
          </div>
        `
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
          <span id="${EDITABLE_REASON_ID}" class="highlight editable ${editableClass}" ${editableAttr}>${
    actDetails?.["Причина звернення"] || "—"
  }</span>
        </div>
        ${
          isRestricted
            ? ""
            : `<button id="print-act-button" title="Друк акту" class="print-button">🖨️</button>`
        }
      </div>
      <div class="zakaz_narayd-reason-line">
        <div class="recommendations-text">
          <strong>Рекомендації:</strong>
          <span id="${EDITABLE_RECOMMENDATIONS_ID}" class="highlight editable ${editableClass}" ${editableAttr}>${
    actDetails?.["Рекомендації"] || "—"
  }</span>
        </div>
        ${
          isRestricted
            ? ""
            : `<button id="sklad" title="Склад" class="sklad">📦</button>`
        }
      </div>
    </div>
    ${generateTableHTML(allItems, globalCache.settings.showPibMagazin)}
    ${isClosed ? createClosedActClaimText() : ""}
  `;
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
  if (!isRestricted) {
    import("./inhi/knopka_zamok").then(({ initStatusLockDelegation }) => {
      // ініціалізуємо ОДИН раз — всередині є захист від повторного кріплення
      initStatusLockDelegation();
    });
  }

  initPhoneClickHandler(body, clientPhone);
  addSaveHandler(actId, actDetails);
  initOdometerInput(EDITABLE_PROBIG_ID);
  if (!isRestricted) {
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
      globalCache
    );
     initializeActWarnings(ACT_ITEMS_TABLE_CONTAINER_ID, actId);
    const addRowButton = document.getElementById("add-row-button");
    addRowButton?.addEventListener("click", () => {
      addNewRow(ACT_ITEMS_TABLE_CONTAINER_ID);
      // Застосовуємо обмеження до нового рядка
      if (userAccessLevel === "Слюсар") {
        applyAccessRestrictionsToNewRow();
      }
    });
  }
  body.addEventListener("input", handleInputChange);
  updateCalculatedSumsInFooter();
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
      if (row) calculateRowSum(row);
      break;
    }
    case "name": {
      const name = target.textContent?.trim() || "";
      const isDetail = globalCache.details.includes(name);
      const type = isDetail ? "details" : "works";
      target.setAttribute("data-type", type);

      // Автозаповнення ПІБ/Магазин:
      // - для "works" залишаємо як було (підставляємо ім'я користувача)
      // - для "details" (введено вручну, НЕ з каталогу) — НІЧОГО НЕ ПІДСТАВЛЯЄМО
      if (name) {
        const row = target.closest("tr") as HTMLTableRowElement;
        const pibMagCell = row?.querySelector(
          '[data-name="pib_magazin"]'
        ) as HTMLElement | null;
        if (pibMagCell && !pibMagCell.textContent?.trim()) {
          if (type === "works") {
            // для робіт — як було: підставляємо ім'я користувача
            const userName = getUserNameFromLocalStorage();
            if (userName) {
              pibMagCell.textContent = userName;
              pibMagCell.setAttribute("data-type", "slyusars");
            }
          } else {
            // type === "details": не чіпаємо поле, не підставляємо із localStorage
            // (autocomplete тип можна виставити або лишити порожнім — на твій вибір)
            // Якщо хочеш підсвітити тип для автокомпліта магазинів без підстановки тексту:
            pibMagCell.setAttribute("data-type", "shops");
          }
        }
      }

      updateCalculatedSumsInFooter();
      break;
    }

    default:
      if (target.id === EDITABLE_PROBIG_ID) {
        const cleanedValue = target.textContent?.replace(/[^0-9]/g, "") || "";
        const formattedValue = formatNumberWithSpaces(cleanedValue, 0, 0);
        if (target.textContent !== formattedValue) {
          target.textContent = formattedValue;
        }
      }
      break;
  }
}

/**
 * Отримання імені користувача з localStorage
 */
function getUserNameFromLocalStorage(): string | null {
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

// подія «інші бази оновлені»
if (!(window as any).__otherBasesHandlerBound__) {
  document.addEventListener("other-base-data-updated", async () => {
    await loadGlobalData();
    const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
    if (container) {
      setupAutocompleteForEditableCells(
        ACT_ITEMS_TABLE_CONTAINER_ID,
        globalCache
      );
      await refreshQtyWarningsIn(ACT_ITEMS_TABLE_CONTAINER_ID);
      updateCalculatedSumsInFooter();
    }
  });
  (window as any).__otherBasesHandlerBound__ = true;
}
