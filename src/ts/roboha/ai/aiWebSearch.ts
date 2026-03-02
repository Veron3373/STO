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

/** Кеш ключа пошуку (setting_id=4 в settings.API або settings.Загальні) */
let searchApiKeyCache: {
  key: string;
  engine: string; // google_cse_id або serper
  provider: "google_cse" | "serper";
  loadedAt: number;
} | null = null;

const CACHE_TTL = 5 * 60_000; // 5 хвилин

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧА ПОШУКУ З БД
// ============================================================

/**
 * Завантажує ключ API пошуку з таблиці settings:
 * - setting_id=4: Загальні = API ключ (Google CSE або Serper)
 * - setting_id=5: Загальні = ID пошукової системи (Google CSE ID)
 *
 * Підтримує:
 * 1. Google Custom Search Engine (CSE) — потребує API key + CSE ID
 * 2. Serper.dev — потребує тільки API key
 * 3. Supabase Edge Function (fallback) — якщо є `ai-web-search` функція
 */
async function loadSearchApiKey(): Promise<typeof searchApiKeyCache> {
  if (
    searchApiKeyCache &&
    Date.now() - searchApiKeyCache.loadedAt < CACHE_TTL
  ) {
    return searchApiKeyCache;
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      .select('setting_id, "Загальні", API')
      .in("setting_id", [4, 5]);

    if (error || !data) return null;

    let apiKey = "";
    let engineId = "";

    for (const row of data) {
      const val = (row as any)["Загальні"];
      if (row.setting_id === 4 && val && typeof val === "string") {
        apiKey = val.trim();
      }
      if (row.setting_id === 5 && val && typeof val === "string") {
        engineId = val.trim();
      }
    }

    if (!apiKey) return null;

    // Визначаємо провайдера за форматом ключа
    const isSerper = apiKey.length < 50 && !apiKey.startsWith("AIza");
    const provider: "google_cse" | "serper" = isSerper
      ? "serper"
      : "google_cse";

    searchApiKeyCache = {
      key: apiKey,
      engine: engineId,
      provider,
      loadedAt: Date.now(),
    };

    return searchApiKeyCache;
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
        error: `Google CSE: ${response.status} — ${errText.slice(0, 200)}`,
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
// ПОШУК ЧЕРЕЗ SERPER.DEV (Google Search API)
// ============================================================

async function searchSerper(
  query: string,
  apiKey: string,
): Promise<WebSearchResponse> {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: "ua",
        hl: "uk",
        num: 8,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        results: [],
        query,
        error: `Serper: ${response.status} — ${errText.slice(0, 200)}`,
        source: "serper",
      };
    }

    const data = await response.json();
    const organic = data.organic || [];

    const results: WebSearchResult[] = organic.map((item: any) => ({
      title: item.title || "",
      url: item.link || "",
      snippet: item.snippet || "",
      source: extractDomain(item.link),
    }));

    return {
      success: true,
      results,
      query,
      source: "serper",
    };
  } catch (err: any) {
    return {
      success: false,
      results: [],
      query,
      error: `Serper помилка: ${err.message}`,
      source: "serper",
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

  // 1. Спробувати через ключ з БД
  const keyConfig = await loadSearchApiKey();

  if (keyConfig) {
    if (keyConfig.provider === "google_cse" && keyConfig.engine) {
      const result = await searchGoogleCSE(
        searchQuery,
        keyConfig.key,
        keyConfig.engine,
      );
      if (result.success) return result;
    }

    if (keyConfig.provider === "serper") {
      const result = await searchSerper(searchQuery, keyConfig.key);
      if (result.success) return result;
    }
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
      "Інтернет-пошук не налаштований. Додайте ключ API пошуку в settings (setting_id=4: ключ, setting_id=5: Google CSE ID). Підтримується: Google Custom Search Engine або Serper.dev",
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
  searchApiKeyCache = null;
}
