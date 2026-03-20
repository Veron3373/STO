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

// Інтерфейс для загальних налаштувань
export interface GeneralSettings {
  stoName: string; // Назва СТО (setting_id: 1)
  address: string; // Адреса (setting_id: 2)
  phone: string; // Телефон (setting_id: 3)
  headerColor: string; // Колір шапки акту (setting_id: 4)
  tableColor: string; // Колір таблиці актів (setting_id: 5)
  printColorMode: boolean; // Режим друку: true = кольоровий, false = чорнобілий (setting_id: 6, data)
  wallpaperMain: string; // Шпалери основні (setting_id: 7, Загальні)
  aiEnabled: boolean; // ШІ підказки (setting_id: 7, data)
  aiChatEnabled: boolean; // ШІ Атлас - чат асистент (setting_id: 9, data)
  voiceInputEnabled: boolean; // 🎙️ Голосове введення (setting_id: 10, data)
  smsTextBefore: string; // SMS текст перед сумою (setting_id: 8)
  smsTextAfter: string; // SMS текст після суми (setting_id: 9)
  actTextOffset: number; // Глобальний зсув шрифту (-5..+15) (setting_id: 11)
  tableBorderWidth: number; // Товщина меж таблиці акту (setting_id: 12)
  tableBorderColor: string; // Колір меж таблиці акту (setting_id: 13)
  logoUrl: string; // Логотип компанії (setting_id: 14)
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
  recordId?: string; // ✅ Унікальний ID запису для точного пошуку в історії слюсаря
  detail_id?: number | null; // ✅ ID деталі без складу
  work_id?: string | null; // ✅ ID роботи
}

export interface GlobalDataCache {
  works: string[];
  worksWithId: Array<{ work_id: string; name: string }>;
  details: string[];
  detailsWithId: Array<{ detail_id: number; name: string }>;
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
  carId: number | null; // ← ДОДАНО
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
    scladNomer?: number | null;
    statys?: string | null;
  }>;
  skladLite: SkladLiteRow[];
  oldNumbers: Map<number, number>;
  initialActItems: ActItem[];
  generalSettings: GeneralSettings; // Загальні налаштування СТО
}

export const globalCache: GlobalDataCache = {
  works: [],
  worksWithId: [],
  details: [],
  detailsWithId: [],
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
  carId: null, // ← ДОДАНО
  currentActDateOn: null,
  skladParts: [],
  skladLite: [],
  oldNumbers: new Map<number, number>(),
  initialActItems: [],
  generalSettings: {
    stoName: "",
    address: "",
    phone: "",
    headerColor: "#164D25",
    tableColor: "#164D25",
    printColorMode: true, // За замовчуванням кольоровий друк
    wallpaperMain: "",
    aiEnabled: false, // За замовчуванням ШІ вимкнено
    aiChatEnabled: false, // За замовчуванням ШІ Атлас вимкнено
    voiceInputEnabled: false, // За замовчуванням голосове введення вимкнено
    smsTextBefore: "Ваше замовлення виконане. Сума:", // SMS текст перед сумою
    smsTextAfter: "грн. Дякуємо за довіру!", // SMS текст після суми
    actTextOffset: 0, // Глобальний зсув шрифту (дефолт 0)
    tableBorderWidth: 1, // Товщина меж таблиці (дефолт 1px)
    tableBorderColor: "#cccccc", // Колір меж таблиці (дефолт сірий)
    logoUrl: "", // Логотип компанії
  },
};

export const ZAKAZ_NARAYD_MODAL_ID = "zakaz_narayd-custom-modal";
export const ZAKAZ_NARAYD_BODY_ID = "zakaz_narayd-body";
export const ZAKAZ_NARAYD_CLOSE_BTN_ID = "zakaz_narayd-close";
export const ZAKAZ_NARAYD_SAVE_BTN_ID = "save-act-data";
export const EDITABLE_PROBIG_ID = "editable-probig";
export const EDITABLE_REASON_ID = "editable-reason";
export const EDITABLE_RECOMMENDATIONS_ID = "editable-recommendations";
export const EDITABLE_NOTES_ID = "editable-notes";

