// src/ts/roboha/zakaz_naraudy/globalCache.ts
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "./inhi/vspluvauhe_povidomlenna";
import { safeParseJSON } from "./inhi/ctvorennia_papku_googleDrive.";

/* ========= helpers: robust JSON unwrapping & name extraction ========= */

/** Розпаковує значення, якщо воно може бути JSON або "JSON у рядку".
 *  Пробуємо до 2-х рівнів: рядок → JSON, а якщо вийшов знову рядок з JSON — ще раз.
 */
function unwrapPossiblyDoubleEncodedJSON<T = any>(input: unknown): T | null {
  if (input == null) return null as any;

  let v: unknown = input;
  for (let i = 0; i < 2; i++) {
    if (typeof v === "string") {
      const t = v.trim();
      const looksLikeJson =
        (t.startsWith("{") && t.endsWith("}")) ||
        (t.startsWith("[") && t.endsWith("]"));
      if (looksLikeJson) {
        try {
          v = JSON.parse(t);
          continue; // спробуємо ще раз, якщо знову рядок з JSON
        } catch {
          // якщо не розпарсився — виходимо
        }
      }
    }
    break;
  }
  return v as T;
}

/** Дістає назву магазину з будь-якої форми: об’єкт {Name}, рядок з JSON, або просто рядок. */
function extractShopNameFromAny(raw: unknown): string | null {
  if (raw == null) return null;

  // 1) спершу розпакуємо можливий подвійнозакодований JSON
  const unwrapped = unwrapPossiblyDoubleEncodedJSON<any>(raw);

  // 2) якщо після розпаковки маємо об'єкт з Name — беремо його
  if (unwrapped && typeof unwrapped === "object" && "Name" in unwrapped) {
    const nm = String((unwrapped as any).Name ?? "").trim();
    return nm || null;
  }

  // 3) якщо це рядок — або це вже чиста назва, або «сирий» рядок
  if (typeof unwrapped === "string") {
    const s = unwrapped.trim();
    if (!s) return null;

    // раптом це ще один рівень JSON з Name
    const maybeObj = unwrapPossiblyDoubleEncodedJSON<any>(s);
    if (maybeObj && typeof maybeObj === "object" && "Name" in maybeObj) {
      const nm = String(maybeObj.Name ?? "").trim();
      return nm || null;
    }

    // інакше вважаємо, що це готова назва
    return s;
  }

  return null;
}

/* ===================== інтерфейси ===================== */

export interface SkladLiteRow {
  sclad_id: number;
  part_number: string;
  kilkist_on: number;
  kilkist_off: number;
  diff: number; // kilkist_off - kilkist_on
}

export interface ActItem {
  type: "detail" | "work";
  name: string;
  catalog: string;
  quantity: number;
  price: number;
  sum: number;
  person_or_store: string;
  sclad_id?: number | null;
  slyusar_id?: number | null;
  slyusarSum?: number; // ✅ Додано для зарплати слюсаря
}

export interface GlobalDataCache {
  works: string[];
  worksWithId: Array<{ work_id: string; name: string }>;
  details: string[];
  slyusars: Array<{ Name: string;[k: string]: any }>;
  shops: Array<{ Name: string;[k: string]: any }>;
  settings: {
    showPibMagazin: boolean;
    showCatalog: boolean;
    showZarplata: boolean; // ← ДОДАНО
    showSMS: boolean; // ← ДОДАНО
    preferredLanguage: "uk" | "en"; // ← ДОДАНО: мова інтерфейсу
    saveMargins: boolean; // ← ДОДАНО: чи зберігати маржу та зарплати (row 6)
  };
  isActClosed: boolean;
  currentActId: number | null;
  currentActDateOn: string | null;
  skladParts: Array<{
    sclad_id: number;
    part_number: string;
    name: string;
    price: number;
    kilkist_on: number;
    kilkist_off: number;
    quantity: number;
    unit?: string | null;
    shop?: string | null;
    time_on?: string | null;
  }>;
  skladLite: SkladLiteRow[];
  oldNumbers: Map<number, number>;
  initialActItems: ActItem[];
}

export const globalCache: GlobalDataCache = {
  works: [],
  worksWithId: [],
  details: [],
  slyusars: [],
  shops: [],
  settings: {
    showPibMagazin: true,
    showCatalog: true,
    showZarplata: true, // ← ДОДАНО
    showSMS: false, // ← ДОДАНО
    preferredLanguage: "uk", // ← ДОДАНО: типово українська
    saveMargins: true, // ← ДОДАНО: типово зберігаємо
  },
  isActClosed: false,
  currentActId: null,
  currentActDateOn: null,
  skladParts: [],
  skladLite: [],
  oldNumbers: new Map<number, number>(),
  initialActItems: [],
};

