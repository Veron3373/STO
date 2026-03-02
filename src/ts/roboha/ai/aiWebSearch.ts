// src/ts/roboha/ai/aiWebSearch.ts
// 🌐 Модуль інтернет-пошуку для AI Атлас
// Пошук цін на запчастини, артикулів, технічної інформації

import { supabase } from "../../vxid/supabaseClient";

// ============================================================
// ТИПИ
// ============================================================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string; // домен сайту
}

export interface WebSearchResponse {
  success: boolean;
  results: WebSearchResult[];
  query: string;
  error?: string;
  source: "google_cse" | "serper" | "edge_function" | "fallback";
}

// ============================================================
// КОНФІГУРАЦІЯ
// ============================================================

/** Пріоритетні сайти для пошуку запчастин (Україна) */
const AUTO_PARTS_SITES = [
  "exist.ua",
  "avto.pro",
  "avtopro.ua",
  "ecat.ua",
  "dok.ua",
  "autodoc.co.uk",
  "autoklad.ua",
  "intercars.com.ua",
  "autotechnics.ua",
  "spareto.com",
  "trodo.com",
];

/** Кеш ключів пошуку (setting_id=20+: API Keys, setting_id=11: CSE ID) */
let searchKeysCache: {
  keys: string[]; // масив API ключів (з setting_id 20, 21, 22...)
  cseId: string; // CSE ID (з setting_id 11)
  currentKeyIndex: number; // індекс поточного ключа
  loadedAt: number;
} | null = null;

const CACHE_TTL = 5 * 60_000; // 5 хвилин

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧА ПОШУКУ З БД
// ============================================================

/**
 * Завантажує ключі API пошуку з таблиці settings:
 * - setting_id=20, 21, 22...: Загальні = API ключі Google CSE (ротація при блокуванні)
 * - setting_id=11: Загальні = ID пошукової системи (Google CSE ID)
 *
 * Якщо ключ заблоковано (429/403) — автоматично переходить на наступний.
 */
async function loadSearchKeys(): Promise<typeof searchKeysCache> {
  if (searchKeysCache && Date.now() - searchKeysCache.loadedAt < CACHE_TTL) {
    return searchKeysCache;
  }

  try {
    // Завантажуємо CSE ID (setting_id=11) та ключі (setting_id=20..39)
    const settingIds = [11, ...Array.from({ length: 20 }, (_, i) => 20 + i)];

    const { data, error } = await supabase
      .from("settings")
      .select('setting_id, "Загальні"')
      .in("setting_id", settingIds);

    if (error || !data) return null;

    let cseId = "";
    const keys: { id: number; key: string }[] = [];

    for (const row of data) {
      const val = (row as any)["Загальні"];
      if (!val || typeof val !== "string") continue;
      const trimmed = val.trim();
      if (!trimmed) continue;

      if (row.setting_id === 11) {
        cseId = trimmed;
      } else if (row.setting_id >= 20) {
        keys.push({ id: row.setting_id, key: trimmed });
      }
    }

    if (keys.length === 0) return null;

    // Сортуємо за setting_id (20, 21, 22...)
    keys.sort((a, b) => a.id - b.id);

    searchKeysCache = {
      keys: keys.map((k) => k.key),
      cseId,
      currentKeyIndex: 0,
      loadedAt: Date.now(),
    };

    return searchKeysCache;
  } catch {
    return null;
  }
}

// ============================================================
// ПОШУК ЧЕРЕЗ GOOGLE CUSTOM SEARCH ENGINE
// ============================================================