// 🔹 Ключ для збереження загальних налаштувань в localStorage
const GENERAL_SETTINGS_STORAGE_KEY = "sto_general_settings";
// 🔹 Ключ для прапора сесії (чи вже завантажено налаштування з БД в цій сесії)
const GENERAL_SETTINGS_SESSION_KEY = "sto_general_settings_loaded";

// 🔹 Перевіряє чи налаштування вже завантажено в цій сесії
export function isGeneralSettingsLoadedThisSession(): boolean {
  return sessionStorage.getItem(GENERAL_SETTINGS_SESSION_KEY) === "true";
}

// 🔹 Позначає що налаштування завантажено в цій сесії
export function markGeneralSettingsAsLoaded(): void {
  sessionStorage.setItem(GENERAL_SETTINGS_SESSION_KEY, "true");
}

// 🔹 Завантажує загальні налаштування з localStorage
export function loadGeneralSettingsFromLocalStorage(): boolean {
  try {
    const stored = localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as GeneralSettings;
      globalCache.generalSettings = {
        stoName: parsed.stoName || "",
        address: parsed.address || "",
        phone: parsed.phone || "",
        headerColor: parsed.headerColor || "#164D25",
        tableColor: parsed.tableColor || "#164D25",
        printColorMode:
          parsed.printColorMode !== undefined ? parsed.printColorMode : true,
        wallpaperMain: parsed.wallpaperMain || "",
        aiEnabled: parsed.aiEnabled !== undefined ? parsed.aiEnabled : false,
        aiChatEnabled:
          parsed.aiChatEnabled !== undefined ? parsed.aiChatEnabled : false,
        voiceInputEnabled:
          parsed.voiceInputEnabled !== undefined
            ? parsed.voiceInputEnabled
            : false,
        smsTextBefore:
          parsed.smsTextBefore || "Ваше замовлення виконане. Сума:",
        smsTextAfter: parsed.smsTextAfter || "грн. Дякуємо за довіру!",
        actTextOffset:
          parsed.actTextOffset !== undefined ? parsed.actTextOffset : 0,
        tableBorderWidth:
          parsed.tableBorderWidth !== undefined ? parsed.tableBorderWidth : 1,
        tableBorderColor: parsed.tableBorderColor || "#cccccc",
        logoUrl: parsed.logoUrl || "",
      };
      // Застосовуємо шпалери після завантаження
      applyWallpapers();
      // Застосовуємо розміри шрифтів після завантаження
      applyFontSizes();
      // Застосовуємо межі таблиці після завантаження
      applyTableBorders();
      return true;
    }
  } catch (e) {
    // console.warn("⚠️ Помилка читання загальних налаштувань з localStorage:", e);
  }
  return false;
}

// 🔹 Зберігає загальні налаштування в localStorage
export function saveGeneralSettingsToLocalStorage(): void {
  try {
    localStorage.setItem(
      GENERAL_SETTINGS_STORAGE_KEY,
      JSON.stringify(globalCache.generalSettings),
    );
  } catch (e) {
    // console.warn(
    // "⚠️ Помилка збереження загальних налаштувань в localStorage:",
    // e,
    // );
  }
}