export const ZAKAZ_NARAYD_MODAL_ID = "zakaz_narayd-custom-modal";
export const ZAKAZ_NARAYD_BODY_ID = "zakaz_narayd-body";
export const ZAKAZ_NARAYD_CLOSE_BTN_ID = "zakaz_narayd-close";
export const ZAKAZ_NARAYD_SAVE_BTN_ID = "save-act-data";
export const EDITABLE_PROBIG_ID = "editable-probig";
export const EDITABLE_REASON_ID = "editable-reason";
export const EDITABLE_RECOMMENDATIONS_ID = "editable-recommendations";
export const OPEN_GOOGLE_DRIVE_FOLDER_ID = "open-google-drive-folder";
export const ACT_ITEMS_TABLE_CONTAINER_ID = "act-items-table-container";

/* ===================== утиліти ===================== */

export function formatNumberWithSpaces(
  value: number | string | undefined | null,
  minimumFractionDigits: number = 0,
  maximumFractionDigits: number = 2
): string {
  if (value === undefined || value === null || String(value).trim() === "")
    return "";
  const num = parseFloat(String(value).replace(",", "."));
  if (isNaN(num)) return String(value);
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num);
}

function dedupeSklad<
  T extends { part_number: string; price: number; quantity: number }
>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = `${r.part_number.toLowerCase()}|${Math.round(r.price)}|${r.quantity
      }`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/* ===================== завантаження кеша ===================== */

/**
 * Завантажує всі дані з таблиці з пагінацією (обхід ліміту 1000 записів Supabase)
 */
