// src/ts/roboha/ai/aiWebSearch.ts
// 🌐 Модуль інтернет-пошуку для AI Атлас
// 2 методи: 1) Google CSE  2) Gemini Grounding (fallback в aiChat.ts)

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
  source: "google_cse" | "grounding" | "fallback";
  method?: 1 | 2; // 1=Google CSE, 2=Gemini Grounding
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
 * Кеш: setting_id=11 → CSE ID, setting_id=20+ → Google API Keys (AIza...)
 */
let searchKeysCache: {
  cseId: string; // Google CSE ID (setting_id=11)
  cseKeys: string[]; // Google API ключі для CSE (починаються з "AIza")
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
 * Завантажує ключі пошуку з таблиці settings:
 * - setting_id=11: Загальні = ID Google Custom Search Engine (CSE ID)
 * - setting_id=20+: Загальні = Google API ключі (AIza...)
 */
async function loadSearchKeys(): Promise<typeof searchKeysCache> {
  if (searchKeysCache && Date.now() - searchKeysCache.loadedAt < CACHE_TTL) {
    return searchKeysCache;
  }

  try {
    // Завантажуємо setting_id=11 (CSE ID) + ВСІ ключі setting_id >= 20
    const [cseRes, keysRes] = await Promise.all([
      supabase
        .from("settings")
        .select('setting_id, "Загальні"')
        .eq("setting_id", 11),
      supabase
        .from("settings")
        .select('setting_id, "Загальні"')
        .gte("setting_id", 20)
        .not("Загальні", "is", null)
        .order("setting_id"),
    ]);

    const data = [...(cseRes.data || []), ...(keysRes.data || [])];
    const error = cseRes.error || keysRes.error;

    if (error || !data) return null;

    let cseId = "";
    const cseKeys: { id: number; key: string }[] = [];

    for (const row of data) {
      const val = (row as any)["Загальні"];
      if (!val || typeof val !== "string") continue;
      const trimmed = val.trim();
      if (!trimmed) continue;

      if (row.setting_id === 11) {
        cseId = trimmed;
      } else if (row.setting_id >= 20 && trimmed.startsWith("AIza")) {
        cseKeys.push({ id: row.setting_id, key: trimmed });
      }
    }

    // Сортуємо за setting_id
    cseKeys.sort((a, b) => a.id - b.id);

    searchKeysCache = {
      cseId,
      cseKeys: cseKeys.map((k) => k.key),
      currentCseKeyIndex: 0,
      loadedAt: Date.now(),
    };

    // Логування конфігурації
    const methods: string[] = [];
    if (cseId && cseKeys.length > 0)
      methods.push(
        `①Google CSE (${cseKeys.length} ключів, CSE ID в setting_id=11)`,
      );
    methods.push("②Gemini Grounding (завжди)");
    console.log(`[Search] Доступні методи: ${methods.join(", ")}`);

    return searchKeysCache;
  } catch {
    return null;
  }
}

// ============================================================
// МЕТОД 1: Google Custom Search Engine
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
        method: 1,
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
      method: 1,
    };
  } catch (err: any) {
    return {
      success: false,
      results: [],
      query,
      error: `Google CSE помилка: ${err.message}`,
      source: "google_cse",
      method: 1,
    };
  }
}

// ============================================================
// ГОЛОВНА ФУНКЦІЯ ПОШУКУ
// ============================================================

/**
 * Виконує інтернет-пошук.
 * Пріоритет:
 * 1. Google CSE (setting_id=11 CSE ID + setting_id=20+ API ключі AIza...)
 * 2. ❌ Повертає failure → aiChat.ts переключається на Gemini Grounding
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
  // МЕТОД 1: Google CSE (ключі "AIza..." + CSE ID)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (keysConfig && keysConfig.cseKeys.length > 0 && keysConfig.cseId) {
    const totalKeys = keysConfig.cseKeys.length;
    emitStatus("🔍 Метод ①: Google CSE...");
    console.log(`[Search] ▶ Метод ①: Google CSE (${totalKeys} ключів)`);

    const startIdx = keysConfig.currentCseKeyIndex;

    for (let i = 0; i < totalKeys; i++) {
      const keyIdx = (startIdx + i) % totalKeys;
      const apiKey = keysConfig.cseKeys[keyIdx];

      if (totalKeys > 1) {
        emitStatus(`🔍 Метод ①: Google CSE (ключ ${keyIdx + 1}/${totalKeys})`);
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

      // 403 = API не увімкнений → ВСІ ключі цього проєкту теж не спрацюють → одразу на Grounding
      if (/403|forbidden|not been used|not enabled/i.test(errText)) {
        console.warn(
          `[Search] ❌ CSE API не увімкнений (403) — пропускаю всі ключі: ${errText.slice(0, 100)}`,
        );
        break;
      }

      // 429 = ліміт вичерпано → спробувати наступний ключ
      if (/429|quota|limit|rate/i.test(errText)) {
        console.warn(
          `[Search] ⚠️ Ключ №${keyIdx + 1} ліміт: ${errText.slice(0, 100)}`,
        );
        keysConfig.currentCseKeyIndex = (keyIdx + 1) % totalKeys;
        continue;
      }

      // 401 = невалідний ключ → спробувати наступний
      if (/401|unauthorized|invalid/i.test(errText)) {
        console.warn(
          `[Search] ⚠️ Ключ №${keyIdx + 1} невалідний: ${errText.slice(0, 100)}`,
        );
        keysConfig.currentCseKeyIndex = (keyIdx + 1) % totalKeys;
        continue;
      }

      // Інша помилка → зупинитись
      console.warn(
        `[Search] ⚠️ CSE помилка (ключ ${keyIdx + 1}): ${errText.slice(0, 100)}`,
      );
      break;
    }

    console.warn("[Search] ⚠️ Google CSE: всі ключі не спрацювали");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // МЕТОД 2 → Повертаємо failure, aiChat.ts спробує Gemini Grounding
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  emitStatus("🔍 Метод ②: Gemini Grounding...");
  console.log("[Search] ▶ Метод ② — Gemini Grounding (fallback)");

  return {
    success: false,
    results: [],
    query: searchQuery,
    error:
      !keysConfig?.cseId || !keysConfig?.cseKeys.length
        ? "Google CSE не налаштований (AIza... ключі в setting_id=20+ та CSE ID в setting_id=11). Переходжу на Gemini Grounding."
        : "Метод ① заблокований. Переходжу на Gemini Grounding.",
    source: "fallback",
    method: 2,
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

  const methodName = response.method === 1 ? "Google CSE" : "Gemini Search";

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