// 🔹 Завантажує загальні налаштування з БД і зберігає в localStorage
export async function loadGeneralSettingsFromDB(): Promise<void> {
  try {
    const { data: generalSettingsRows } = (await supabase
      .from("settings")
      .select("setting_id, Загальні, data")
      .in("setting_id", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
      .order("setting_id")) as {
        data: Array<{
          setting_id: number;
          Загальні: string | null;
          data: boolean | null;
        }> | null;
      };

    if (generalSettingsRows) {
      for (const row of generalSettingsRows) {
        const value = (row as any)["Загальні"] || "";
        switch (row.setting_id) {
          case 1:
            globalCache.generalSettings.stoName = value || "";
            break;
          case 2:
            globalCache.generalSettings.address = value || "";
            break;
          case 3:
            globalCache.generalSettings.phone = value || "";
            break;
          case 4:
            globalCache.generalSettings.headerColor = value || "#164D25";
            break;
          case 5:
            globalCache.generalSettings.tableColor = value || "#164D25";
            break;
          case 6:
            globalCache.generalSettings.printColorMode =
              (row as any).data !== false; // true якщо data не false
            break;
          case 7:
            globalCache.generalSettings.wallpaperMain = value || "";
            globalCache.generalSettings.aiEnabled =
              (row as any).data === true || (row as any).data === "true"; // ШІ підказки
            break;
          case 8:
            globalCache.generalSettings.smsTextBefore =
              value || "Ваше замовлення виконане. Сума:";
            break;
          case 9:
            globalCache.generalSettings.smsTextAfter =
              value || "грн. Дякуємо за довіру!";
            // ШІ Атлас - записується в setting_id=9 data
            globalCache.generalSettings.aiChatEnabled =
              (row as any).data === true || (row as any).data === "true";
            break;
          case 10:
            // 🎙️ Голосове введення — записується в setting_id=10 data
            globalCache.generalSettings.voiceInputEnabled =
              (row as any).data === true || (row as any).data === "true";
            break;
          case 11:
            // 🔡 Глобальний зсув шрифту — записується в Загальні
            globalCache.generalSettings.actTextOffset =
              parseInt(value) || 0;
            break;
          case 12:
            // 📏 Товщина меж таблиці — записується в Загальні
            globalCache.generalSettings.tableBorderWidth =
              parseInt(value) || 1;
            break;
          case 13:
            // 🎨 Колір меж таблиці — записується в Загальні
            globalCache.generalSettings.tableBorderColor = value || "#cccccc";
            break;
          case 14:
            // Логотип компанії
            globalCache.generalSettings.logoUrl = value || "";
            break;
        }
      }
      // Зберігаємо в localStorage
      saveGeneralSettingsToLocalStorage();
      // Застосовуємо шпалери
      applyWallpapers();
      // Застосовуємо розміри шрифтів
      applyFontSizes();
      // Застосовуємо межі таблиці
      applyTableBorders();
    }
  } catch (e) {
    // console.error("❌ Помилка завантаження загальних налаштувань з БД:", e);
  }
}

// 🔹 Застосовує глобальний зсув шрифту (через CSS змінну)
export function applyFontSizes(): void {
  const { actTextOffset } = globalCache.generalSettings;
  const root = document.documentElement;
  root.style.setProperty("--act-text-offset", `${actTextOffset ?? 0}`);
}

// 🔹 Застосовує товщину та колір меж таблиці (через CSS змінні)
export function applyTableBorders(): void {
  const { tableBorderWidth, tableBorderColor } = globalCache.generalSettings;
  const root = document.documentElement;
  root.style.setProperty("--table-border-width", `${tableBorderWidth ?? 1}px`);
  root.style.setProperty("--table-border-color", tableBorderColor || "#cccccc");
}

// 🔹 Застосовує шпалери до body.page-2
export function applyWallpapers(): void {
  const { wallpaperMain } = globalCache.generalSettings;

  // Застосовуємо шпалери для основної сторінки (body.page-2)
  if (wallpaperMain) {
    const styleId = "dynamic-wallpaper-main";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `body.page-2 { background-image: url("${wallpaperMain}") !important; }`;
  }
}

export const OPEN_GOOGLE_DRIVE_FOLDER_ID = "open-google-drive-folder";
export const ACT_ITEMS_TABLE_CONTAINER_ID = "act-items-table-container";

// ✅ Кешування глобальних даних з TTL (5 хвилин)
const GLOBAL_DATA_CACHE_TTL = 5 * 60 * 1000; // 5 хвилин
let lastGlobalDataLoadTime: number = 0;
let globalDataLoaded: boolean = false;
let isScladRealtimeSubscribed: boolean = false; // ← Флаг підписки Realtime
let isWorksRealtimeSubscribed: boolean = false; // ← Флаг підписки Realtime для works
let isDetailsRealtimeSubscribed: boolean = false; // ← Флаг підписки Realtime для details

/** Примусово оновити кеш (наприклад, після додавання нових робіт/деталей) */
export function invalidateGlobalDataCache(): void {
  globalDataLoaded = false;
  lastGlobalDataLoadTime = 0;
  // Очищаємо складові частини, щоб ensureSkladLoaded() перезавантажив їх
  globalCache.skladParts = [];
}

/* ===================== утиліти ===================== */

export function formatNumberWithSpaces(
  value: number | string | undefined | null,
  minimumFractionDigits: number = 0,
  maximumFractionDigits: number = 2,
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
  T extends { part_number: string; price: number; quantity: number },
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
  orderBy?: string,
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
      // console.error(`❌ Помилка завантаження ${tableName}:`, error.message);
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

export async function loadGlobalData(
  forceReload: boolean = false,
): Promise<void> {
  // ✅ Кешування: якщо дані вже завантажені і TTL не вийшов - не перезавантажуємо
  const now = Date.now();
  if (
    !forceReload &&
    globalDataLoaded &&
    now - lastGlobalDataLoadTime < GLOBAL_DATA_CACHE_TTL
  ) {
    return;
  }

  try {
    // ✅ ВИПРАВЛЕНО: Використовуємо пагінацію для завантаження ВСІХ робіт
    const worksData = await fetchAllWithPagination<{
      work_id: number;
      data: string;
    }>("works", "work_id, data", "work_id");

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
      scladNomer: number | null;
      statys: string | null;
    }>(
      "sclad",
      "sclad_id, part_number, name, price, kilkist_on, kilkist_off, unit_measurement, shops, time_on, scladNomer, statys",
      "sclad_id",
    );

    // ✅ ВИПРАВЛЕНО: Використовуємо пагінацію для завантаження ВСІХ деталей з detail_id
    const detailsData = await fetchAllWithPagination<{
      detail_id: number;
      data: string;
    }>("details", "detail_id, data", "detail_id");

    const [{ data: slyusarsData }, { data: shopsData }] = await Promise.all([
      supabase.from("slyusars").select("data"),
      supabase.from("shops").select("data"),
    ]);

    // 🔹 Завантажуємо загальні налаштування:
    // - Якщо вже завантажено в цій сесії → просто беремо з localStorage
    // - Інакше (перезавантаження/новий вхід) → завантажуємо з БД і позначаємо прапором
    if (isGeneralSettingsLoadedThisSession()) {
      // Дані вже актуальні в цій сесії - просто читаємо з localStorage
      loadGeneralSettingsFromLocalStorage();
    } else {
      // Новий вхід або перезавантаження - завантажуємо з БД
      await loadGeneralSettingsFromDB();
      markGeneralSettingsAsLoaded();
    }

    const { data: settingsRows } = await supabase
      .from("settings")
      .select("setting_id, data");
    const settingShop = settingsRows?.find((s: any) => s.setting_id === 1);
    const settingCatalog = settingsRows?.find((s: any) => s.setting_id === 2);
    const settingZarplata = settingsRows?.find((s: any) => s.setting_id === 3);
    const settingSMS = settingsRows?.find((s: any) => s.setting_id === 5);

    // ========== ВИПРАВЛЕНО: works і details - TEXT колонка, просто рядки ==========
    globalCache.worksWithId =
      worksData?.map((r: any) => ({
        work_id: String(r.work_id || ""),
        name: String(r.data || "").trim(),
      })) || [];

    globalCache.works = globalCache.worksWithId
      .map((w) => w.name)
      .filter(Boolean);

    // ✅ Зберігаємо detailsWithId для Realtime оновлень
    globalCache.detailsWithId =
      detailsData
        ?.map((r: any) => ({
          detail_id: Number(r.detail_id || 0),
          name: String(r.data || "").trim(),
        }))
        .filter((d) => d.name) || [];

    globalCache.details = globalCache.detailsWithId.map((d) => d.name);

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
      a.Name.localeCompare(b.Name, "uk", { sensitivity: "base" }),
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
          scladNomer: r.scladNomer ?? null,
          statys: r.statys ?? null,
        };
      }) || [];

    globalCache.skladParts = dedupeSklad(mapped);

    // ✅ Оновлюємо час кешу після успішного завантаження
    lastGlobalDataLoadTime = Date.now();
    globalDataLoaded = true;

    // 🔥 Активуємо Realtime підписки на зміни складу, робіт та деталей
    initScladRealtimeSubscription();
    initWorksRealtimeSubscription();
    initDetailsRealtimeSubscription();
  } catch (error) {
    // console.error("❌ Помилка завантаження глобальних даних:", error);
    showNotification("Помилка завантаження базових даних", "error");
  }
}

