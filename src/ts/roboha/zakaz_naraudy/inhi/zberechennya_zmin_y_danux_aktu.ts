// ===== ФАЙЛ: src/ts/roboha/zakaz_naraudy/inhi/zberechennya_zmin_y_danux_aktu_NEW.ts =====

import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna";
import {
  globalCache,
  ZAKAZ_NARAYD_SAVE_BTN_ID,
  EDITABLE_PROBIG_ID,
  EDITABLE_REASON_ID,
  EDITABLE_RECOMMENDATIONS_ID,
  ACT_ITEMS_TABLE_CONTAINER_ID,
  loadGlobalData,
} from "../globalCache";
import type { ActItem } from "../globalCache";
import { updateCalculatedSumsInFooter } from "../modalUI";
import { refreshActsTable } from "../../tablucya/tablucya";
import { refreshQtyWarningsIn } from "./kastomna_tabluca";
import { syncShopsOnActSave } from "./save_shops";
import { syncSlyusarsOnActSave } from "./save_work";
import { userAccessLevel, userName } from "../../tablucya/users";

/* =============================== ТИПИ І ІНТЕРФЕЙСИ =============================== */

interface DetailRow {
  shopName: string;
  sclad_id: number | null;
  Найменування: string;
  Каталог: string | null;
  Кількість: number;
  Ціна: number;
}

interface WorkRow {
  slyusarName: string;
  Найменування: string;
  Кількість: number;
  Ціна: number;
  Зарплата: number;
}

export interface ParsedItem {
  type: "detail" | "work";
  name: string;
  quantity: number;
  price: number;
  sum: number;
  pibMagazin: string;
  catalog: string;
  sclad_id: number | null;
  slyusar_id: number | null;
  slyusarSum?: number;
}

interface ActChangeRecord {
  act_id: number;
  item_name: string;
  cina: number;
  kilkist: number;
  zarplata: number;
  dodav_vudaluv: boolean;
  changed_by_surname: string;
  delit: boolean; // ✅ Додано для позначення видалених повідомлень
  data: string;
  pib?: string; // ✅ ПІБ клієнта з поточного акту
  auto?: string; // ✅ Дані автомобіля з поточного акту
}

// КЕШ: Зберігаємо ПОВНІ ДАНІ РЯДКІВ (для всіх ролей з прихованими колонками)
// Ключ: "type:name" (наприклад, "detail:Масляний фільтр")
const fullRowDataCache = new Map<string, ParsedItem>();

// КЕШ: Закупівельні ціни зі складу для обчислення маржі
const purchasePricesCache = new Map<number, number>();

/* =============================== УТИЛІТИ =============================== */

/**
 * Завантажує закупівельні ціни зі складу для обчислення маржі
 */
async function loadPurchasePrices(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("sclad")
      .select("sclad_id, price");

    if (error) {
      console.error("⚠️ Помилка завантаження цін зі складу:", error);
      return;
    }

    purchasePricesCache.clear();
    data?.forEach((item) => {
      const scladId = Number(item.sclad_id);
      const price = Number(item.price) || 0;
      if (!isNaN(scladId)) {
        purchasePricesCache.set(scladId, price);
      }
    });

    console.log(`✅ Завантажено ${purchasePricesCache.size} закупівельних цін`);
  } catch (err) {
    console.error("⚠️ Помилка при завантаженні цін:", err);
  }
}

/**
 * Отримує закупівельну ціну за sclad_id
 */
function getPurchasePrice(scladId: number | null): number | undefined {
  if (!scladId) return undefined;
  return purchasePricesCache.get(scladId);
}

const cleanText = (s?: string | null): string =>
  (s ?? "").replace(/\u00A0/g, " ").trim();

const parseNum = (s?: string | null): number => {
  const v = cleanText(s).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
};

const getCellText = (el?: HTMLElement | null): string =>
  cleanText(el?.textContent);

const validateActId = (actId: number): void => {
  if (!Number.isInteger(actId) || actId <= 0) {
    throw new Error("Невірний формат номера акту");
  }
};

/**
 * Зберігає ПОВНІ дані рядків у тимчасовий кеш.
 * Це потрібно для ВСІХ ролей з прихованими колонками (Слюсар, Приймальник, Складовщик, Запчастист).
 */
