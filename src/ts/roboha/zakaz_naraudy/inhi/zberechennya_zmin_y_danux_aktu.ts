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
import {
  userAccessLevel,
  userName,
  getSavedUserDataFromLocalStorage,
} from "../../tablucya/users";

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
  pruimalnyk?: string; // ✅ ПІБ приймальника з таблиці acts
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
      const purchasePrice = getPurchasePrice(sclad_id) || 0; // ✅ Якщо немає вхідної ціни, беремо 0
      const margin = (price - purchasePrice) * quantity; // ✅ Рахуємо маржу навіть якщо purchasePrice = 0

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
    slyusarSum: item.slyusarSum || 0, // ✅ Використовуємо slyusarSum з ActItem
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

  console.log(
    `🔍 [compareActChanges] Початкові елементи (${initialParsed.length}):`,
    initialParsed
  );
  console.log(
    `🔍 [compareActChanges] Поточні елементи (${currentItems.length}):`,
    currentItems
  );

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
      console.log(`➕ [compareActChanges] Додано: ${key}`, item);
    }
  });

  // Знаходимо видалені позиції (є в initial, немає в current)
  const deleted: ParsedItem[] = [];
  initialParsed.forEach((item) => {
    const key = createKey(item);
    if (!currentMap.has(key)) {
      deleted.push(item);
      console.log(`➖ [compareActChanges] Видалено: ${key}`, item);
    }
  });

  console.log(
    `📊 [compareActChanges] Результат: додано ${added.length}, видалено ${deleted.length}`
  );

  return { added, deleted };
}

/**
 * Записує зміни в таблицю act_changes_notifications
 * ЛОГІКА:
 * - Записуємо ТІЛЬКИ якщо це Слюсар, Запчастист, Складовщик
 * - НЕ записуємо якщо це Приймальник або Адміністратор
 * - Зберігаємо pruimalnyk з таблиці acts для фільтрації повідомлень
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

  // ✅ Записуємо зміни ТІЛЬКИ для Слюсаря, Запчастиста, Складовщика
  const allowedRoles = ["Слюсар", "Запчастист", "Складовщик"];
  if (!userAccessLevel || !allowedRoles.includes(userAccessLevel)) {
    console.log(
      `⏭️ Користувач ${userAccessLevel} - логування змін пропущено (записуємо тільки для Слюсар/Запчастист/Складовщик)`
    );
    return;
  }

  console.log(
    `✅ [logActChanges] Користувач ${userAccessLevel} - продовжуємо логування`
  );

  // ✅ ОТРИМУЄМО ПРИЙМАЛЬНИКА З БД (acts.pruimalnyk)
  let pruimalnykFromDb: string | undefined;
  try {
    const { data: actData, error: actError } = await supabase
      .from("acts")
      .select("pruimalnyk")
      .eq("act_id", actId)
      .single();

    if (actError) {
      console.error("❌ Помилка отримання pruimalnyk з acts:", actError);
    } else if (actData?.pruimalnyk) {
      pruimalnykFromDb = actData.pruimalnyk;
      console.log(`📋 [logActChanges] Приймальник з БД: "${pruimalnykFromDb}"`);
    }
  } catch (err) {
    console.error("❌ Виняток при отриманні pruimalnyk:", err);
  }

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
  const { pib, auto } = getClientAndCarInfo();

  // ✅ ВИКОРИСТОВУЄМО ПРИЙМАЛЬНИКА З БД (отриманого вище)
  const pruimalnyk = pruimalnykFromDb;
  console.log(`📋 [logActChanges] Приймальник з БД: "${pruimalnyk}"`);

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
      pruimalnyk: pruimalnyk, // ✅ ПІБ приймальника з acts.pruimalnyk
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
      pruimalnyk: pruimalnyk, // ✅ ПІБ приймальника з acts
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

/**
 * Отримує ПІБ клієнта та Авто з DOM
 */
function getClientAndCarInfo(): { pib: string; auto: string } {
  let pib = "";
  let auto = "";

  const leftTable = document.querySelector("table.zakaz_narayd-table.left");
  if (leftTable) {
    const rows = leftTable.querySelectorAll("tr");
    rows.forEach((row) => {
      const label = row.querySelector("td:first-child")?.textContent?.trim();
      const value = row.querySelector("td:last-child")?.textContent?.trim();
      if (label === "Клієнт" && value) pib = value;
    });
  }

  const rightTable = document.querySelector("table.zakaz_narayd-table.right");
  if (rightTable) {
    const rows = rightTable.querySelectorAll("tr");
    rows.forEach((row) => {
      const label = row.querySelector("td:first-child")?.textContent?.trim();
      const value = row.querySelector("td:last-child")?.textContent?.trim();
      if (label === "Автомобіль" && value) auto = value;
    });
  }
  return { pib, auto };
}

