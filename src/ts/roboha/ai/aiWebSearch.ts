// src/ts/roboha/ai/aiWebSearch.ts
// 🌐 Модуль інтернет-пошуку для AI Атлас
// 3 методи: 1) Serper.dev  2) Google CSE  3) Gemini Grounding (fallback в aiChat.ts)

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
  source: "serper" | "google_cse" | "grounding" | "edge_function" | "fallback";
  method?: 1 | 2 | 3; // 1=Serper, 2=CSE, 3=Grounding
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

// ============================================================
// КЕШ КЛЮЧІВ ПОШУКУ
// ============================================================

/**
 * Кеш: setting_id=12 → Serper.dev, setting_id=11 → CSE ID, setting_id=20+ → Google API Keys (CSE)
 */
let searchKeysCache: {
  serperKey: string; // Serper.dev API ключ (setting_id=12)
  cseId: string; // Google CSE ID (setting_id=11)
  cseKeys: string[]; // Google API ключі для CSE (setting_id=20, 21, ...)
  currentCseKeyIndex: number; // індекс поточного CSE ключа
  loadedAt: number;
} | null = null;

const CACHE_TTL = 5 * 60_000; // 5 хвилин

// ============================================================
// CALLBACK ДЛЯ UI СТАТУСУ ПОШУКУ
// ============================================================

/** Callback для оповіщення UI про поточний метод пошуку */
let _searchStatusCallback: ((status: string) => void) | null = null;

/**
 * Встановлює callback для відображення статусу пошуку в UI.
 * Викликається з aiChat.ts перед пошуком.
 */
export function setSearchStatusCallback(
  cb: ((status: string) => void) | null,
): void {
  _searchStatusCallback = cb;
}

/** Оповіщає UI про поточний статус */
function emitStatus(status: string): void {
  _searchStatusCallback?.(status);
}

// ============================================================
// ЗАВАНТАЖЕННЯ КЛЮЧІВ ПОШУКУ З БД
// ============================================================

/**
 * Завантажує всі ключі пошуку з таблиці settings:
 * - setting_id=12: Загальні = API ключ Serper.dev
 * - setting_id=11: Загальні = ID Google Custom Search Engine
 * - setting_id=20..39: Загальні = Google API ключі (для CSE, з ротацією)
 */
async function loadSearchKeys(): Promise<typeof searchKeysCache> {
  if (searchKeysCache && Date.now() - searchKeysCache.loadedAt < CACHE_TTL) {
    return searchKeysCache;
  }

  try {
    // Завантажуємо setting_id: 11 (CSE ID), 12 (Serper), 20..39 (Google keys)
    const settingIds = [
      11,
      12,
      ...Array.from({ length: 20 }, (_, i) => 20 + i),
    ];

    const { data, error } = await supabase
      .from("settings")
      .select('setting_id, "Загальні"')
      .in("setting_id", settingIds);

    if (error || !data) return null;

    let serperKey = "";
    let cseId = "";
    const cseKeys: { id: number; key: string }[] = [];

    for (const row of data) {
      const val = (row as any)["Загальні"];
      if (!val || typeof val !== "string") continue;
      const trimmed = val.trim();
      if (!trimmed) continue;

      if (row.setting_id === 11) {
        cseId = trimmed;
      } else if (row.setting_id === 12) {
        serperKey = trimmed;
      } else if (row.setting_id >= 20) {
        cseKeys.push({ id: row.setting_id, key: trimmed });
      }
    }

    // Сортуємо CSE ключі за setting_id (20, 21, 22...)
    cseKeys.sort((a, b) => a.id - b.id);

    searchKeysCache = {
      serperKey,
      cseId,
      cseKeys: cseKeys.map((k) => k.key),
      currentCseKeyIndex: 0,
      loadedAt: Date.now(),
    };

    // Логування конфігурації
    const methods: string[] = [];
    if (serperKey) methods.push("①Serper.dev (setting_id=12)");
    if (cseId && cseKeys.length > 0)
      methods.push(
        `②Google CSE (${cseKeys.length} ключів, CSE ID в setting_id=11)`,
      );
    methods.push("③Gemini Grounding (завжди)");
    console.log(`[Search] Доступні методи: ${methods.join(", ")}`);

    return searchKeysCache;
  } catch {
    return null;
  }
}

// ============================================================
// МЕТОД 1: Serper.dev
// ============================================================

/**
 * Пошук через Serper.dev
 * 2500 безкоштовних запитів, потім платно.
 * setting_id=12 → API ключ
 */
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
        error: `Serper: ${response.status} — ${errText.slice(0, 300)}`,
        source: "serper",
        method: 1,
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
      method: 1,
    };
  } catch (err: any) {
    return {
      success: false,
      results: [],
      query,
      error: `Serper помилка: ${err.message}`,
      source: "serper",
      method: 1,
    };
  }
}