export function cacheHiddenColumnsData(actDetails: any): void {
  fullRowDataCache.clear();

  console.log("💾 Кешування повних даних рядків...");

  const details = Array.isArray(actDetails?.["Деталі"])
    ? actDetails["Деталі"]
    : [];
  const works = Array.isArray(actDetails?.["Роботи"])
    ? actDetails["Роботи"]
    : [];

  // Кешуємо деталі
  details.forEach((d: any) => {
    const name = d["Деталь"]?.trim();
    if (!name) return;

    const cacheKey = `detail:${name}`;
    fullRowDataCache.set(cacheKey, {
      type: "detail",
      name,
      price: Number(d["Ціна"]) || 0,
      sum: Number(d["Сума"]) || 0,
      catalog: d["Каталог"] || "",
      quantity: Number(d["Кількість"]) || 0,
      slyusarSum: 0,
      pibMagazin: d["Магазин"] || "",
      sclad_id: d["sclad_id"] || null,
      slyusar_id: null,
    });
  });

  // Кешуємо роботи
  works.forEach((w: any) => {
    const name = w["Робота"]?.trim();
    if (!name) return;

    const cacheKey = `work:${name}`;
    fullRowDataCache.set(cacheKey, {
      type: "work",
      name,
      price: Number(w["Ціна"]) || 0,
      sum: Number(w["Сума"]) || 0,
      catalog: w["Каталог"] || "",
      quantity: Number(w["Кількість"]) || 0,
      slyusarSum: Number(w["Зарплата"]) || 0,
      pibMagazin: w["Слюсар"] || "",
      sclad_id: null,
      slyusar_id: w["slyusar_id"] || null,
    });
  });

  console.log(`📦 Закешовано ${fullRowDataCache.size} позицій.`);
}

/* =============================== РОБОТА З ТАБЛИЦЕЮ =============================== */

function readTableNewNumbers(): Map<number, number> {
  const tableRows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );
  const numberMap = new Map<number, number>();

  tableRows.forEach((row) => {
    const nameCell = row.querySelector(
      '[data-name="name"]'
    ) as HTMLElement | null;
    if (!nameCell?.textContent?.trim()) return;

    const catalogCell = row.querySelector(
      '[data-name="catalog"]'
    ) as HTMLElement | null;
    const qtyCell = row.querySelector(
      '[data-name="id_count"]'
    ) as HTMLElement | null;
    const scladIdAttr = catalogCell?.getAttribute("data-sclad-id");

    if (!scladIdAttr) return;

    const sclad_id = Number(scladIdAttr);
    const qty = parseNum(qtyCell?.textContent);

    if (!isNaN(sclad_id)) {
      numberMap.set(sclad_id, (numberMap.get(sclad_id) || 0) + qty);
    }
  });

  return numberMap;
}