/**
 * Синхронізує історію акту для Приймальника
 * НОВА ЛОГІКА:
 * - Якщо зберігає Приймальник → оновлюємо його історію
 * - Якщо зберігає НЕ Приймальник → шукаємо останнього приймальника з acts.pruimalnyk і оновлюємо його історію
 */
async function syncPruimalnikHistory(
  actId: number,
  _totalWorksSumIgnored: number,
  _totalDetailsSumIgnored: number,
  actDateOn: string | null = null
): Promise<void> {
  console.log(
    `\n🔄 syncPruimalnikHistory: Початок синхронізації для акту #${actId}`
  );
  console.log(
    `👤 Поточний користувач: "${userName}" (рівень доступу: "${userAccessLevel}")`
  );

  // ✅ Визначаємо ПІБ приймальника
  let pruimalnykName: string;

  if (userAccessLevel === "Приймальник") {
    // Якщо зберігає Приймальник - беремо його ПІБ
    const userData = getSavedUserDataFromLocalStorage?.();
    if (!userData || !userData.name) {
      console.warn("⚠️ Не вдалося отримати дані Приймальника з localStorage");
      return;
    }
    pruimalnykName = userData.name;
    console.log(
      `✅ Зберігає Приймальник "${pruimalnykName}" - оновлюємо його історію`
    );
  } else {
    // Якщо зберігає НЕ Приймальник - шукаємо останнього приймальника з acts.pruimalnyk
    const { data: actData, error: actError } = await supabase
      .from("acts")
      .select("pruimalnyk")
      .eq("act_id", actId)
      .single();

    if (actError || !actData || !actData.pruimalnyk) {
      console.warn(
        `⚠️ syncPruimalnikHistory: Не вдалося отримати pruimalnyk для акту #${actId}. Користувач "${userName}" НЕ Приймальник - історія НЕ оновлюється`
      );
      return;
    }

    pruimalnykName = actData.pruimalnyk;
    console.log(
      `✅ Зберігає "${userName}" (${userAccessLevel}) - оновлюємо історію приймальника "${pruimalnykName}"`
    );
  }

  console.log(
    `🔍 syncPruimalnikHistory: Обробка для приймальника "${pruimalnykName}" (акт #${actId})`
  );

  // --- ЗБІР ДАНИХ З DOM ---
  const tableBody = document.querySelector<HTMLTableSectionElement>(
    "#act-items-table-container tbody"
  );

  if (!tableBody) {
    console.error("❌ syncPruimalnikHistory: Таблиця не знайдена");
    return;
  }

  let worksTotalSale = 0;
  let worksTotalSlusarSalary = 0;

  let partsTotalSale = 0;
  // Масив для деталей: { scladId, qty, totalSale }
  const partsList: { scladId: number | null; qty: number; sale: number }[] = [];

  const rows = Array.from(tableBody.querySelectorAll("tr"));

  // Хелпер
  const parseNum = (str: string | null | undefined) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^\d.-]/g, "")) || 0;
  };

  rows.forEach((row) => {
    const nameCell = row.querySelector('[data-name="name"]');
    const dataType = nameCell?.getAttribute("data-type");

    const sumCell = row.querySelector('[data-name="sum"]');
    const sumValue = parseNum(sumCell?.textContent);

    // РОБОТА
    if (dataType === "works") {
      const slusarSumCell = row.querySelector('[data-name="slyusar_sum"]');
      const slusarSalary = parseNum(slusarSumCell?.textContent);

      worksTotalSale += sumValue;
      worksTotalSlusarSalary += slusarSalary;

      console.log(`🛠️ Робота: Sale=${sumValue}, Salary=${slusarSalary}`);
    }
    // ДЕТАЛІ
    else if (dataType === "details") {
      const catalogCell = row.querySelector('[data-name="catalog"]');
      const scladIdStr = catalogCell?.getAttribute("data-sclad-id");
      const scladId = scladIdStr ? parseInt(scladIdStr) : null;

      const qtyCell = row.querySelector('[data-name="id_count"]');
      const qty = parseNum(qtyCell?.textContent);

      partsTotalSale += sumValue;
      partsList.push({ scladId, qty, sale: sumValue });

      console.log(
        `⚙️ Деталь: scladId=${scladId}, Qty=${qty}, Sale=${sumValue}`
      );
    }
  });

  console.log("📊 Підсумки збору даних:", {
    worksTotalSale,
    worksTotalSlusarSalary,
    partsTotalSale,
    partsListLength: partsList.length,
    partsList,
  });

  // --- ОТРИМАННЯ ВХІДНИХ ЦІН ---
  let partsTotalBuy = 0;
  const scladIdsToFetch = partsList
    .map((p) => p.scladId)
    .filter((id): id is number => id !== null && !isNaN(id));

  console.log("🔍 ID для запиту до sclad:", scladIdsToFetch);

  if (scladIdsToFetch.length > 0) {
    const { data: scladItems, error: scladError } = await supabase
      .from("sclad")
      .select("sclad_id, price")
      .in("sclad_id", scladIdsToFetch);

    console.log("📦 Відповідь від sclad:", { scladItems, scladError });

    if (scladError) {
      console.error(
        "❌ syncPruimalnikHistory: Помилка отримання цін sclad:",
        scladError
      );
    } else if (scladItems) {
      // Створюємо мапу цін: id -> price
      const priceMap = new Map<number, number>();
      scladItems.forEach((item) => {
        // Парсимо ціну (якщо рядок "938,00" або число 938)
        let val = 0;
        if (typeof item.price === "number") {
          val = item.price;
        } else {
          // Якщо рядок або щось інше
          val =
            parseFloat(
              String(item.price)
                .replace(",", ".")
                .replace(/[^\d.-]/g, "")
            ) || 0;
        }
        priceMap.set(item.sclad_id, val);
      });

      // Рахуємо суму закупки
      partsList.forEach((part) => {
        if (part.scladId && priceMap.has(part.scladId)) {
          const buyPrice = priceMap.get(part.scladId) || 0;
          partsTotalBuy += buyPrice * part.qty;
          console.log(
            `🛒 Деталь ID=${part.scladId}: Qty=${
              part.qty
            }, BuyPrice=${buyPrice}, TotalBuy=${buyPrice * part.qty}`
          );
        } else {
          console.log(
            `ℹ️ Не знайдено вхідну ціну для sclad_id=${part.scladId}, беремо 0 (Вхідна ціна не враховується)`
          );
        }
      });
    }
  }

  // --- РОЗРАХУНОК БАЗ ТА ЗАРПЛАТ ---

  // 1. Робота: (Сума Продажу - Зарплата Слюсаря)
  const baseWorkProfit = worksTotalSale - worksTotalSlusarSalary;

  // 2. Запчастини: (Сума Продажу - Сума Закупки)
  const basePartsProfit = partsTotalSale - partsTotalBuy;

  // --- ОТРИМАННЯ ДАНИХ ПРИЙМАЛЬНИКА З БД ---
  const { data: userDataArray, error } = await supabase
    .from("slyusars")
    .select("*")
    .eq("data->>Name", pruimalnykName); // ✅ Шукаємо по ПІБ з pruimalnyk

  if (error || !userDataArray || userDataArray.length === 0) {
    console.error(
      `❌ syncPruimalnikHistory: Помилка пошуку приймальника "${pruimalnykName}":`,
      error
    );
    return;
  }

  // Якщо кількох користувачів з однаковим іменем, беремо першого
  const userData = userDataArray[0];

  const slyusarData =
    typeof userData.data === "string"
      ? JSON.parse(userData.data)
      : userData.data;

  // Додаткова перевірка ролі в базі
  if (slyusarData.Доступ !== "Приймальник") {
    console.warn(
      "⚠️ syncPruimalnikHistory: Користувач не є Приймальником в базі"
    );
    return;
  }

  const percentWork = Number(slyusarData.ПроцентРоботи) || 0;
  const percentParts = Number(slyusarData.ПроцентЗапчастин) || 0;

  const salaryWork = Math.round(baseWorkProfit * (percentWork / 100));
  const salaryParts = Math.round(basePartsProfit * (percentParts / 100));

  console.log("📊 Розрахунок ЗП Приймальника:", {
    worksTotalSale,
    worksTotalSlusarSalary,
    baseWorkProfit,
    salaryWork,
    partsTotalSale,
    partsTotalBuy,
    basePartsProfit,
    salaryParts,
  });

  // ДЕБАГ для акту 34
  if (actId === 34) {
    console.log(`🔍 [DEBUG] Акт 34 - ЗБЕРЕЖЕННЯ В ІСТОРІЮ:`, {
      baseWorkProfit,
      salaryWork,
      basePartsProfit,
      salaryParts,
    });
  }

  // --- ВИДАЛЕННЯ АКТУ З ІНШИХ ПРИЙМАЛЬНИКІВ ---
  console.log(`🧹 Очищення акту #${actId} з історії інших Приймальників...`);

  // Отримуємо всіх Приймальників
  const { data: allReceivers, error: receiversError } = await supabase
    .from("slyusars")
    .select("slyusar_id, data")
    .neq("slyusar_id", userData.slyusar_id); // Виключаємо поточного користувача

  if (receiversError) {
    console.error("❌ Помилка отримання списку Приймальників:", receiversError);
  } else if (allReceivers && allReceivers.length > 0) {
    for (const receiver of allReceivers) {
      const receiverData =
        typeof receiver.data === "string"
          ? JSON.parse(receiver.data)
          : receiver.data;

      // Перевіряємо, чи це Приймальник
      if (receiverData.Доступ !== "Приймальник") continue;

      let receiverHistory = receiverData.Історія || {};
      let wasModified = false;

      // Шукаємо і видаляємо акт з історії
      for (const dateKey of Object.keys(receiverHistory)) {
        const dailyActs = receiverHistory[dateKey];
        if (Array.isArray(dailyActs)) {
          const idx = dailyActs.findIndex(
            (item: any) => String(item.Акт) === String(actId)
          );
          if (idx !== -1) {
            console.log(
              `🗑️ Видалено акт #${actId} з історії "${receiverData.Name}" (дата: ${dateKey})`
            );
            dailyActs.splice(idx, 1);

            // Якщо масив порожній, видаляємо дату
            if (dailyActs.length === 0) {
              delete receiverHistory[dateKey];
            }

            wasModified = true;
            break;
          }
        }
      }

      // Оновлюємо в БД, якщо були зміни
      if (wasModified) {
        receiverData.Історія = receiverHistory;
        const { error: updateError } = await supabase
          .from("slyusars")
          .update({ data: receiverData })
          .eq("slyusar_id", receiver.slyusar_id);

        if (updateError) {
          console.error(
            `❌ Помилка оновлення історії для "${receiverData.Name}":`,
            updateError
          );
        } else {
          console.log(`✅ Історію "${receiverData.Name}" оновлено`);
        }
      }
    }
  }

  console.log(`✅ Очищення завершено. Зберігаємо акт для "${pruimalnykName}"`);

  let history = slyusarData.Історія || {};
  let actFound = false;
  let foundDateKey = "";
  let foundIndex = -1;

  // 3. Шукаємо існуючий запис акту в історії
  for (const dateKey of Object.keys(history)) {
    const dailyActs = history[dateKey];
    if (Array.isArray(dailyActs)) {
      const idx = dailyActs.findIndex(
        (item: any) => String(item.Акт) === String(actId)
      );
      if (idx !== -1) {
        actFound = true;
        foundDateKey = dateKey;
        foundIndex = idx;
        break;
      }
    }
  }

  const { pib, auto } = getClientAndCarInfo();

  const actRecordUpdate = {
    Акт: String(actId),
    Клієнт: pib,
    Автомобіль: auto,
    СуммаРоботи: baseWorkProfit, // ТУТ ТЕПЕР ЧИСТИЙ ПРИБУТОК (після відрахування зарплати слюсаря)
    СуммаЗапчастин: basePartsProfit, // ТУТ ТЕПЕР ЧИСТИЙ ПРИБУТОК (після відрахування вхідної ціни)
    ЗарплатаРоботи: salaryWork,
    ЗарплатаЗапчастин: salaryParts,
    ДатаЗакриття: null, // Буде заповнено при закритті акту
  };

  if (actFound) {
    console.log(
      `📝 syncPruimalnikHistory: Оновлення існуючого запису акту #${actId}`
    );
    const oldRecord = history[foundDateKey][foundIndex];
    history[foundDateKey][foundIndex] = { ...oldRecord, ...actRecordUpdate };
  } else {
    console.log(
      `➕ syncPruimalnikHistory: Створення нового запису акту #${actId}`
    );
    // Використовуємо дату створення акту, а не поточну дату
    const actDate = actDateOn
      ? actDateOn.split("T")[0]
      : new Date().toISOString().split("T")[0];
    if (!history[actDate]) {
      history[actDate] = [];
    }
    history[actDate].push(actRecordUpdate);
  }

  // 4. Зберігаємо оновлену історію в БД
  slyusarData.Історія = history;

  const { error: updateError } = await supabase
    .from("slyusars")
    .update({ data: slyusarData })
    .eq("slyusar_id", userData.slyusar_id);

  if (updateError) {
    console.error(
      "❌ syncPruimalnikHistory: Помилка оновлення історії:",
      updateError
    );
  } else {
    console.log("✅ syncPruimalnikHistory: Історія успішно оновлена");
  }
}

