// src/ts/roboha/zakaz_naraudy/inhi/knopka_zamok.ts
import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna";
import { showViknoPidtverdchennayZakruttiaAkty } from "./vikno_pidtverdchennay_zakruttia_akty";
import { showViknoVvodyParolu } from "./vikno_vvody_parolu";
import {
  globalCache,
  loadGlobalData,
  ACT_ITEMS_TABLE_CONTAINER_ID,
  ZAKAZ_NARAYD_SAVE_BTN_ID, // <-- Імпортуємо ID кнопки збереження
} from "../globalCache";
import { refreshActsTable } from "../../tablucya/tablucya";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
  canUserCloseActs,
  canUserOpenClosedActs,
} from "../../tablucya/users";

// Імпортуємо функцію показу модального вікна
import { showModal } from "../modalMain";

/* ======================== Локальні утиліти для синхронізації shops ======================== */

type ShopRow = { shop_id?: number; data: any };

function cleanText(s?: string | null) {
  return (s ?? "").replace(/\u00A0/g, " ").trim();
}

function parseNum(s?: string | null) {
  const v = cleanText(s).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

function toISODateOnly(dt: string | Date | null | undefined): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(+d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

async function fetchActDates(
  actId: number
): Promise<{ date_on: string | null; date_off: string | null }> {
  const { data, error } = await supabase
    .from("acts")
    .select("date_on, date_off")
    .eq("act_id", actId)
    .single();
  if (error) {
    console.warn("Не вдалося прочитати дати акту:", error.message);
    return { date_on: null, date_off: null };
  }
  return { date_on: data?.date_on ?? null, date_off: data?.date_off ?? null };
}

async function fetchScladMeta(
  scladIds: number[]
): Promise<
  Map<number, { rahunok: string | number | null; time_off: string | null }>
> {
  if (scladIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("sclad")
    .select("sclad_id, rahunok, time_off")
    .in("sclad_id", Array.from(new Set(scladIds)));

  if (error) {
    console.warn("fetchScladMeta():", error.message);
    return new Map();
  }

  const m = new Map<
    number,
    { rahunok: string | number | null; time_off: string | null }
  >();
  for (const r of data || []) {
    m.set(Number(r.sclad_id), {
      rahunok: (r as any).rahunok ?? null,
      time_off: (r as any).time_off ?? null,
    });
  }
  return m;
}

async function fetchShopByName(shopName: string): Promise<ShopRow | null> {
  const { data, error } = await supabase
    .from("shops")
    .select("shop_id, data")
    .eq("data->>Name", shopName)
    .maybeSingle();

  if (error) {
    console.warn(`fetchShopByName(${shopName}):`, error.message);
    return null;
  }
  if (!data) return null;
  return { shop_id: data.shop_id, data: data.data };
}

async function updateShopJson(shop: ShopRow): Promise<void> {
  if (!shop.shop_id) return;
  const { error } = await supabase
    .from("shops")
    .update({ data: shop.data })
    .eq("shop_id", shop.shop_id);
  if (error)
    throw new Error(
      `Не вдалося оновити shops#${shop.shop_id}: ${error.message}`
    );
}

function ensureShopHistoryRoot(shop: ShopRow): any {
  if (!shop.data || typeof shop.data !== "object") shop.data = {};
  if (!shop.data["Історія"] || typeof shop.data["Історія"] !== "object")
    shop.data["Історія"] = {};
  return shop.data["Історія"];
}

/** Зібрати з DOM рядки деталей (⚙️) з модального вікна */
function collectDetailRowsFromDom(): Array<{
  shopName: string;
  sclad_id: number | null;
  Найменування: string;
  Каталог: string | null;
  Кількість: number;
  Ціна: number;
}> {
  const rows: Array<{
    shopName: string;
    sclad_id: number | null;
    Найменування: string;
    Каталог: string | null;
    Кількість: number;
    Ціна: number;
  }> = [];

  const tableRows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );
  tableRows.forEach((tr) => {
    const nameCell = tr.querySelector(
      '[data-name="name"]'
    ) as HTMLElement | null;
    if (!nameCell) return;

    let type = nameCell.getAttribute("data-type");
    const name = cleanText(nameCell.textContent);
    if (!name) return;

    if (!type || (type !== "details" && type !== "works")) {
      const isInWorks = new Set(globalCache.works).has(name);
      const isInDetails = new Set(globalCache.details).has(name);
      type = isInWorks && !isInDetails ? "works" : "details";
      nameCell.setAttribute("data-type", type);
    }
    if (type !== "details") return;

    const qtyCell = tr.querySelector(
      '[data-name="id_count"]'
    ) as HTMLElement | null;
    const priceCell = tr.querySelector(
      '[data-name="price"]'
    ) as HTMLElement | null;
    const catalogCell = tr.querySelector(
      '[data-name="catalog"]'
    ) as HTMLElement | null;
    const pibMagazinCell = tr.querySelector(
      '[data-name="pib_magazin"]'
    ) as HTMLElement | null;

    const Каталог = cleanText(catalogCell?.textContent) || null;
    const Кількість = parseNum(qtyCell?.textContent);
    const Ціна = parseNum(priceCell?.textContent);
    const shopName = cleanText(pibMagazinCell?.textContent);

    const scladIdAttr = catalogCell?.getAttribute("data-sclad-id");
    const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;

    if (!shopName) return;
    rows.push({
      shopName,
      sclad_id,
      Найменування: name,
      Каталог,
      Кількість,
      Ціна,
    });
  });

  return rows;
}

/** Зібрати з DOM рядки робіт (🛠️) з модального вікна */
function collectWorkRowsFromDom(): Array<{
  slyusarName: string;
  Найменування: string;
  Кількість: number;
  Ціна: number;
  Зарплата: number;
}> {
  const rows: Array<{
    slyusarName: string;
    Найменування: string;
    Кількість: number;
    Ціна: number;
    Зарплата: number;
  }> = [];

  const tableRows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );
  tableRows.forEach((tr) => {
    const nameCell = tr.querySelector(
      '[data-name="name"]'
    ) as HTMLElement | null;
    if (!nameCell) return;

    let type = nameCell.getAttribute("data-type");
    const name = cleanText(nameCell.textContent);
    if (!name) return;

    if (!type || (type !== "details" && type !== "works")) {
      const isInWorks = new Set(globalCache.works).has(name);
      const isInDetails = new Set(globalCache.details).has(name);
      type = isInWorks && !isInDetails ? "works" : "details";
      nameCell.setAttribute("data-type", type);
    }
    if (type !== "works") return;

    const qtyCell = tr.querySelector(
      '[data-name="id_count"]'
    ) as HTMLElement | null;
    const priceCell = tr.querySelector(
      '[data-name="price"]'
    ) as HTMLElement | null;
    const slyusarSumCell = tr.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement | null;
    const pibMagazinCell = tr.querySelector(
      '[data-name="pib_magazin"]'
    ) as HTMLElement | null;

    const Кількість = parseNum(qtyCell?.textContent);
    const Ціна = parseNum(priceCell?.textContent);
    const Зарплата = parseNum(slyusarSumCell?.textContent);
    const slyusarName = cleanText(pibMagazinCell?.textContent);

    if (!slyusarName) return;
    rows.push({
      slyusarName,
      Найменування: name,
      Кількість,
      Ціна,
      Зарплата,
    });
  });

  return rows;
}

/** Валідація таблиці перед закриттям акту */
function validateActTableBeforeClosing(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const detailRows = collectDetailRowsFromDom();
  const workRows = collectWorkRowsFromDom();

  // Перевірка робіт (🛠️)
  for (const row of workRows) {
    const rowName = `"${row.Найменування}"`;

    if (!row.Кількість || row.Кількість === 0) {
      errors.push(`Робота ${rowName}: К-ть - не порожній і не дорівнює 0`);
    }

    if (!row.Ціна || row.Ціна === 0) {
      errors.push(`Робота ${rowName}: Ціна - не порожня і не дорівнює 0`);
    }

    // Сума розраховується як Кількість * Ціна
    const sum = row.Кількість * row.Ціна;
    if (!sum || sum === 0) {
      errors.push(`Робота ${rowName}: Сума - не порожня і не дорівнює 0`);
    }

    // Перевірка Зарплати тільки якщо стовпець відображається
    const slyusarSumCell = document.querySelector(
      `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr [data-name="slyusar_sum"]`
    ) as HTMLElement | null;
    if (slyusarSumCell && slyusarSumCell.offsetParent !== null) {
      if (!row.Зарплата || row.Зарплата === 0) {
        errors.push(`Робота ${rowName}: Зар-та - не порожня і не дорівнює 0`);
      }
    }

    // Перевірка ПІБ (Слюсара) тільки якщо стовпець відображається
    const pibMagazinCell = document.querySelector(
      `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr [data-name="pib_magazin"]`
    ) as HTMLElement | null;
    if (pibMagazinCell && pibMagazinCell.offsetParent !== null) {
      if (!row.slyusarName || row.slyusarName.trim() === "") {
        errors.push(`Робота ${rowName}: ПІБ (Слюсар) - не порожній`);
      }
    }
  }

  // Перевірка деталей (⚙️)
  for (const row of detailRows) {
    const rowName = `"${row.Найменування}"`;

    if (!row.Кількість || row.Кількість === 0) {
      errors.push(`Деталь ${rowName}: К-ть - не порожній і не дорівнює 0`);
    }

    if (!row.Ціна || row.Ціна === 0) {
      errors.push(`Деталь ${rowName}: Ціна - не порожня і не дорівнює 0`);
    }

    // Сума розраховується як Кількість * Ціна
    const sum = row.Кількість * row.Ціна;
    if (!sum || sum === 0) {
      errors.push(`Деталь ${rowName}: Сума - не порожня і не дорівнює 0`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/** Синхронізувати у shops.data.Історія для 1 акту (групування по магазинах) */
async function syncShopsHistoryForAct(params: {
  actId: number;
  dateKey: string;
  detailRows: Array<{
    shopName: string;
    sclad_id: number | null;
    Найменування: string;
    Каталог: string | null;
    Кількість: number;
    Ціна: number;
  }>;
}): Promise<void> {
  const byShop = new Map<
    string,
    Array<{
      sclad_id: number | null;
      Найменування: string;
      Каталог: string | null;
      Кількість: number;
      Ціна: number;
    }>
  >();
  const scladIds: number[] = [];

  for (const r of params.detailRows) {
    const shop = (r.shopName || "").trim();
    if (!shop) continue;
    if (r.sclad_id) scladIds.push(r.sclad_id);
    if (!byShop.has(shop)) byShop.set(shop, []);
    byShop.get(shop)!.push({
      sclad_id: r.sclad_id,
      Найменування: r.Найменування,
      Каталог: r.Каталог,
      Кількість: r.Кількість,
      Ціна: r.Ціна,
    });
  }

  const meta = await fetchScladMeta(scladIds);
  const { date_off } = await fetchActDates(params.actId);
  const dateClose = toISODateOnly(date_off);

  for (const [shopName, rows] of byShop.entries()) {
    const shopRow = await fetchShopByName(shopName);
    if (!shopRow) {
      showNotification(
        `Магазин "${shopName}" не знайдено у shops — пропущено`,
        "warning",
        1800
      );
      continue;
    }

    const out: any[] = [];
    for (const r of rows) {
      const metaR = r.sclad_id ? meta.get(r.sclad_id) || null : null;
      out.push({
        sclad_id: r.sclad_id,
        Каталог: r.Каталог
          ? isNaN(Number(r.Каталог))
            ? r.Каталог
            : Number(r.Каталог)
          : null,
        Ціна: Number(r.Ціна) || 0,
        Рахунок: metaR ? metaR.rahunok ?? null : null,
        Кількість: Number(r.Кількість) || 0,
        Найменування: r.Найменування,
      });
    }

    const history = ensureShopHistoryRoot(shopRow);
    if (!history[params.dateKey]) history[params.dateKey] = [];
    const dayBucket = history[params.dateKey] as any[];

    let actEntry = dayBucket.find(
      (e: any) => Number(e?.["Акт"]) === Number(params.actId)
    );
    if (!actEntry) {
      actEntry = {
        Акт: params.actId,
        Деталі: [],
        ДатаЗакриття: dateClose ?? null,
      };
      dayBucket.push(actEntry);
    }

    actEntry["Деталі"] = out;
    actEntry["ДатаЗакриття"] = dateClose ?? null;

    await updateShopJson(shopRow);
  }
}

/** Синхронізувати у slyusars.data.Історія для 1 акту (оновлення ДатаЗакриття) */
async function syncSlyusarsHistoryForAct(params: {
  actId: number;
  dateKey: string;
  dateClose: string | null;
}): Promise<void> {
  try {
    console.log(
      `🔍 Синхронізація slyusars для акту ${params.actId}, дата закриття: ${params.dateClose}`
    );

    // Отримуємо всіх приймальників з таблиці slyusars
    const { data: slyusarsData, error: fetchError } = await supabase
      .from("slyusars")
      .select("*");

    if (fetchError) {
      console.warn("Не вдалося отримати дані з slyusars:", fetchError.message);
      return;
    }

    if (!slyusarsData || slyusarsData.length === 0) {
      console.log("Немає даних у таблиці slyusars");
      return;
    }

    console.log(
      `📊 Знайдено ${slyusarsData.length} записів у таблиці slyusars`
    );

    // Спочатку виводимо всі доступні ключі для діагностики
    const availableKeys = Object.keys(slyusarsData[0] || {});
    console.log("🔑 Доступні ключі в таблиці slyusars:", availableKeys);

    // Визначаємо первинний ключ - перевіряємо всі можливі варіанти
    const primaryKeyCandidates = [
      "slyusar_id",
      "id",
      "slyusars_id",
      "uid",
      "pk",
    ];

    let primaryKey: string | null = null;
    for (const candidate of primaryKeyCandidates) {
      if (availableKeys.includes(candidate)) {
        primaryKey = candidate;
        console.log(`✅ Знайдено первинний ключ: "${primaryKey}"`);
        break;
      }
    }

    if (!primaryKey) {
      console.error("❌ Не вдалося визначити первинний ключ для slyusars");
      console.error("💡 Доступні ключі:", availableKeys);
      console.error("💡 Шукали:", primaryKeyCandidates);
      return;
    }

    console.log(`🔑 Використовується первинний ключ: ${primaryKey}`);

    let updatedCount = 0;
    let receiverCount = 0;

    // Проходимо по всіх приймальниках
    for (const slyusarRow of slyusarsData) {
      let slyusarData: any = {};

      // Парсимо JSON дані
      if (typeof slyusarRow.data === "string") {
        try {
          slyusarData = JSON.parse(slyusarRow.data);
        } catch (e) {
          console.warn(
            `⚠️ Не вдалося розпарсити дані для запису ${slyusarRow[primaryKey]}`
          );
          continue;
        }
      } else if (
        typeof slyusarRow.data === "object" &&
        slyusarRow.data !== null
      ) {
        slyusarData = slyusarRow.data;
      } else {
        console.warn(`⚠️ Невалідні дані для запису ${slyusarRow[primaryKey]}`);
        continue;
      }

      // Перевіряємо чи це приймальник
      const access = slyusarData["Доступ"] || "";
      const normalizedAccess = access.toLowerCase().normalize("NFKC").trim();

      if (normalizedAccess !== "приймальник") {
        console.log(
          `⏭️ Пропускаємо ${
            slyusarData["Name"] || "Невідомий"
          } - роль: ${access}`
        );
        continue;
      }

      receiverCount++;
      console.log(`👤 Знайдено приймальника: ${slyusarData["Name"]}`);

      // Перевіряємо наявність історії
      if (
        !slyusarData["Історія"] ||
        typeof slyusarData["Історія"] !== "object"
      ) {
        console.log(`⚠️ У приймальника ${slyusarData["Name"]} немає історії`);
        continue;
      }

      const history = slyusarData["Історія"];
      const historyDates = Object.keys(history);
      console.log(
        `📅 Дати в історії ${slyusarData["Name"]}: ${historyDates.join(", ")}`
      );

      let actFound = false;
      let foundInDate = "";

      // Шукаємо акт по ВСІХ датах в історії (не тільки по dateKey)
      for (const dateKey in history) {
        if (!Array.isArray(history[dateKey])) {
          console.log(`⚠️ Історія за датою ${dateKey} не є масивом`);
          continue;
        }

        const dayBucket = history[dateKey];
        console.log(
          `🔍 Перевіряємо дату ${dateKey} - актів: ${dayBucket.length}`
        );

        // Шукаємо запис з потрібним актом
        for (const actEntry of dayBucket) {
          const actNumber = actEntry?.["Акт"];
          console.log(
            `  📋 Перевіряємо акт: ${actNumber} (шукаємо ${params.actId})`
          );

          if (Number(actNumber) === Number(params.actId)) {
            // Оновлюємо дату закриття
            console.log(
              `✅ Знайдено акт ${params.actId} у приймальника ${slyusarData["Name"]} за датою ${dateKey}`
            );
            console.log(`   Поточна ДатаЗакриття: ${actEntry["ДатаЗакриття"]}`);
            console.log(`   Нова ДатаЗакриття: ${params.dateClose}`);

            actEntry["ДатаЗакриття"] = params.dateClose;
            actFound = true;
            foundInDate = dateKey;
            break;
          }
        }

        if (actFound) break; // Якщо знайшли - виходимо з циклу по датах
      }

      if (actFound) {
        console.log(`💾 Зберігаємо зміни для ${slyusarData["Name"]}`);

        // Зберігаємо оновлені дані назад у базу
        const { error: updateError } = await supabase
          .from("slyusars")
          .update({ data: slyusarData })
          .eq(primaryKey, slyusarRow[primaryKey]);

        if (updateError) {
          console.error(
            `❌ Помилка оновлення slyusars#${slyusarRow[primaryKey]}:`,
            updateError.message
          );
        } else {
          updatedCount++;
          console.log(
            `✅ Оновлено ДатаЗакриття="${params.dateClose}" для акту ${params.actId} у приймальника ${slyusarData["Name"]} (дата: ${foundInDate})`
          );
        }
      } else {
        console.log(
          `⚠️ Акт ${params.actId} не знайдено в історії приймальника ${slyusarData["Name"]}`
        );
      }
    }

    console.log(
      `📊 Підсумок: знайдено ${receiverCount} приймальників, оновлено ${updatedCount}`
    );

    if (updatedCount > 0) {
      console.log(
        `✅ Оновлено ${updatedCount} записів у slyusars для акту ${params.actId}`
      );
      showNotification(
        `✅ Історія приймальника оновлена (${updatedCount})`,
        "success",
        2000
      );
    } else {
      console.warn(
        `⚠️ Акт ${params.actId} не знайдено в історії жодного приймальника`
      );
      showNotification(
        `⚠️ Акт ${params.actId} не знайдено у приймальників`,
        "info",
        3000
      );
    }
  } catch (err) {
    console.error("❌ Помилка синхронізації slyusars:", err);
    showNotification("❌ Помилка синхронізації історії приймальника", "error");
  }
}

const FULL_ACCESS_ALIASES = [
  "адміністратор",
  "адміністатор",
  "full",
  "admin",
  "administrator",
];

function getCurrentAccessLevel(): string {
  const fromVar =
    (typeof userAccessLevel === "string" ? userAccessLevel : "") || "";
  const fromLS = getSavedUserDataFromLocalStorage?.() || null;
  const level = (fromVar || fromLS?.access || (fromLS as any)?.["Доступ"] || "")
    .toString()
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  return level;
}

function hasFullAccess(): boolean {
  return FULL_ACCESS_ALIASES.includes(getCurrentAccessLevel());
}

/* =============================== Основний обробник =============================== */

let __statusLockDelegationAttached = false;

export function initStatusLockDelegation(): void {
  if (__statusLockDelegationAttached) return;
  __statusLockDelegationAttached = true;

  document.addEventListener("click", async (ev) => {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest?.(
      "#status-lock-btn"
    ) as HTMLButtonElement | null;
    if (!btn) return;

    const actIdAttr = btn.getAttribute("data-act-id");
    const actId = actIdAttr ? Number(actIdAttr) : NaN;
    if (!Number.isFinite(actId)) {
      console.error("data-act-id на кнопці відсутній/некоректний");
      showNotification("Помилка: не визначено ID акту", "error");
      return;
    }

    if (btn.disabled) return;
    btn.disabled = true;

    try {
      // ======================= ВІДКРИТТЯ АКТУ =======================
      if (globalCache.isActClosed) {
        // Перевіряємо право відкриття акту через settings
        // Адміністратор завжди має право, інші ролі перевіряються через БД
        let canOpen = true;

        if (!hasFullAccess()) {
          try {
            canOpen = await canUserOpenClosedActs();
          } catch (permErr) {
            console.error("Помилка перевірки прав відкриття акту:", permErr);
            // Якщо помилка при читанні settings — блокуємо доступ для безпеки
            canOpen = false;
          }

          if (!canOpen) {
            showNotification(
              "❌ У вас ця функція недоступна. Зверніться до адміністратора.",
              "warning",
              4000
            );
            btn.disabled = false;
            return;
          }
        }

        const passwordCorrect = await showViknoVvodyParolu(actId);
        if (!passwordCorrect) {
          showNotification("Скасовано відкриття акту", "warning");
          btn.disabled = false;
          return;
        }

        showNotification("Відкриття акту...", "info");

        const { data: scladRows, error: scladError } = await supabase
          .from("sclad")
          .select("sclad_id")
          .eq("akt", actId);

        if (scladError)
          throw new Error(
            "Не вдалося отримати записи складу: " + scladError.message
          );

        if (scladRows && scladRows.length > 0) {
          const { error: updateScladError } = await supabase
            .from("sclad")
            .update({ time_off: null })
            .eq("akt", actId);
          if (updateScladError)
            throw new Error(
              "Не вдалося очистити time_off: " + updateScladError.message
            );
        }

        const { error: actError } = await supabase
          .from("acts")
          .update({ date_off: null })
          .eq("act_id", actId);
        if (actError)
          throw new Error("Не вдалося відкрити акт: " + actError.message);

        const { date_on } = await fetchActDates(actId);
        const dateKey = toISODateOnly(date_on);
        if (dateKey) {
          const detailRows = collectDetailRowsFromDom();
          if (detailRows.length) {
            await syncShopsHistoryForAct({ actId, dateKey, detailRows });
          }
          // Оновлюємо дату закриття в історії приймальників (null при відкритті)
          await syncSlyusarsHistoryForAct({ actId, dateKey, dateClose: null });
        } else {
          showNotification(
            "Не вдалось визначити дату відкриття акту — Історія в shops не оновлена",
            "warning",
            2000
          );
        }

        globalCache.isActClosed = false;
        await loadGlobalData();

        await showModal(actId);

        refreshActsTable();
        showNotification("Акт успішно відкрито", "success");
      } else {
        // ======================= ЗАКРИТТЯ АКТУ =======================

        // 1️⃣ Перевіряємо право закриття акту через settings (Приймальник/Слюсар/Запчастист/Складовщик)
        //    Адміністратор завжди має право незалежно від settings.
        let canClose = true;
        if (!hasFullAccess()) {
          try {
            canClose = await canUserCloseActs();
          } catch (permErr) {
            console.error("Помилка перевірки прав закриття акту:", permErr);
            // Якщо щось пішло не так при читанні settings — МИ НЕ БЛОКУЄМО,
            // щоб не покласти роботу. Але це можна змінити, якщо хочеш.
            canClose = true;
          }

          if (!canClose) {
            showNotification(
              "У вас немає права закривати акти. Зверніться до адміністратора.",
              "warning",
              4000
            );
            btn.disabled = false;
            return;
          }
        }

        // 2️⃣ Валідація всіх полів таблиці перед закриттям
        const validationResult = validateActTableBeforeClosing();
        if (!validationResult.isValid) {
          showNotification(
            "❌ Закриття відмінено, заповність всі поля таблиці",
            "error",
            5000
          );
          console.warn(
            "Помилки валідації таблиці перед закриттям:",
            validationResult.errors
          );
          validationResult.errors.forEach((err) => {
            console.warn(`  • ${err}`);
          });
          btn.disabled = false;
          return;
        }

        // 3️⃣ Автозбереження перед закриттям
        console.log("Автоматичне збереження перед закриттям...");
        (
          document.getElementById(ZAKAZ_NARAYD_SAVE_BTN_ID) as HTMLButtonElement
        )?.click();

        // 4️⃣ Вікно підтвердження закриття (як в адміна, з попередженнями)
        const confirmed = await showViknoPidtverdchennayZakruttiaAkty(actId);
        if (!confirmed) {
          showNotification("Скасовано закриття акту", "warning");
          btn.disabled = false;
          return;
        }

        showNotification("Закриття акту...", "info");

        // 5️⃣ Оновлюємо дати в БД та історію
        const { data: scladRows, error: scladError } = await supabase
          .from("sclad")
          .select("sclad_id")
          .eq("akt", actId);

        if (scladError)
          throw new Error(
            "Не вдалося отримати записи складу: " + scladError.message
          );

        const currentDateTime = new Date().toISOString();

        if (scladRows && scladRows.length > 0) {
          const { error: updateScladError } = await supabase
            .from("sclad")
            .update({ time_off: currentDateTime })
            .eq("akt", actId);
          if (updateScladError)
            throw new Error(
              "Не вдалося оновити time_off: " + updateScladError.message
            );
        }

        const { error: actError } = await supabase
          .from("acts")
          .update({ date_off: currentDateTime })
          .eq("act_id", actId);
        if (actError)
          throw new Error("Не вдалося закрити акт: " + actError.message);

        // Используем то же время, что и для записи в БД, чтобы избежать рассинхрона
        const { date_on } = await fetchActDates(actId);
        const dateKey = toISODateOnly(date_on);
        const dateClose = toISODateOnly(currentDateTime); // Генеруємо напряму з currentDateTime

        if (dateKey) {
          const detailRows = collectDetailRowsFromDom();
          if (detailRows.length) {
            await syncShopsHistoryForAct({ actId, dateKey, detailRows });
          }
          // Оновлюємо дату закриття в історії приймальників
          await syncSlyusarsHistoryForAct({ actId, dateKey, dateClose });
        } else {
          showNotification(
            "Не вдалось визначити дату відкриття акту — Історія в shops не оновлена",
            "warning",
            2000
          );
        }

        globalCache.isActClosed = true;
        await loadGlobalData();

        await showModal(actId);

        refreshActsTable();
        showNotification("Акт успішно закрито", "success");
      }
    } catch (err: any) {
      console.error("Помилка в обробнику статус-замка:", err);
      showNotification("Помилка: " + (err?.message || err), "error");
    } finally {
      btn.disabled = false;
    }
  });
}