export function parseTableRows(): ParsedItem[] {
  console.log(`📊 Збір даних таблиці. Рівень доступу: ${userAccessLevel}`);

  const tableRows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );
  const items: ParsedItem[] = [];

  tableRows.forEach((row: Element) => {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const name = getCellText(nameCell);
    if (!name) return;

    // Визначаємо тип рядка
    const typeFromCell = nameCell.getAttribute("data-type");
    const type =
      typeFromCell === "works" || globalCache.works.includes(name)
        ? "work"
        : "detail";

    // Створюємо ключ для кешу
    const cacheKey = `${type}:${name}`;
    const cachedData = fullRowDataCache.get(cacheKey);

    // Отримуємо посилання на всі комірки
    const quantityCell = row.querySelector(
      '[data-name="id_count"]'
    ) as HTMLElement;
    const priceCell = row.querySelector('[data-name="price"]') as HTMLElement;
    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const pibMagazinCell = row.querySelector(
      '[data-name="pib_magazin"]'
    ) as HTMLElement;
    const catalogCell = row.querySelector(
      '[data-name="catalog"]'
    ) as HTMLElement;
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;

    // 1. Кількість завжди беремо з DOM (користувач міг її змінити)
    const quantity = parseNum(quantityCell?.textContent);

    // 2. Перевіряємо видимість колонок та беремо дані
    let price = 0;
    let sum = 0;
    let pibMagazin = "";
    let catalog = "";
    let slyusarSum = 0;

    // Ціна: якщо видима - з DOM, якщо прихована - з кешу
    if (priceCell && priceCell.offsetParent !== null) {
      price = parseNum(priceCell.textContent);
    } else if (cachedData) {
      price = cachedData.price;
    }

    // Сума: якщо видима - з DOM, якщо прихована - з кешу
    if (sumCell && sumCell.offsetParent !== null) {
      sum = parseNum(sumCell.textContent);
    } else if (cachedData) {
      sum = cachedData.sum;
    }

    // ПІБ_Магазин: якщо видимий - з DOM, якщо прихований - з кешу
    if (pibMagazinCell && pibMagazinCell.offsetParent !== null) {
      pibMagazin = getCellText(pibMagazinCell);
    } else if (cachedData) {
      pibMagazin = cachedData.pibMagazin;
    }

    // Каталог: якщо видимий - з DOM, якщо прихований - з кешу
    if (catalogCell && catalogCell.offsetParent !== null) {
      catalog = getCellText(catalogCell);
    } else if (cachedData) {
      catalog = cachedData.catalog;
    }

    // Зарплата: якщо видима - з DOM, якщо прихована - з кешу
    if (slyusarSumCell && slyusarSumCell.offsetParent !== null) {
      slyusarSum = parseNum(slyusarSumCell.textContent);
    } else if (cachedData) {
      slyusarSum = cachedData.slyusarSum || 0;
    }

    const scladIdAttr = catalogCell?.getAttribute("data-sclad-id");
    const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;
    const slyusar_id = nameCell.getAttribute("data-slyusar-id")
      ? Number(nameCell.getAttribute("data-slyusar-id"))
      : null;

    const item: ParsedItem = {
      type,
      name,
      quantity,
      price,
      sum,
      pibMagazin,
      catalog,
      sclad_id,
      slyusar_id,
      slyusarSum,
    };

    items.push(item);

    // Оновлюємо кеш актуальними даними
    fullRowDataCache.set(cacheKey, item);
  });

  console.log(`✅ Зібрано ${items.length} позицій з таблиці`);
  return items;
}

async function updateScladActNumbers(
  actId: number,
  newScladIds: Set<number>
): Promise<void> {
  validateActId(actId);

  const initialScladIds = new Set(
    (globalCache.initialActItems || [])
      .filter((item) => item.type === "detail" && item.sclad_id != null)
      .map((item) => item.sclad_id!)
  );

  const scladIdsToSetAct = Array.from(newScladIds);
  const scladIdsToClearAct = Array.from(initialScladIds).filter(
    (id) => !newScladIds.has(id)
  );

  if (scladIdsToSetAct.length > 0) {
    await updateScladAkt(scladIdsToSetAct, actId);
  }

  if (scladIdsToClearAct.length > 0) {
    await updateScladAkt(scladIdsToClearAct, null);
  }
}

async function updateScladAkt(
  scladIds: number[],
  aktValue: number | null
): Promise<void> {
  if (scladIds.length === 0) return;

  const { data: rows, error: selErr } = await supabase
    .from("sclad")
    .select("sclad_id")
    .in("sclad_id", scladIds);

  if (selErr) {
    console.error("Помилка при отриманні записів sclad:", selErr);
    throw new Error(`Не вдалося отримати записи складу: ${selErr.message}`);
  }

  const foundIds = new Set(rows?.map((r) => Number(r.sclad_id)) || []);
  const missingIds = scladIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    console.warn(`Записи sclad_id не знайдено:`, missingIds);
  }

  const existingIds = scladIds.filter((id) => foundIds.has(id));
  if (existingIds.length > 0) {
    const { error: updateErr } = await supabase
      .from("sclad")
      .update({ akt: aktValue })
      .in("sclad_id", existingIds);

    if (updateErr) {
      console.error("Помилка при оновленні akt:", updateErr);
      throw new Error(`Не вдалося оновити akt: ${updateErr.message}`);
    }
  }
}

