// src/ts/roboha/ai/aiWebSearch.ts
// 🌐 Модуль інтернет-пошуку для AI Атлас
// Єдиний метод: Gemini Search Grounding (обробляється в aiChat.ts)

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
  source: "grounding" | "fallback";
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
    description: `Шукає інформацію в інтернеті. ВИКОРИСТОВУЙ ЗАВЖДИ коли питають про запчастини, ціни, артикули. Використовуй для:
- Пошук цін на автозапчастини на українських сайтах: elit.ua, exist.ua, avtopro.ua, avto.pro, omega.page, dok.ua, intercars.com.ua, busmarket.group, oiler.ua, atl.ua, vladislav.ua, autotechnics.ua, all-parts.com.ua, ukrparts.com.ua, evocar.ua, massive.ua, pitline.ua, starter.ms, ecat.ua, autoklad.ua
- Пошук каталожних номерів (OEM артикулів) деталей
- Порівняння цін між постачальниками
- Пошук запчастин за VIN-кодом
- Пошук аналогів деталей та сумісних замін
- Перевірка наявності запчастин
- Пошук технічних характеристик автомобілів
- Пошук інструкцій з ремонту та технічної документації
- Будь-яка інша інформація з інтернету

ВАЖЛИВО: Коли користувач питає про запчастини, ціни, деталі — ВСТАНОВЛЮЙ auto_parts_mode=true для кращих результатів.`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Пошуковий запит. Включай назву деталі, марку/модель авто, рік, об'єм двигуна. Наприклад: 'масляний фільтр Toyota Camry 2.5 2018', 'пильовик амортизатора BMW E46', 'аналог Mann W712/73'",
        },
        auto_parts_mode: {
          type: "boolean",
          description:
            "ВСТАНОВЛЮЙ true коли шукаєш запчастини, ціни, артикули, деталі — це звузить пошук до українських магазинів автозапчастин. За замовчуванням false.",
        },
        vin_code: {
          type: "string",
          description:
            "VIN-код автомобіля (17 символів). Використовуй для пошуку сумісних запчастин. Наприклад: 'JTEBU5JR5D5123456'",
        },
        sites: {
          type: "array",
          description:
            "Конкретні сайти для пошуку. Наприклад: ['elit.ua', 'exist.ua', 'dok.ua']",
          items: { type: "string" },
        },
      },
      required: ["query"],
    },
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

  let text = `🔍 Результати пошуку "${response.query}" (Gemini Search):\n\n`;

  response.results.forEach((r, i) => {
    text += `${i + 1}. **${r.title}**\n`;
    text += `   🔗 ${r.url}\n`;
    if (r.snippet) text += `   ${r.snippet}\n`;
    text += "\n";
  });

  return text;
}

/**
 * Скидає кеш ключів пошуку (заглушка — кешу немає)
 */
export function resetSearchKeyCache(): void {
  // Нічого не робимо — пошук через Gemini Grounding не потребує окремих ключів
}