async function searchGoogleCSE(
  query: string,
  apiKey: string,
  cseId: string,
): Promise<WebSearchResponse> {
  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cseId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "8"); // Кількість результатів
    url.searchParams.set("lr", "lang_uk"); // Українська мова
    url.searchParams.set("gl", "ua"); // Регіон Україна

    const response = await fetch(url.toString());

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        results: [],
        query,
        error: `Google CSE: ${response.status} — ${errText.slice(0, 300)}`,
        source: "google_cse",
      };
    }

    const data = await response.json();
    const items = data.items || [];

    const results: WebSearchResult[] = items.map((item: any) => ({
      title: item.title || "",
      url: item.link || "",
      snippet: item.snippet || "",
      source: extractDomain(item.link),
    }));

    return {
      success: true,
      results,
      query,
      source: "google_cse",
    };
  } catch (err: any) {
    return {
      success: false,
      results: [],
      query,
      error: `Google CSE помилка: ${err.message}`,
      source: "google_cse",
    };
  }
}

// ============================================================
// ПОШУК ЧЕРЕЗ SUPABASE EDGE FUNCTION
// ============================================================

async function searchViaEdgeFunction(
  query: string,
): Promise<WebSearchResponse> {
  try {
    const { data, error } = await supabase.functions.invoke("ai-web-search", {
      body: { query, region: "ua", language: "uk" },
    });

    if (error) {
      return {
        success: false,
        results: [],
        query,
        error: `Edge Function: ${error.message}`,
        source: "edge_function",
      };
    }

    return {
      success: true,
      results: data?.results || [],
      query,
      source: "edge_function",
    };
  } catch (err: any) {
    return {
      success: false,
      results: [],
      query,
      error: `Edge Function недоступна: ${err.message}`,
      source: "edge_function",
    };
  }
}

// ============================================================
// ГОЛОВНА ФУНКЦІЯ ПОШУКУ
// ============================================================

/**
 * Виконує інтернет-пошук з автовибором провайдера.
 * Пріоритет:
 * 1. Google CSE (якщо є ключ + CSE ID)
 * 2. Serper.dev (якщо є ключ)
 * 3. Supabase Edge Function (fallback)
 *
 * @param query — пошуковий запит
 * @param options — додаткові опції
 */
export async function searchWeb(
  query: string,
  options?: {
    autoPartsMode?: boolean; // Додати сайти запчастин до запиту
    sites?: string[]; // Шукати на конкретних сайтах
    vinCode?: string; // VIN-код для пошуку сумісних запчастин
    maxResults?: number;
  },
): Promise<WebSearchResponse> {
  // Формуємо запит
  let searchQuery = query;

  // Якщо є VIN-код — додаємо до запиту
  if (options?.vinCode) {
    const vin = options.vinCode.toUpperCase().trim();
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      searchQuery = `${query} VIN ${vin}`;
    }
  }

  // Якщо режим автозапчастин — додаємо пріоритетні сайти
  if (options?.autoPartsMode) {
    const sites = options?.sites || AUTO_PARTS_SITES.slice(0, 5);
    const siteFilter = sites.map((s) => `site:${s}`).join(" OR ");
    searchQuery = `${searchQuery} (${siteFilter})`;
  } else if (options?.sites && options.sites.length > 0) {
    const siteFilter = options.sites.map((s) => `site:${s}`).join(" OR ");
    searchQuery = `${searchQuery} (${siteFilter})`;
  }

  // 1. Спробувати через ключі з БД (ротація при блокуванні)
  const keysConfig = await loadSearchKeys();

  if (keysConfig && keysConfig.keys.length > 0 && keysConfig.cseId) {
    const totalKeys = keysConfig.keys.length;
    let startIdx = keysConfig.currentKeyIndex;

    // Пробуємо всі ключі по черзі
    for (let i = 0; i < totalKeys; i++) {
      const keyIdx = (startIdx + i) % totalKeys;
      const apiKey = keysConfig.keys[keyIdx];

      const result = await searchGoogleCSE(
        searchQuery,
        apiKey,
        keysConfig.cseId,
      );

      if (result.success) {
        // Запам'ятовуємо робочий ключ
        keysConfig.currentKeyIndex = keyIdx;
        return result;
      }

      // Перевіряємо чи ключ заблоковано (429/403)
      const errText = result.error || "";
      const isBlocked = /429|403|quota|limit|blocked|forbidden/i.test(errText);

      if (isBlocked) {
        console.warn(
          `[Search] Ключ №${keyIdx + 1} (setting_id=${20 + keyIdx}) заблоковано, пробую наступний...`,
        );
        keysConfig.currentKeyIndex = (keyIdx + 1) % totalKeys;
        continue;
      }

      // Інша помилка — не ротуємо, повертаємо
      return result;
    }

    // Всі ключі заблоковані
    return {
      success: false,
      results: [],
      query,
      error: `Всі ${totalKeys} API ключів пошуку заблоковано (setting_id: 20–${19 + totalKeys}). Спробуйте пізніше або додайте нові ключі.`,
      source: "google_cse",
    };
  }

  // 2. Спробувати Edge Function
  const edgeResult = await searchViaEdgeFunction(searchQuery);
  if (edgeResult.success) return edgeResult;

  // 3. Fallback — повертаємо порожній результат з інструкцією
  return {
    success: false,
    results: [],
    query,
    error:
      "Інтернет-пошук не налаштований. Додайте API ключі Google CSE в settings (setting_id=20, 21, 22...) та CSE ID в setting_id=11.",
    source: "fallback",
  };
}