async function applyScladDeltas(deltas: Map<number, number>): Promise<void> {
  if (deltas.size === 0) return;

  const ids = Array.from(deltas.keys());
  const { data: rows, error: selErr } = await supabase
    .from("sclad")
    .select("sclad_id, kilkist_off")
    .in("sclad_id", ids);

  if (selErr) {
    throw new Error(
      `Не вдалося отримати склад для оновлення: ${selErr.message}`
    );
  }

  const updates = ids
    .map((id) => {
      const row = rows?.find((r) => Number(r.sclad_id) === id);
      if (!row) {
        console.warn(`Запис sclad_id=${id} не знайдено`);
        return null;
      }

      const currentOff = Number(row.kilkist_off ?? 0);
      const delta = Number(deltas.get(id) || 0);
      const newOff = Math.max(0, currentOff + delta);

      return { sclad_id: id, kilkist_off: newOff };
    })
    .filter((update): update is NonNullable<typeof update> => update !== null);

  if (updates.length > 0) {
    for (const update of updates) {
      const { error: upErr } = await supabase
        .from("sclad")
        .update({ kilkist_off: update.kilkist_off })
        .eq("sclad_id", update.sclad_id);

      if (upErr) {
        throw new Error(
          `Помилка оновлення складу #${update.sclad_id}: ${upErr.message}`
        );
      }
    }
  }
}

function calculateDeltas(): Map<number, number> {
  const newNumbers = readTableNewNumbers();
  const oldNumbers = globalCache.oldNumbers || new Map<number, number>();
  const allIds = new Set<number>([
    ...Array.from(newNumbers.keys()),
    ...Array.from(oldNumbers.keys()),
  ]);

  const deltas = new Map<number, number>();
  for (const id of allIds) {
    const delta = (newNumbers.get(id) || 0) - (oldNumbers.get(id) || 0);
    if (delta !== 0) {
      deltas.set(id, delta);
    }
  }

  return deltas;
}

function processItems(items: ParsedItem[]) {
  const details: any[] = [];
  const works: any[] = [];
  const detailRowsForShops: DetailRow[] = [];
  const workRowsForSlyusars: WorkRow[] = [];
  const newScladIds = new Set<number>();

  let totalDetailsSum = 0;
  let totalWorksSum = 0;
  let totalWorksProfit = 0;
  let totalDetailsMargin = 0;

  items.forEach((item) => {
    const {
      type,
      name,
      quantity,
      price,
      sum,
      pibMagazin,
      catalog,
      sclad_id,
      slyusar_id,
      slyusarSum,
    } = item;

    const itemBase = { Кількість: quantity, Ціна: price, Сума: sum };

    if (type === "work") {
      const salary = Number(slyusarSum || 0);
      const profit = Math.max(0, Number((sum - salary).toFixed(2)));

      works.push({
        ...itemBase,
        Робота: name,
        Слюсар: pibMagazin,
        Каталог: catalog,
        slyusar_id,
        Зарплата: salary,
        Прибуток: profit,
      });

      totalWorksSum += sum;
      totalWorksProfit += profit;

      if (pibMagazin) {
        workRowsForSlyusars.push({
          slyusarName: pibMagazin,
          Найменування: name,
          Кількість: quantity,
          Ціна: price,
          Зарплата: salary,
        });
      }
    } else {
      // Обчислюємо маржу для деталі
      const purchasePrice = getPurchasePrice(sclad_id);
      const margin = purchasePrice ? (price - purchasePrice) * quantity : 0;

      totalDetailsMargin += margin;

      details.push({
        ...itemBase,
        Деталь: name,
        Магазин: pibMagazin,
        Каталог: catalog,
        sclad_id,
      });
      totalDetailsSum += sum;

      if (pibMagazin) {
        detailRowsForShops.push({
          shopName: pibMagazin,
          sclad_id,
          Найменування: name,
          Каталог: catalog || null,
          Кількість: quantity,
          Ціна: price,
        });
      }
      if (sclad_id) newScladIds.add(sclad_id);
    }
  });

  return {
    details,
    works,
    detailRowsForShops,
    workRowsForSlyusars,
    newScladIds,
    totalDetailsSum,
    totalWorksSum,
    grandTotalSum: totalDetailsSum + totalWorksSum,
    totalWorksProfit,
    totalDetailsMargin,
  };
}