/**
 * ✅ Перезавантажує тільки слюсарів з бази даних
 * Використовується при отриманні broadcast про збереження акту іншим користувачем
 * щоб отримати актуальні дані з історії слюсарів (зарплати, тощо)
 */
export async function reloadSlyusarsOnly(): Promise<void> {
  try {
    const { data: slyusarsData, error } = await supabase
      .from("slyusars")
      .select("data");

    if (error) {
      // console.error("❌ Помилка завантаження слюсарів:", error);
      return;
    }

    globalCache.slyusars =
      slyusarsData
        ?.map((r: any) => {
          const d = safeParseJSON(r.data);
          return d?.Name ? d : null;
        })
        .filter(Boolean) || [];
  } catch (err) {
    // console.error("❌ [reloadSlyusarsOnly] Помилка:", err);
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
    }>("sclad", "sclad_id, part_number, kilkist_on, kilkist_off", "sclad_id");

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
  } catch (e) {
    // console.error("💥 loadSkladLite(): критична помилка:", e);
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

  // ✅ ВИПРАВЛЕНО: використовуємо пагінацію — більше не обрізаємо на 1000 записах
  const data = await fetchAllWithPagination<{
    sclad_id: number;
    part_number: string;
    name: string;
    price: number;
    kilkist_on: number;
    kilkist_off: number;
    unit_measurement: string | null;
    shops: any;
    time_on: string | null;
    scladNomer: number | null;
    statys: string | null;
  }>(
    "sclad",
    "sclad_id, part_number, name, price, kilkist_on, kilkist_off, unit_measurement, shops, time_on, scladNomer, statys",
    "sclad_id",
  );

  const mapped = data.map((r: any) => {
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
      scladNomer: r.scladNomer ?? null,
      statys: r.statys ?? null,
    };
  });

  globalCache.skladParts = dedupeSklad(mapped);
}