// ============================================================
// МЕТОД 2: Google Custom Search Engine
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
    url.searchParams.set("num", "8");
    url.searchParams.set("lr", "lang_uk");
    url.searchParams.set("gl", "ua");

    const response = await fetch(url.toString());

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        results: [],
        query,
        error: `Google CSE: ${response.status} — ${errText.slice(0, 300)}`,
        source: "google_cse",
        method: 2,
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
      method: 2,
    };
  } catch (err: any) {
    return {
      success: false,
      results: [],
      query,
      error: `Google CSE помилка: ${err.message}`,
      source: "google_cse",
      method: 2,
    };
  }
}

// ============================================================
// ГОЛОВНА ФУНКЦІЯ ПОШУКУ
// ============================================================

/**
 * Виконує інтернет-пошук з автовибором провайдера.
 * Пріоритет:
 * 1. Serper.dev (setting_id=12) — найпростіший, 2500 безкоштовних
 * 2. Google CSE (setting_id=11 CSE ID + setting_id=20+ API ключі)
 * 3. ❌ Повертає failure → aiChat.ts переключається на Gemini Grounding
 */
export async function searchWeb(
  query: string,
  options?: {
    autoPartsMode?: boolean;
    sites?: string[];
    vinCode?: string;
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

  // Завантажуємо конфігурацію ключів
  const keysConfig = await loadSearchKeys();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // МЕТОД 1: Serper.dev (setting_id=12)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (keysConfig?.serperKey) {
    emitStatus("🔍 Метод ①: Serper.dev...");
    console.log("[Search] ▶ Метод ①: Serper.dev");

    const result = await searchSerper(searchQuery, keysConfig.serperKey);

    if (result.success) {
      console.log(
        `[Search] ✅ Serper.dev: ${result.results.length} результатів`,
      );
      return result;
    }

    const errText = result.error || "";
    console.warn(
      `[Search] ⚠️ Serper.dev не спрацював: ${errText.slice(0, 100)}`,
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // МЕТОД 2: Google CSE (setting_id=11 + 20+)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (keysConfig && keysConfig.cseKeys.length > 0 && keysConfig.cseId) {
    emitStatus("🔍 Метод ②: Google CSE...");
    console.log(
      `[Search] ▶ Метод ②: Google CSE (${keysConfig.cseKeys.length} ключів)`,
    );

    const totalKeys = keysConfig.cseKeys.length;
    const startIdx = keysConfig.currentCseKeyIndex;

    for (let i = 0; i < totalKeys; i++) {
      const keyIdx = (startIdx + i) % totalKeys;
      const apiKey = keysConfig.cseKeys[keyIdx];

      if (totalKeys > 1) {
        emitStatus(`🔍 Метод ②: Google CSE (ключ ${keyIdx + 1}/${totalKeys})`);
      }

      const result = await searchGoogleCSE(
        searchQuery,
        apiKey,
        keysConfig.cseId,
      );

      if (result.success) {
        keysConfig.currentCseKeyIndex = keyIdx;
        console.log(
          `[Search] ✅ Google CSE (ключ ${keyIdx + 1}): ${result.results.length} результатів`,
        );
        return result;
      }

      const errText = result.error || "";
      const isBlocked = /429|403|quota|limit|blocked|forbidden/i.test(errText);

      if (isBlocked) {
        console.warn(
          `[Search] Ключ №${keyIdx + 1} (setting_id=${20 + keyIdx}) заблоковано`,
        );
        keysConfig.currentCseKeyIndex = (keyIdx + 1) % totalKeys;
        continue;
      }

      console.warn(
        `[Search] CSE помилка (ключ ${keyIdx + 1}): ${errText.slice(0, 100)}`,
      );
      break;
    }

    console.warn("[Search] ⚠️ Google CSE: всі ключі не спрацювали");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // МЕТОД 3 → Повертаємо failure, aiChat.ts спробує Gemini Grounding
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  emitStatus("🔍 Метод ③: Gemini Grounding...");
  console.log("[Search] ▶ Метод ③ — Gemini Grounding (fallback)");

  const configuredMethods: string[] = [];
  if (!keysConfig?.serperKey)
    configuredMethods.push("Serper.dev (setting_id=12): не налаштований");
  if (!keysConfig?.cseId || !keysConfig?.cseKeys.length)
    configuredMethods.push("Google CSE (setting_id=11+20+): не налаштований");

  return {
    success: false,
    results: [],
    query: searchQuery,
    error:
      configuredMethods.length > 0
        ? `Методи 1-2 не спрацювали. ${configuredMethods.join("; ")}. Переходжу на Gemini Grounding.`
        : "Методи 1-2 заблоковані. Переходжу на Gemini Grounding.",
    source: "fallback",
    method: 3,
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

  const methodName =
    response.method === 1
      ? "Serper.dev"
      : response.method === 2
        ? "Google CSE"
        : "Gemini Search";

  let text = `🔍 Результати пошуку "${response.query}" (Метод ${response.method}: ${methodName}):\n\n`;

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
 * Скидає кеш ключів пошуку
 */
export function resetSearchKeyCache(): void {
  searchKeysCache = null;
}