async function cleanupEmptyRows(): Promise<void> {
  document
    .querySelectorAll(`#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`)
    .forEach((row) => {
      const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
      if (!nameCell?.textContent?.trim()) {
        row.remove();
      }
    });
}

function updateInitialActItems(details: any[], works: any[]): void {
  globalCache.initialActItems = [
    ...details.map((d) => ({
      type: "detail" as const,
      name: d.Деталь,
      catalog: d.Каталог || "",
      quantity: d.Кількість,
      price: d.Ціна,
      sum: d.Сума,
      person_or_store: d.Магазин || "",
      sclad_id: d.sclad_id ?? null,
      slyusar_id: null,
    })),
    ...works.map((w) => ({
      type: "work" as const,
      name: w.Робота,
      catalog: w.Каталог || "",
      quantity: w.Кількість,
      price: w.Ціна,
      sum: w.Сума,
      person_or_store: w.Слюсар || "",
      sclad_id: null,
      slyusar_id: w.slyusar_id ?? null,
      slyusarSum: w.Зарплата || 0,
    })),
  ];
}

/* =============================== ЛОГУВАННЯ ЗМІН (НОВИЙ КОД) =============================== */

/**
 * Конвертує ActItem[] (з globalCache) в ParsedItem[] для порівняння
 */
function convertActItemsToParsedItems(items: ActItem[]): ParsedItem[] {
  return items.map((item) => ({
    type: item.type,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    sum: item.sum,
    pibMagazin: item.person_or_store || "",
    catalog: item.catalog || "",
    sclad_id: item.sclad_id ?? null,
    slyusar_id: item.slyusar_id ?? null,
    slyusarSum: 0, // ActItem не має цього поля, використовуємо 0
  }));
}

/**
 * Порівнює початкові та поточні елементи акту і повертає додані та видалені позиції
 */
function compareActChanges(
  initialItems: ActItem[],
  currentItems: ParsedItem[]
): { added: ParsedItem[]; deleted: ParsedItem[] } {
  // Конвертуємо ActItem[] в ParsedItem[] для порівняння
  const initialParsed = convertActItemsToParsedItems(initialItems);

  // Створюємо унікальний ключ для кожної позиції (тип + назва)
  const createKey = (item: ParsedItem) => `${item.type}:${item.name}`;

  // Створюємо мапи для швидкого пошуку
  const initialMap = new Map<string, ParsedItem>();
  const currentMap = new Map<string, ParsedItem>();

  initialParsed.forEach((item) => {
    initialMap.set(createKey(item), item);
  });

  currentItems.forEach((item) => {
    currentMap.set(createKey(item), item);
  });

  // Знаходимо додані позиції (є в current, немає в initial)
  const added: ParsedItem[] = [];
  currentItems.forEach((item) => {
    const key = createKey(item);
    if (!initialMap.has(key)) {
      added.push(item);
    }
  });

  // Знаходимо видалені позиції (є в initial, немає в current)
  const deleted: ParsedItem[] = [];
  initialParsed.forEach((item) => {
    const key = createKey(item);
    if (!currentMap.has(key)) {
      deleted.push(item);
    }
  });

  return { added, deleted };
}

/**
 * Записує зміни в таблицю act_changes_notifications
 */