/* ===================== REALTIME SUBSCRIPTION (SCLAD) ===================== */

/**
 * Ініціалізує Pro Realtime підписку на таблицю sclad.
 * Слухає INSERT, UPDATE, DELETE і синхронізує globalCache.skladParts.
 */
export function initScladRealtimeSubscription() {
  if (isScladRealtimeSubscribed) {
    return;
  }
  isScladRealtimeSubscribed = true;

  supabase
    .channel("sclad-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sclad" },
      (payload) => {
        handleScladChange(payload);
      },
    )
    .subscribe();
}

function handleScladChange(payload: any) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  if (eventType === "DELETE") {
    // 🗑️ Видалення запису
    if (oldRecord && oldRecord.sclad_id) {
      globalCache.skladParts = globalCache.skladParts.filter(
        (p) => p.sclad_id !== oldRecord.sclad_id,
      );
    }
  } else if (eventType === "INSERT") {
    // ➕ Додавання запису
    if (newRecord) {
      const mapped = mapScladRecord(newRecord);
      // Додаємо в початок або кінець? В ensureSkladLoaded order desc, але тут можна просто push,
      // бо автодоповнення все одно фільтрує.
      globalCache.skladParts.push(mapped);
    }
  } else if (eventType === "UPDATE") {
    // 🔄 Оновлення запису
    if (newRecord) {
      const updated = mapScladRecord(newRecord);
      const index = globalCache.skladParts.findIndex(
        (p) => p.sclad_id === newRecord.sclad_id,
      );

      if (index !== -1) {
        globalCache.skladParts[index] = updated;
      } else {
        // Якщо раптом немає в кеші (наприклад, було додано поки ми були офлайн?), додаємо
        globalCache.skladParts.push(updated);
      }
    }
  }
}

/** Допоміжна функція для мапінгу "сирого" запису з Realtime у формат globalCache */
function mapScladRecord(r: any) {
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
    scladNomer: r.scladNomer ?? null,
    statys: r.statys ?? null,
  };
}

/* ===================== REALTIME SUBSCRIPTION (WORKS) ===================== */

/**
 * Ініціалізує Realtime підписку на таблицю works.
 * Слухає INSERT, UPDATE, DELETE і синхронізує globalCache.works та globalCache.worksWithId.
 */
export function initWorksRealtimeSubscription() {
  if (isWorksRealtimeSubscribed) {
    return;
  }
  isWorksRealtimeSubscribed = true;

  supabase
    .channel("works-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "works" },
      (payload) => {
        handleWorksChange(payload);
      },
    )
    .subscribe();
}

