// src/ts/roboha/zakaz_naraudy/inhi/knopka_zamok.ts
import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna"; // УВАГА: українська "і"
import { showViknoPidtverdchennayZakruttiaAkty } from "./vikno_pidtverdchennay_zakruttia_akty";
import { showViknoVvodyParolu } from "./vikno_vvody_parolu";
import {
  globalCache,
  loadGlobalData,
  ACT_ITEMS_TABLE_CONTAINER_ID,
} from "../globalCache";
import { refreshActsTable } from "../../tablucya/tablucya";
import { showModal } from "../modalMain";
import {
  getSavedUserDataFromLocalStorage,
  userAccessLevel,
} from "../../tablucya/users"; // Додаємо для перевірки прав

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
    .select("sclad_id, rahunok, time_off") // ✅ тягнемо rahunok
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

    // Тип: якщо не вказаний — орієнтуємось на глобальні довідники
    let type = nameCell.getAttribute("data-type");
    const name = cleanText(nameCell.textContent);
    if (!name) return;

    if (!type || (type !== "details" && type !== "works")) {
      const isInWorks = new Set(globalCache.works).has(name);
      const isInDetails = new Set(globalCache.details).has(name);
      type = isInWorks && !isInDetails ? "works" : "details";
      nameCell.setAttribute("data-type", type);
    }
    if (type !== "details") return; // беремо тільки ⚙️ Деталі

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

    if (!shopName) return; // без магазину пропускаємо
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
  // Групуємо за магазином
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

  // Метадані складу (рахунок/час закриття рядка)
  const meta = await fetchScladMeta(scladIds);

  // Дату закриття акту беремо з acts.date_off (або null)
  const { date_off } = await fetchActDates(params.actId);
  const dateClose = toISODateOnly(date_off); // null, якщо акт відкритий

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
        Рахунок: metaR ? metaR.rahunok ?? null : null, // ✅ беремо з колонки rahunok
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
      // створюємо без "Статус", одразу з "ДатаЗакриття"
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

// Константи для повного доступу (адміністратор)
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

// ⬇️ ДОДАЙ НАВЕРХУ ФАЙЛУ (після import'ів)
let __statusLockDelegationAttached = false;

// ⬇️ ЗАМІНИ ЦЮ ФУНКЦІЮ НА НОВУ (стара addStatusLockHandler — ВИДАЛИТИ)
export function initStatusLockDelegation(): void {
  if (__statusLockDelegationAttached) return;
  __statusLockDelegationAttached = true;

  document.addEventListener("click", async (ev) => {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest?.(
      "#status-lock-btn"
    ) as HTMLButtonElement | null;
    if (!btn) return;

    // беремо Акт з поточної кнопки (у тебе він вже проставляється у modalMain.ts)
    const actIdAttr = btn.getAttribute("data-act-id");
    const actId = actIdAttr ? Number(actIdAttr) : NaN;
    if (!Number.isFinite(actId)) {
      console.error("data-act-id на кнопці відсутній/некоректний");
      showNotification("Помилка: не визначено ID акту", "error");
      return;
    }

    // захист від подвійних кліків
    if (btn.disabled) return;
    btn.disabled = true;

    try {
      if (globalCache.isActClosed) {
        // --------------------------- ВІДКРИТТЯ АКТУ ---------------------------
        // Перевірка прав: тільки адміністратор може відкривати закриті акти
        if (!hasFullAccess()) {
          showNotification(
            "❌ Тільки адміністратор може відкривати закриті акти",
            "error",
            4000
          );
          btn.disabled = false; // Розблокувати кнопку
          return;
        }

        const passwordCorrect = await showViknoVvodyParolu(actId);
        if (!passwordCorrect) {
          showNotification("Скасовано відкриття акту", "warning");
          btn.disabled = false; // Розблокувати кнопку
          return;
        }

        showNotification("Відкриття акту...", "info");

        // Скидаємо time_off у всіх рядках складу, прив'язаних до акту
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

        // Відкрити сам акт
        const { error: actError } = await supabase
          .from("acts")
          .update({ date_off: null })
          .eq("act_id", actId);
        if (actError)
          throw new Error("Не вдалося відкрити акт: " + actError.message);

        // >>> СИНХРОНІЗАЦІЯ SHOPS після відкриття <<<
        const { date_on } = await fetchActDates(actId);
        const dateKey = toISODateOnly(date_on);
        if (dateKey) {
          const detailRows = collectDetailRowsFromDom();
          if (detailRows.length) {
            await syncShopsHistoryForAct({ actId, dateKey, detailRows });
          }
        } else {
          showNotification(
            "Не вдалось визначити дату відкриття акту — Історія в shops не оновлена",
            "warning",
            2000
          );
        }

        globalCache.isActClosed = false;
        await loadGlobalData();
        await showModal(actId); // DOM перемальовано, але делегування вже все покриває
        refreshActsTable();
        showNotification("Акт успішно відкрито", "success");
      } else {
        // --------------------------- ЗАКРИТТЯ АКТУ ---------------------------
        const confirmed = await showViknoPidtverdchennayZakruttiaAkty(actId);
        if (!confirmed) {
          showNotification("Скасовано закриття акту", "warning");
          btn.disabled = false; // Розблокувати кнопку
          return;
        }

        showNotification("Закриття акту...", "info");

        // проставити time_off для всіх рядків складу, прив'язаних до акту
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

        // Закрити акт
        const { error: actError } = await supabase
          .from("acts")
          .update({ date_off: currentDateTime })
          .eq("act_id", actId);
        if (actError)
          throw new Error("Не вдалося закрити акт: " + actError.message);

        // >>> СИНХРОНІЗАЦІЯ SHOPS після закриття <<<
        const { date_on } = await fetchActDates(actId);
        const dateKey = toISODateOnly(date_on);
        if (dateKey) {
          const detailRows = collectDetailRowsFromDom();
          if (detailRows.length) {
            await syncShopsHistoryForAct({ actId, dateKey, detailRows });
          }
        } else {
          showNotification(
            "Не вдалось визначити дату відкриття акту — Історія в shops не оновлена",
            "warning",
            2000
          );
        }

        globalCache.isActClosed = true;
        await loadGlobalData();
        await showModal(actId); // DOM перемальовано, але делегування вже все покриває
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