async function fetchAllWithPagination<T>(
  tableName: string,
  selectFields: string,
  orderBy?: string
): Promise<T[]> {
  const allData: T[] = [];
  let from = 0;
  const step = 1000;
  let keepFetching = true;

  while (keepFetching) {
    let query = supabase
      .from(tableName)
      .select(selectFields)
      .range(from, from + step - 1);
    
    if (orderBy) {
      query = query.order(orderBy, { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      console.error(`❌ Помилка завантаження ${tableName}:`, error.message);
      break;
    }

    if (data && data.length > 0) {
      allData.push(...(data as T[]));
      if (data.length < step) {
        keepFetching = false;
      } else {
        from += step;
      }
    } else {
      keepFetching = false;
    }
  }

  return allData;
}

export async function loadGlobalData(): Promise<void> {
  try {
    // ✅ ВИПРАВЛЕНО: Використовуємо пагінацію для завантаження ВСІХ робіт
    const worksData = await fetchAllWithPagination<{ work_id: number; data: string }>(
      "works",
      "work_id, data",
      "work_id"
    );

    // ✅ ВИПРАВЛЕНО: Використовуємо пагінацію для завантаження ВСІХ деталей зі складу
    const skladRows = await fetchAllWithPagination<{
      sclad_id: number;
      part_number: string;
      name: string;
      price: number;
      kilkist_on: number;
      kilkist_off: number;
      unit_measurement: string | null;
      shops: any;
      time_on: string | null;
    }>(
      "sclad",
      "sclad_id, part_number, name, price, kilkist_on, kilkist_off, unit_measurement, shops, time_on",
      "sclad_id"
    );

    // ✅ ВИПРАВЛЕНО: Використовуємо пагінацію для завантаження ВСІХ деталей
    const detailsData = await fetchAllWithPagination<{ data: string }>(
      "details",
      "data",
      "detail_id"
    );

    const [
      { data: slyusarsData },
      { data: shopsData },
    ] = await Promise.all([
      supabase.from("slyusars").select("data"),
      supabase.from("shops").select("data"),
    ]);

    const { data: settingsRows } = await supabase
      .from("settings")
      .select("setting_id, data");
    const settingShop = settingsRows?.find((s: any) => s.setting_id === 1);
    const settingCatalog = settingsRows?.find((s: any) => s.setting_id === 2);
    const settingZarplata = settingsRows?.find((s: any) => s.setting_id === 3);
    const settingSMS = settingsRows?.find((s: any) => s.setting_id === 5);

    console.log(`✅ Завантажено складу: ${skladRows.length} записів`);

    // ========== ВИПРАВЛЕНО: works і details - TEXT колонка, просто рядки ==========
    globalCache.worksWithId =
      worksData?.map((r: any) => ({
        work_id: String(r.work_id || ""),
        name: String(r.data || "").trim(),
      })) || [];

    globalCache.works = globalCache.worksWithId
      .map((w) => w.name)
      .filter(Boolean);

    globalCache.details =
      detailsData
        ?.map((r: any) => {
          // r.data - це просто текстовий рядок
          const text = String(r.data || "").trim();
          return text;
        })
        .filter(Boolean) || [];

    console.log(
      `✅ Завантажено - Робіт: ${globalCache.works.length}, Деталей: ${globalCache.details.length}`
    );

    // слюсарі: нормально парсимо, як і раніше
    globalCache.slyusars =
      slyusarsData
        ?.map((r: any) => {
          const d = safeParseJSON(r.data);
          return d?.Name ? d : null;
        })
        .filter(Boolean) || [];

    // магазини: ТЕПЕР витягуємо Name і з об'єктів, і з подвійно-JSON-рядків, і з «просто рядка»
    const shopsParsed: Array<{ Name: string;[k: string]: any }> = [];
    for (const row of shopsData || []) {
      let raw = row?.data;

      // спершу пробуємо звичний safeParseJSON
      let d = safeParseJSON(raw);

      // якщо safeParseJSON дав рядок — спробуємо розпакувати ще раз
      if (typeof d === "string") {
        d = unwrapPossiblyDoubleEncodedJSON(d);
      }

      // дістаємо назву
      const name = extractShopNameFromAny(d) ?? extractShopNameFromAny(raw);

      if (name) {
        // залишимо мінімальний об'єкт магазину
        shopsParsed.push({ Name: name });
      }
    }

    // алфавітне сортування UA (без урахування регістру)
    globalCache.shops = shopsParsed.sort((a, b) =>
      a.Name.localeCompare(b.Name, "uk", { sensitivity: "base" })
    );

    globalCache.settings = {
      showPibMagazin: !!settingShop?.data,
      showCatalog: !!settingCatalog?.data,
      showZarplata: !!settingZarplata?.data,
      showSMS: !!settingSMS?.data,
      preferredLanguage: "uk", // Типово українська
      saveMargins: true, // ✅ Завжди TRUE (більше не залежить від setting_id=6)
    };

    // склад: також нормалізуємо поле shop (shops)
    const mapped =
      (skladRows || []).map((r: any) => {
        const on = Number(r.kilkist_on ?? 0);
        const off = Number(r.kilkist_off ?? 0);
        const shopName = extractShopNameFromAny(r.shops);
        return {
          sclad_id: Number(r.sclad_id ?? 0),
          part_number: String(r.part_number || "").trim(),
          name: String(r.name || "").trim(),
          price: Number(r.price ?? 0),
          kilkist_on: on,
          kilkist_off: off,
          quantity: on - off,
          unit: r.unit_measurement ?? null,
          shop: shopName, // ← ТЕПЕР завжди чиста назва або null
          time_on: r.time_on ?? null,
        };
      }) || [];

    globalCache.skladParts = dedupeSklad(mapped);
  } catch (error) {
    console.error("❌ Помилка завантаження глобальних даних:", error);
    showNotification("Помилка завантаження базових даних", "error");
  }
}

export async function loadSkladLite(): Promise<void> {
  try {
    // ✅ ВИПРАВЛЕНО: Використовуємо пагінацію для завантаження ВСІХ записів
    const data = await fetchAllWithPagination<{
      sclad_id: number;
      part_number: string;
      kilkist_on: number;
      kilkist_off: number;
    }>(
      "sclad",
      "sclad_id, part_number, kilkist_on, kilkist_off",
      "sclad_id"
    );

    globalCache.skladLite = data.map((r: any): SkladLiteRow => {
      const on = Number(r.kilkist_on ?? 0);
      const off = Number(r.kilkist_off ?? 0);
      return {
        sclad_id: Number(r.sclad_id ?? 0),
        part_number: String(r.part_number || "").trim(),
        kilkist_on: on,
        kilkist_off: off,
        diff: off - on,
      };
    });
    
    console.log(`✅ loadSkladLite: завантажено ${globalCache.skladLite.length} записів`);
  } catch (e) {
    console.error("💥 loadSkladLite(): критична помилка:", e);
    globalCache.skladLite = [];
  }
}

/* ===================== пошук у складі ===================== */

export function findScladItemByPart(part: string) {
  const pn = String(part || "")
    .trim()
    .toLowerCase();
  return (
    globalCache.skladParts.find((x) => x.part_number.toLowerCase() === pn) ||
    null
  );
}

export function findScladItemsByName(name: string) {
  const q = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!q) return [];
  const tokens = q.split(" ").filter(Boolean);
  return globalCache.skladParts.filter((x) => {
    const nm = (x.name || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!nm) return false;
    if (nm.includes(q)) return true;
    return tokens.every((t) => nm.includes(t));
  });
}

export async function ensureSkladLoaded(): Promise<void> {
  if (globalCache.skladParts.length > 0) return;
  const { data, error } = await supabase
    .from("sclad")
    .select(
      "sclad_id, part_number, name, price, kilkist_on, kilkist_off, unit_measurement, shops, time_on"
    )
    .order("sclad_id", { ascending: false });
  if (error) {
    console.warn(
      "⚠️ ensureSkladLoaded(): не вдалося отримати sclad:",
      error.message
    );
    return;
  }
  const mapped =
    (data || []).map((r: any) => {
      const on = Number(r.kilkist_on ?? 0);
      const off = Number(r.kilkist_off ?? 0);
      const shopName = extractShopNameFromAny(r.shops);
      return {
        sclad_id: Number(r.sclad_id ?? 0),
        part_number: String(r.part_number || "").trim(),
        name: String(r.name || "").trim(),
        price: Number(r.price ?? 0),
        kilkist_on: on,
        kilkist_off: off,
        quantity: on - off,
        unit: r.unit_measurement ?? null,
        shop: shopName,
        time_on: r.time_on ?? null,
      };
    }) || [];
  globalCache.skladParts = dedupeSklad(mapped);
}
