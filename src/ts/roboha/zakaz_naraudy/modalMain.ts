// src\ts\roboha\zakaz_naraudy\modalMain.ts
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
} from "./modalUI";
import { showModalAllOtherBases } from "../dodatu_inchi_bazu/dodatu_inchi_bazu_danux";
import { formatDate } from "./inhi/formatuvannya_datu";
import { addSaveHandler } from "./inhi/zberechennya_zmin_y_danux_aktu";
import { userAccessLevel } from "../tablucya/users";
import { canUserOpenActs } from "../tablucya/users";
import {
  createModalActRaxunok,
  initModalActRaxunokHandlers,
  initCreateActRaxunokButton,
  MODAL_ACT_RAXUNOK_ID,
} from "./inhi/actRaxunok";

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
              const icon = type === "works" ? "🛠️" : "⚙️";
              indexCell.textContent = `${icon} ${idx + 1}`;
            }
          });
        }

        updateCalculatedSumsInFooter();
        showNotification("Рядок видалено", "success", 1000);
      }
    }
  });
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
    updateAllSlyusarSumsFromHistory();
    await fillMissingSlyusarSums();
    checkSlyusarSumWarningsOnLoad();
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

function applyAccessRestrictionsToNewRow(): void {
  const table = document.querySelector(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} table`
  );
  if (!table) return;

  const lastRow = table.querySelector("tbody tr:last-child");
  if (lastRow) {
    const cells = lastRow.querySelectorAll("td");
    cells.forEach((cell) => {
      const dataName = cell.getAttribute("data-name");
      if (
        dataName === "price" ||
        dataName === "sum" ||
        dataName === "slyusar_sum"
      ) {
        cell.classList.add("hidden");
      }
    });
  }
}

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

      if (hasLink) {
        window.open(links[0], "_blank");
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

  const allItems = [
    ...(actDetails?.["Деталі"] || []).map((item: any) => ({
      type: "detail",
      name: item["Деталь"] || "",
      quantity: item["Кількість"] || 0,
      price: item["Ціна"] || 0,
      sum: item["Сума"] || 0,
      person_or_store: showPibMagazin ? item["Магазин"] || "" : "",
      catalog: showCatalog ? item["Каталог"] || "" : "",
      sclad_id: showCatalog ? item["sclad_id"] || null : null,
      slyusar_id: null,
    })),
    ...(actDetails?.["Роботи"] || []).map((item: any) => ({
      type: "work",
      name: item["Робота"] || "",
      quantity: item["Кількість"] || 0,
      price: item["Ціна"] || 0,
      sum: item["Сума"] || 0,
      person_or_store: showPibMagazin ? item["Слюсар"] || "" : "",
      catalog: showCatalog ? item["Каталог"] || "" : "",
      sclad_id: showCatalog ? null : null,
      slyusar_id: item["slyusar_id"] || null,
    })),
  ];

  globalCache.initialActItems = allItems;
  
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
        ${createTableRow(
          "Vincode",
          `
          <div class="status-row">
            <span>${carInfo.vin}</span>
            <div class="status-icons">
              ${
                isRestricted
                  ? ""
                  : `<button type="button" class="status-lock-icon" id="create-act-btn" title="Акт Рахунок?">🗂️</button>`
              }
            </div>
          </div>
          `
        )}
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
  
  setTimeout(() => {
    const avansInput = document.getElementById(
      "editable-avans"
    ) as HTMLInputElement | null;
    if (!avansInput) return;

    const avansValue = Number(act?.avans ?? actDetails?.["Аванс"] ?? 0);
    avansInput.value = String(avansValue);
    avansInput.dispatchEvent(new Event("input"));
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

  if (!isRestricted) {
    import("./inhi/knopka_zamok").then(({ initStatusLockDelegation }) => {
      initStatusLockDelegation();
    });
  }

  initPhoneClickHandler(body, clientPhone);
  addSaveHandler(actId, actDetails);
  initDeleteRowHandler();

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
      globalCache
    );

    initializeActWarnings(ACT_ITEMS_TABLE_CONTAINER_ID, actId);

    const addRowButton = document.getElementById("add-row-button");
    addRowButton?.addEventListener("click", () => {
      addNewRow(ACT_ITEMS_TABLE_CONTAINER_ID);
      if (userAccessLevel === "Слюсар") {
        applyAccessRestrictionsToNewRow();
      }
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

      if (displayedName && globalCache.settings.showPibMagazin) {
        const row = target.closest("tr") as HTMLTableRowElement;
        const pibMagCell = row?.querySelector(
          '[data-name="pib_magazin"]'
        ) as HTMLElement | null;

        if (row && pibMagCell && !pibMagCell.textContent?.trim()) {
          if (type === "works") {
            const userName = getUserNameFromLocalStorage();
            if (userName) {
              pibMagCell.textContent = userName;
              pibMagCell.setAttribute("data-type", "slyusars");
              void calculateRowSum(row);
            }
          } else {
            pibMagCell.setAttribute("data-type", "shops");
          }
        }
      }

      updateCalculatedSumsInFooter();
      break;
    }

    case "pib_magazin": {
      const row = target.closest("tr") as HTMLTableRowElement;
      if (row) {
        calculateRowSum(row).catch((err) => {
          console.error("Помилка при розрахунку суми:", err);
        });
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