/* =============================== ЗБЕРЕЖЕННЯ АКТУ =============================== */

/**
 * Записує інформацію про приймальника в таблицю acts
 * ТІЛЬКИ для користувачів з рівнем доступу "Приймальник"
 * @param actId - ID акту
 */
async function savePruimalnykToActs(actId: number): Promise<void> {
  try {
    // ✅ Перевірка рівня доступу - записуємо ТІЛЬКИ для Приймальника
    if (userAccessLevel !== "Приймальник") {
      console.log(
        `ℹ️ Користувач "${userName}" має рівень доступу "${userAccessLevel}" - pruimalnyk НЕ перезаписується`
      );
      return;
    }

    const userData = getSavedUserDataFromLocalStorage?.();
    if (!userData || !userData.name) {
      console.warn("⚠️ Не вдалося отримати дані користувача з localStorage");
      return;
    }

    // Завжди записуємо приймальника (незалежно від isNewAct)
    const updateData = {
      pruimalnyk: userData.name,
    };

    const { error } = await supabase
      .from("acts")
      .update(updateData)
      .eq("act_id", actId);

    if (error) {
      console.error(
        `❌ Помилка при записуванні приймальника: ${error.message}`
      );
    } else {
      console.log(
        `✅ Приймальник "${userData.name}" успішно записаний в акт ${actId}`
      );
    }
  } catch (err: any) {
    console.error("❌ Помилка savePruimalnykToActs:", err?.message || err);
  }
}

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

  const discountInput = document.getElementById(
    "editable-discount"
  ) as HTMLInputElement;
  const discountValue = discountInput
    ? parseFloat(discountInput.value.replace(/\s/g, "") || "0")
    : 0;

  // Отримуємо суму знижки в гривнях
  const discountAmountInput = document.getElementById(
    "editable-discount-amount"
  ) as HTMLInputElement;
  const discountAmountValue = discountAmountInput
    ? parseFloat(discountAmountInput.value.replace(/\s/g, "") || "0")
    : 0;

  // Розподіляємо знижку пропорційно між прибутком деталей та робіт
  // Знижка розподіляється пропорційно до повних сум (За деталі / За роботу)
  let finalDetailsProfit = totalDetailsMargin || 0;
  let finalWorksProfit = totalWorksProfit || 0;

  if (discountAmountValue > 0 && globalCache.settings.saveMargins) {
    const totalSum = totalDetailsSum + totalWorksSum;
    if (totalSum > 0) {
      // Розподіляємо знижку пропорційно до повних сум
      const detailsPart = (totalDetailsSum / totalSum) * discountAmountValue;
      const worksPart = (totalWorksSum / totalSum) * discountAmountValue;
      finalDetailsProfit -= detailsPart;
      finalWorksProfit -= worksPart;
    }
  }

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
    Знижка: discountValue,
    СумаЗнижки: discountAmountValue,
    "Прибуток за деталі": globalCache.settings.saveMargins
      ? Number(finalDetailsProfit.toFixed(2))
      : 0,
    "Прибуток за роботу": globalCache.settings.saveMargins
      ? Number(finalWorksProfit.toFixed(2))
      : 0,
  };

  const deltas = calculateDeltas();

  showNotification("Збереження змін...", "info");

  // 💾 Збереження даних акту (тільки JSONB, без окремих колонок)
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

  // ✅ Записуємо інформацію про приймальника
  await savePruimalnykToActs(actId);

  await updateScladActNumbers(actId, newScladIds);
  await applyScladDeltas(deltas);
  await syncShopsOnActSave(actId, detailRowsForShops);

  if (globalCache.settings.saveMargins) {
    await syncSlyusarsOnActSave(actId, workRowsForSlyusars);
    await syncPruimalnikHistory(
      actId,
      totalWorksSum,
      totalDetailsSum,
      globalCache.currentActDateOn
    );
  } else {
    console.log(
      "ℹ️ saveMargins = false: Синхронізація зарплат слюсарів та приймальників пропущена"
    );
  }

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