async function logActChanges(
  actId: number,
  added: ParsedItem[],
  deleted: ParsedItem[]
): Promise<void> {
  // ⚠️ КРИТИЧНО: Перевірка ролі користувача
  console.log(
    `🔍 [logActChanges] Перевірка ролі користувача: "${userAccessLevel}"`
  );

  if (userAccessLevel === "Адміністратор") {
    console.log("⏭️ Адміністратор - логування змін пропущено");
    return;
  }

  console.log(
    `✅ [logActChanges] Користувач НЕ адміністратор - продовжуємо логування`
  );

  // ✅ ФУНКЦІЯ ВИЗНАЧЕННЯ АВТОРА ЗМІН
  const getChangeAuthor = (item: ParsedItem): string => {
    const currentUser = userName || "Невідомо";

    // 1. Якщо це ДЕТАЛЬ -> повертаємо того, хто зайшов (userName)
    if (item.type === "detail") {
      return currentUser;
    }

    // 2. Якщо це РОБОТА -> перевіряємо ПІБ_Магазин (це буде слюсар)
    if (item.type === "work") {
      const workerName = item.pibMagazin ? item.pibMagazin.trim() : "";
      // Якщо є ім'я слюсаря - беремо його, інакше - того, хто зайшов
      return workerName || currentUser;
    }

    // Fallback (на всяк випадок)
    return currentUser;
  };

  // ✅ ОТРИМАННЯ ПІБ КЛІЄНТА ТА АВТОМОБІЛЯ З DOM
  const getClientAndCarInfo = (): { pib: string; auto: string } => {
    let pib = "";
    let auto = "";

    // Шукаємо таблицю "left" де є клієнт
    const leftTable = document.querySelector("table.zakaz_narayd-table.left");
    if (leftTable) {
      const rows = leftTable.querySelectorAll("tr");
      rows.forEach((row) => {
        const label = row.querySelector("td:first-child")?.textContent?.trim();
        const value = row.querySelector("td:last-child")?.textContent?.trim();
        if (label === "Клієнт" && value) {
          pib = value;
        }
      });
    }

    // Шукаємо таблицю "right" де є автомобіль
    const rightTable = document.querySelector("table.zakaz_narayd-table.right");
    if (rightTable) {
      const rows = rightTable.querySelectorAll("tr");
      rows.forEach((row) => {
        const label = row.querySelector("td:first-child")?.textContent?.trim();
        const value = row.querySelector("td:last-child")?.textContent?.trim();
        if (label === "Автомобіль" && value) {
          auto = value;
        }
      });
    }

    console.log(`📋 Дані акту - Клієнт: "${pib}", Автомобіль: "${auto}"`);
    return { pib, auto };
  };

  const { pib, auto } = getClientAndCarInfo();

  const records: ActChangeRecord[] = [];

  // Додані позиції
  // Додані позиції (рядок 598-608)
  added.forEach((item) => {
    records.push({
      act_id: actId,
      item_name: item.name,
      cina: item.price,
      kilkist: item.quantity,
      zarplata: item.slyusarSum || 0,
      dodav_vudaluv: true,
      changed_by_surname: getChangeAuthor(item),
      delit: false, // ✅ За замовчуванням FALSE = показувати
      data: new Date().toISOString(),
      pib: pib || undefined, // ✅ ПІБ клієнта
      auto: auto || undefined, // ✅ Дані автомобіля
    });
  });

  // Видалені позиції (рядок 611-621)
  deleted.forEach((item) => {
    records.push({
      act_id: actId,
      item_name: item.name,
      cina: item.price,
      kilkist: item.quantity,
      zarplata: item.slyusarSum || 0,
      dodav_vudaluv: false,
      changed_by_surname: getChangeAuthor(item),
      delit: false, // ✅ За замовчуванням FALSE = показувати
      data: new Date().toISOString(),
      pib: pib || undefined, // ✅ ПІБ клієнта
      auto: auto || undefined, // ✅ Дані автомобіля
    });
  });

  if (records.length === 0) {
    console.log("📝 Змін не виявлено");
    return;
  }

  console.log(
    `📝 [logActChanges] Підготовлено ${records.length} записів для вставки:`,
    records
  );

  // 🔍 ДІАГНОСТИКА: Перевіряємо поточного користувача
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    console.error("❌ Помилка отримання користувача:", userError);
  } else {
    console.log(`👤 [logActChanges] Поточний користувач:`, {
      email: user?.email,
      id: user?.id,
      role: user?.role,
    });
  }

  // Запис в БД
  const { data: insertedData, error } = await supabase
    .from("act_changes_notifications")
    .insert(records)
    .select(); // ✅ Додано select() щоб побачити вставлені дані

  if (error) {
    console.error("❌ ПОМИЛКА ЗАПИСУ ЗМІН:", error);
    console.error("📋 Деталі помилки:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    console.error("📝 Записи що не вдалося вставити:", records);
    throw error;
  } else {
    console.log(`✅ Записано ${records.length} змін в БД (з клієнтом та авто)`);
    console.log(`✅ Вставлені записи:`, insertedData);
  }
}