/**
 * Форматує результати пошуку в текст для AI
 */
export function formatSearchResults(response: WebSearchResponse): string {
  if (!response.success || response.results.length === 0) {
    return response.error
      ? `🔍 Пошук "${response.query}": ${response.error}`
      : `🔍 Нічого не знайдено за запитом "${response.query}"`;
  }

  let text = `🔍 Результати пошуку "${response.query}" (${response.source}):\n\n`;

  response.results.forEach((r, i) => {
    text += `${i + 1}. **${r.title}**\n`;
    text += `   🔗 ${r.url}\n`;
    if (r.snippet) text += `   ${r.snippet}\n`;
    text += "\n";
  });

  return text;
}

// ============================================================
// GEMINI FUNCTION DECLARATION ДЛЯ search_internet
// ============================================================

/**
 * Повертає Gemini function declaration для інструменту search_internet
 */
export function getSearchInternetToolDeclaration(): any {
  return {
    name: "search_internet",
    description: `Шукає інформацію в інтернеті. Використовуй для:
- Пошук цін на автозапчастини в українських інтернет-магазинах (exist.ua, avto.pro, dok.ua, autodoc, ecat.ua, intercars.com.ua)
- Пошук каталожних номерів (артикулів) деталей
- Пошук запчастин за VIN-кодом автомобіля
- Порівняння цін на одну деталь у різних постачальників
- Перевірка наявності запчастин
- Пошук технічних характеристик автомобілів
- Пошук інструкцій з ремонту та технічної документації
- Пошук аналогів деталей та сумісних замін
- Будь-яка інша інформація з інтернету`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Пошуковий запит. Наприклад: 'масляний фільтр Toyota Camry 2.5 ціна Україна', 'артикул пильовик амортизатора BMW E46', 'аналог фільтра Mann W712/73'",
        },
        auto_parts_mode: {
          type: "boolean",
          description:
            "Якщо true — шукає переважно на сайтах автозапчастин (exist.ua, avto.pro, dok.ua тощо). Встановлюй true коли шукаєш запчастини, ціни, артикули. За замовчуванням false",
        },
        vin_code: {
          type: "string",
          description:
            "VIN-код автомобіля (17 символів). Використовуй для пошуку сумісних запчастин за конкретним авто. Наприклад: 'JTEBU5JR5D5123456'",
        },
        sites: {
          type: "array",
          description:
            "Конкретні сайти для пошуку (опціонально). Наприклад: ['exist.ua', 'avto.pro']",
          items: { type: "string" },
        },
      },
      required: ["query"],
    },
  };
}

// ============================================================
// УТИЛІТИ
// ============================================================

/** Витягує домен з URL */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Скидає кеш ключа пошуку
 */
export function resetSearchKeyCache(): void {
  searchKeysCache = null;
}