function handleWorksChange(payload: any) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  if (eventType === "DELETE") {
    // 🗑️ Видалення роботи
    if (oldRecord && oldRecord.work_id) {
      const workIdStr = String(oldRecord.work_id);
      const index = globalCache.worksWithId.findIndex(
        (w) => w.work_id === workIdStr,
      );
      if (index !== -1) {
        globalCache.worksWithId.splice(index, 1);
        // Оновлюємо масив works
        globalCache.works = globalCache.worksWithId
          .map((w) => w.name)
          .filter(Boolean);
      }
    }
  } else if (eventType === "INSERT") {
    // ➕ Додавання роботи
    if (newRecord) {
      const mapped = {
        work_id: String(newRecord.work_id || ""),
        name: String(newRecord.data || "").trim(),
      };
      if (mapped.name) {
        globalCache.worksWithId.push(mapped);
        globalCache.works = globalCache.worksWithId
          .map((w) => w.name)
          .filter(Boolean);
      }
    }
  } else if (eventType === "UPDATE") {
    // 🔄 Оновлення роботи
    if (newRecord) {
      const workIdStr = String(newRecord.work_id);
      const index = globalCache.worksWithId.findIndex(
        (w) => w.work_id === workIdStr,
      );
      const updatedName = String(newRecord.data || "").trim();

      if (index !== -1) {
        globalCache.worksWithId[index].name = updatedName;
        globalCache.works = globalCache.worksWithId
          .map((w) => w.name)
          .filter(Boolean);
      } else if (updatedName) {
        // Якщо немає в кеші — додаємо
        globalCache.worksWithId.push({ work_id: workIdStr, name: updatedName });
        globalCache.works = globalCache.worksWithId
          .map((w) => w.name)
          .filter(Boolean);
      }
    }
  }
}

/* ===================== REALTIME SUBSCRIPTION (DETAILS) ===================== */

/**
 * Ініціалізує Realtime підписку на таблицю details.
 * Слухає INSERT, UPDATE, DELETE і синхронізує globalCache.details та globalCache.detailsWithId.
 */
export function initDetailsRealtimeSubscription() {
  if (isDetailsRealtimeSubscribed) {
    return;
  }
  isDetailsRealtimeSubscribed = true;

  supabase
    .channel("details-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "details" },
      (payload) => {
        handleDetailsChange(payload);
      },
    )
    .subscribe(() => { });
}

function handleDetailsChange(payload: any) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  if (eventType === "DELETE") {
    // 🗑️ Видалення деталі
    if (oldRecord && oldRecord.detail_id) {
      const detailId = Number(oldRecord.detail_id);
      const index = globalCache.detailsWithId.findIndex(
        (d) => d.detail_id === detailId,
      );
      if (index !== -1) {
        globalCache.detailsWithId.splice(index, 1);
        // Оновлюємо масив details
        globalCache.details = globalCache.detailsWithId.map((d) => d.name);
      }
    }
  } else if (eventType === "INSERT") {
    // ➕ Додавання деталі
    if (newRecord) {
      const mapped = {
        detail_id: Number(newRecord.detail_id || 0),
        name: String(newRecord.data || "").trim(),
      };
      if (mapped.name && mapped.detail_id) {
        globalCache.detailsWithId.push(mapped);
        globalCache.details = globalCache.detailsWithId.map((d) => d.name);
      }
    }
  } else if (eventType === "UPDATE") {
    // 🔄 Оновлення деталі
    if (newRecord) {
      const detailId = Number(newRecord.detail_id);
      const index = globalCache.detailsWithId.findIndex(
        (d) => d.detail_id === detailId,
      );
      const updatedName = String(newRecord.data || "").trim();

      if (index !== -1) {
        globalCache.detailsWithId[index].name = updatedName;
        globalCache.details = globalCache.detailsWithId.map((d) => d.name);
      } else if (updatedName && detailId) {
        // Якщо немає в кеші — додаємо
        globalCache.detailsWithId.push({
          detail_id: detailId,
          name: updatedName,
        });
        globalCache.details = globalCache.detailsWithId.map((d) => d.name);
      }
    }
  }
}