/* =============================== ЗБЕРЕЖЕННЯ АКТУ =============================== */

async function saveActData(actId: number, originalActData: any): Promise<void> {
  if (globalCache.isActClosed) {
    throw new Error("Неможливо редагувати закритий акт");
  }

  // Завантажуємо закупівельні ціни перед обробкою
  await loadPurchasePrices();

  const probigText = cleanText(
    document.getElementById(EDITABLE_PROBIG_ID)?.textContent
  );
  const probigCleaned = probigText.replace(/\s/g, "");
  const newProbig =
    probigCleaned && /^\d+$/.test(probigCleaned)
      ? Number(probigCleaned)
      : probigCleaned || 0;

  const newReason =
    (
      document.getElementById(EDITABLE_REASON_ID) as HTMLElement
    )?.innerText?.trim() || "";
  const newRecommendations =
    (
      document.getElementById(EDITABLE_RECOMMENDATIONS_ID) as HTMLElement
    )?.innerText?.trim() || "";

  const items = parseTableRows();
  const {
    details,
    works,
    detailRowsForShops,
    workRowsForSlyusars,
    newScladIds,
    totalDetailsSum,
    totalWorksSum,
    grandTotalSum,
    totalWorksProfit,
    totalDetailsMargin,
  } = processItems(items);

  const avansInput = document.getElementById(
    "editable-avans"
  ) as HTMLInputElement;
  const avansValue = avansInput
    ? parseFloat(avansInput.value.replace(/\s/g, "") || "0")
    : 0;

  const updatedActData = {
    ...(originalActData || {}),
    Пробіг: newProbig,
    "Причина звернення": newReason,
    Рекомендації: newRecommendations,
    Деталі: details,
    Роботи: works,
    "За деталі": totalDetailsSum,
    "За роботу": totalWorksSum,
    "Загальна сума": grandTotalSum,
    Аванс: avansValue,
    "Прибуток за деталі": Number((totalDetailsMargin || 0).toFixed(2)),
    "Прибуток за роботу": Number((totalWorksProfit || 0).toFixed(2)),
  };

  const deltas = calculateDeltas();

  showNotification("Збереження змін...", "info");

  const { error: updateError } = await supabase
    .from("acts")
    .update({
      data: updatedActData,
      avans: avansValue,
    })
    .eq("act_id", actId);
  if (updateError) {
    throw new Error(`Не вдалося оновити акт: ${updateError.message}`);
  }

  await updateScladActNumbers(actId, newScladIds);
  await applyScladDeltas(deltas);
  await syncShopsOnActSave(actId, detailRowsForShops);
  await syncSlyusarsOnActSave(actId, workRowsForSlyusars);

  // ===== ЛОГУВАННЯ ЗМІН =====
  try {
    const currentItems = items;
    const { added, deleted } = compareActChanges(
      globalCache.initialActItems || [],
      currentItems
    );
    await logActChanges(actId, added, deleted);
  } catch (logError) {
    console.error("⚠️ Помилка логування змін:", logError);
    // Не блокуємо збереження через помилку логування
  }
  // =====================================

  globalCache.oldNumbers = readTableNewNumbers();
  updateInitialActItems(details, works);

  await Promise.all([
    loadGlobalData(),
    refreshQtyWarningsIn(ACT_ITEMS_TABLE_CONTAINER_ID),
    cleanupEmptyRows(),
  ]);

  updateCalculatedSumsInFooter();
  refreshActsTable();
}

export function addSaveHandler(actId: number, originalActData: any): void {
  const saveButton = document.getElementById(
    ZAKAZ_NARAYD_SAVE_BTN_ID
  ) as HTMLButtonElement | null;
  if (!saveButton) return;

  const newSaveButton = saveButton.cloneNode(true) as HTMLButtonElement;
  saveButton.parentNode?.replaceChild(newSaveButton, saveButton);

  newSaveButton.addEventListener("click", async () => {
    try {
      await saveActData(actId, originalActData);
      showNotification("Зміни успішно збережено", "success");
    } catch (err: any) {
      console.error("Помилка збереження:", err);
      showNotification(
        `Помилка збереження даних: ${err?.message || err}`,
        "error"
      );
    }
  });
}
