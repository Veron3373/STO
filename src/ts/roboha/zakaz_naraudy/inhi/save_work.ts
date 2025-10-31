//src\ts\roboha\zakaz_naraudy\inhi\save_work.ts
import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna";
import { globalCache, ACT_ITEMS_TABLE_CONTAINER_ID } from "../globalCache";
import { safeParseJSON } from "./ctvorennia_papku_googleDrive.";

/* ===================== ХЕЛПЕРИ ДЛЯ SLYUSARS ===================== */

type SlyusarRow = { slyusar_id?: number; data: any };

function toISODateOnly(dt: string | Date | null | undefined): string | null {
  if (!dt) return null;
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (!d || isNaN(+d)) return null;
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

async function fetchActClientAndCarData(actId: number): Promise<{
  clientInfo: string;
  carInfo: string;
}> {
  try {
    const { data: act, error: actError } = await supabase
      .from("acts")
      .select("client_id, cars_id")
      .eq("act_id", actId)
      .single();

    if (actError || !act) {
      console.warn("Не вдалося отримати дані акту:", actError?.message);
      return { clientInfo: "—", carInfo: "—" };
    }

    let clientInfo = "—";
    if (act.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("data")
        .eq("client_id", act.client_id)
        .single();

      if (client?.data) {
        const clientData = safeParseJSON(client.data);
        clientInfo = clientData?.["ПІБ"] || clientData?.fio || "—";
      }
    }

    let carInfo = "—";
    if (act.cars_id) {
      const { data: car } = await supabase
        .from("cars")
        .select("data")
        .eq("cars_id", act.cars_id)
        .single();

      if (car?.data) {
        const carData = safeParseJSON(car.data);
        const auto = carData?.["Авто"] || "";
        const year = carData?.["Рік"] || "";
        const nomer = carData?.["Номер авто"] || "";
        carInfo = `${auto} ${year} ${nomer}`.trim() || "—";
      }
    }

    return { clientInfo, carInfo };
  } catch (error) {
    console.warn("Помилка при отриманні даних клієнта та авто:", error);
    return { clientInfo: "—", carInfo: "—" };
  }
}

async function fetchSlyusarByName(name: string): Promise<SlyusarRow | null> {
  const { data, error } = await supabase
    .from("slyusars")
    .select("slyusar_id, data")
    .eq("data->>Name", name)
    .maybeSingle();

  if (error) {
    console.warn(`fetchSlyusarByName(${name}):`, error.message);
    return null;
  }
  if (!data) return null;
  return { slyusar_id: data.slyusar_id, data: data.data };
}

async function updateSlyusarJson(row: SlyusarRow): Promise<void> {
  if (!row.slyusar_id) return;
  const { error } = await supabase
    .from("slyusars")
    .update({ data: row.data })
    .eq("slyusar_id", row.slyusar_id);
  if (error)
    throw new Error(
      `Не вдалося оновити slyusars#${row.slyusar_id}: ${error.message}`
    );
}

function ensureSlyusarHistoryRoot(row: SlyusarRow): any {
  if (!row.data || typeof row.data !== "object") row.data = {};
  if (!row.data["Історія"] || typeof row.data["Історія"] !== "object")
    row.data["Історія"] = {};
  return row.data["Історія"];
}

const cleanText = (s?: string | null) =>
  (s ?? "").replace(/\u00A0/g, " ").trim();
const parseNum = (s?: string | null) => {
  const v = cleanText(s).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
};

function collectPrevWorkRowsFromCache(): Array<{
  slyusarName: string;
  Найменування: string;
  Кількість: number;
  Ціна: number;
  Зарплата?: number;
}> {
  const out: Array<{
    slyusarName: string;
    Найменування: string;
    Кількість: number;
    Ціна: number;
    Зарплата?: number;
  }> = [];

  for (const it of globalCache.initialActItems || []) {
    if (it.type !== "work") continue;
    const slyusarName = (it.person_or_store || "").trim();
    if (!slyusarName) continue;

    const tableRows = document.querySelectorAll(
      `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
    );
    let slyusarSum = 0;

    tableRows.forEach((row) => {
      const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
      const pibCell = row.querySelector(
        '[data-name="pib_magazin"]'
      ) as HTMLElement;
      const slyusarSumCell = row.querySelector(
        '[data-name="slyusar_sum"]'
      ) as HTMLElement;

      if (
        nameCell?.textContent?.trim() === it.name &&
        pibCell?.textContent?.trim() === slyusarName
      ) {
        slyusarSum = parseNum(slyusarSumCell?.textContent);
      }
    });

    out.push({
      slyusarName,
      Найменування: it.name || "",
      Кількість: Number(it.quantity ?? 0),
      Ціна: Number(it.price ?? 0),
      Зарплата: slyusarSum,
    });
  }
  return out;
}

function collectCurrentWorkSlyusarsFromTable(): string[] {
  const names = new Set<string>();
  const rows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );
  rows.forEach((row) => {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    if (!nameCell) return;
    const typeFromCell = nameCell.getAttribute("data-type");
    if (typeFromCell !== "works") return;
    const pibCell = row.querySelector(
      '[data-name="pib_magazin"]'
    ) as HTMLElement;
    const slyusarName = cleanText(pibCell?.textContent);
    if (slyusarName) names.add(slyusarName);
  });
  return Array.from(names);
}

/* ============================= ОСНОВНА СИНХРОНІЗАЦІЯ ============================= */

export interface WorkRow {
  slyusarName: string;
  Найменування: string;
  Кількість: number;
  Ціна: number;
  Зарплата: number;
}

async function syncSlyusarsHistoryForAct(params: {
  actId: number;
  dateKey: string;
  dateClose: string | null;
  clientInfo: string;
  carInfo: string;
  currentRows: Array<{
    slyusarName: string;
    Найменування: string;
    Кількість: number;
    Ціна: number;
    Зарплата: number;
  }>;
  prevRows: Array<{
    slyusarName: string;
  }>;
}): Promise<void> {
  const group = (rows: any[]) => {
    const m = new Map<string, any[]>();
    for (const r of rows) {
      const k = String(r.slyusarName || "").trim();
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  };

  const curBySlyusar = group(params.currentRows);
  const prevBySlyusar = group(params.prevRows);

  // ОНОВИТИ / СТВОРИТИ
  for (const [slyusarName, rows] of curBySlyusar.entries()) {
    const slyRow = await fetchSlyusarByName(slyusarName);
    if (!slyRow) {
      showNotification(
        `Слюсар "${slyusarName}" не знайдений у slyusars — пропущено`,
        "warning",
        1800
      );
      continue;
    }

    const zapis: Array<{
      Ціна: number;
      Кількість: number;
      Робота: string;
      Зарплата: number;
    }> = [];
    let summaRob = 0;

    for (const r of rows) {
      const qty = Number(r.Кількість) || 0;
      const price = Number(r.Ціна) || 0;
      const zp = Number(r.Зарплата) || 0;
      zapis.push({
        Ціна: price,
        Кількість: qty,
        Робота: r.Найменування || "",
        Зарплата: zp,
      });
      summaRob += price * qty;
    }

    const history = ensureSlyusarHistoryRoot(slyRow);
    if (!history[params.dateKey]) history[params.dateKey] = [];
    const dayBucket = history[params.dateKey] as any[];

    let actEntry = dayBucket.find(
      (e: any) => String(e?.["Акт"]) === String(params.actId)
    );
    if (!actEntry) {
      actEntry = {
        Акт: String(params.actId),
        Записи: [],
        СуммаРоботи: 0,
        ДатаЗакриття: null,
        Клієнт: "",
        Автомобіль: "",
      };
      dayBucket.push(actEntry);
    }

    actEntry["Записи"] = zapis;
    actEntry["СуммаРоботи"] = Math.max(
      0,
      Math.round((summaRob + Number.EPSILON) * 100) / 100
    );
    actEntry["ДатаЗакриття"] = params.dateClose;
    actEntry["Клієнт"] = params.clientInfo;
    actEntry["Автомобіль"] = params.carInfo;

    await updateSlyusarJson(slyRow);
  }

  // ОЧИСТИТИ СТАРИХ
  for (const [oldName] of prevBySlyusar.entries()) {
    if (curBySlyusar.has(oldName)) continue;

    const slyRow = await fetchSlyusarByName(oldName);
    if (!slyRow) continue;

    const history = ensureSlyusarHistoryRoot(slyRow);
    const dayBucket = history[params.dateKey] as any[] | undefined;
    if (!dayBucket) continue;

    const idx = dayBucket.findIndex(
      (e: any) => String(e?.["Акт"]) === String(params.actId)
    );
    if (idx === -1) continue;

    const actEntry = dayBucket[idx];
    if (actEntry?.["Записи"] && Array.isArray(actEntry["Записи"])) {
      actEntry["Записи"].forEach((zap: any) => {
        zap["Зарплата"] = 0;
      });
    }

    dayBucket.splice(idx, 1);
    await updateSlyusarJson(slyRow);
  }
}

export async function syncSlyusarsOnActSave(
  actId: number,
  workRowsForSlyusars: Array<{
    slyusarName: string;
    Найменування: string;
    Кількість: number;
    Ціна: number;
    Зарплата: number;
  }>
): Promise<void> {
  try {
    const { date_on, date_off } = await fetchActDates(actId);
    const dateKey = toISODateOnly(date_on);
    const dateClose = toISODateOnly(date_off);

    if (!dateKey) {
      showNotification(
        "Не вдалось визначити дату відкриття акту — Історія в slyusars не оновлена",
        "warning",
        2000
      );
      return;
    }

    const { clientInfo, carInfo } = await fetchActClientAndCarData(actId);
    const prevWorkRows = collectPrevWorkRowsFromCache();

    await syncSlyusarsHistoryForAct({
      actId,
      dateKey,
      dateClose,
      clientInfo,
      carInfo,
      currentRows: workRowsForSlyusars,
      prevRows: prevWorkRows.map((r) => ({ slyusarName: r.slyusarName })),
    });
  } catch (error: any) {
    console.error("Помилка синхронізації з slyusars:", error);
    showNotification(
      "Помилка синхронізації з ПІБ (слюсарями): " + (error?.message || error),
      "error",
      3000
    );
  }
}

/* ========================== ЗАКРИТТЯ / ВІДКРИТТЯ АКТУ ========================== */

export async function closeActAndMarkSlyusars(actId: number): Promise<void> {
  try {
    const now = new Date();
    const nowISO = now.toISOString();
    const nowDateOnly = toISODateOnly(now)!;

    const { error: upErr } = await supabase
      .from("acts")
      .update({ date_off: nowISO })
      .eq("act_id", actId);
    if (upErr)
      throw new Error(
        "Не вдалося оновити дату закриття акту: " + upErr.message
      );

    const { date_on } = await fetchActDates(actId);
    const dateKey = toISODateOnly(date_on);
    if (!dateKey) return;

    const { clientInfo, carInfo } = await fetchActClientAndCarData(actId);

    const slyusarNames = collectCurrentWorkSlyusarsFromTable();
    for (const name of slyusarNames) {
      const row = await fetchSlyusarByName(name);
      if (!row) continue;
      const history = ensureSlyusarHistoryRoot(row);
      const dayBucket = (history[dateKey] as any[]) || [];
      const actEntry = dayBucket.find(
        (e: any) => String(e?.["Акт"]) === String(actId)
      );
      if (actEntry) {
        actEntry["ДатаЗакриття"] = nowDateOnly;
        actEntry["Клієнт"] = clientInfo;
        actEntry["Автомобіль"] = carInfo;

        if (actEntry["Записи"] && Array.isArray(actEntry["Записи"])) {
          actEntry["Записи"].forEach((zap: any) => {
            if (!("Зарплата" in zap)) {
              zap["Зарплата"] = 0;
            }
          });
        }

        await updateSlyusarJson(row);
      }
    }

    showNotification(
      "Акт закрито. Дату закриття та дані клієнта оновлено у ПІБ.",
      "success",
      1800
    );
  } catch (e: any) {
    console.error(e);
    showNotification(
      "Помилка при закритті акту: " + (e?.message || e),
      "error",
      2500
    );
  }
}

export async function reopenActAndClearSlyusars(actId: number): Promise<void> {
  try {
    const { error: upErr } = await supabase
      .from("acts")
      .update({ date_off: null })
      .eq("act_id", actId);
    if (upErr)
      throw new Error("Не вдалося зняти дату закриття акту: " + upErr.message);

    const { date_on } = await fetchActDates(actId);
    const dateKey = toISODateOnly(date_on);
    if (!dateKey) return;

    const { clientInfo, carInfo } = await fetchActClientAndCarData(actId);

    const slyusarNames = collectCurrentWorkSlyusarsFromTable();
    for (const name of slyusarNames) {
      const row = await fetchSlyusarByName(name);
      if (!row) continue;
      const history = ensureSlyusarHistoryRoot(row);
      const dayBucket = (history[dateKey] as any[]) || [];
      const actEntry = dayBucket.find(
        (e: any) => String(e?.["Акт"]) === String(actId)
      );
      if (actEntry) {
        actEntry["ДатаЗакриття"] = null;
        actEntry["Клієнт"] = clientInfo;
        actEntry["Автомобіль"] = carInfo;

        if (actEntry["Записи"] && Array.isArray(actEntry["Записи"])) {
          actEntry["Записи"].forEach((zap: any) => {
            if (!("Зарплата" in zap)) {
              zap["Зарплата"] = 0;
            }
          });
        }

        await updateSlyusarJson(row);
      }
    }

    showNotification(
      "Акт відкрито. Дату закриття очищено, дані клієнта оновлено у ПІБ.",
      "success",
      1800
    );
  } catch (e: any) {
    console.error(e);
    showNotification(
      "Помилка при відкритті акту: " + (e?.message || e),
      "error",
      2500
    );
  }
}

/* =========================== ДОДАТКОВО: ЗБІР З DOM =========================== */

export function buildWorkRowsForSlyusarsFromDOM(): Array<{
  slyusarName: string;
  Найменування: string;
  Кількість: number;
  Ціна: number;
  Зарплата: number;
}> {
  const out: Array<{
    slyusarName: string;
    Найменування: string;
    Кількість: number;
    Ціна: number;
    Зарплата: number;
  }> = [];
  const rows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );

  rows.forEach((row) => {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    if (!nameCell) return;
    const typeFromCell = nameCell.getAttribute("data-type");
    if (typeFromCell !== "works") return;

    const workName = cleanText(nameCell?.textContent);
    if (!workName) return;

    const qtyCell = row.querySelector(
      '[data-name="id_count"]'
    ) as HTMLElement;
    const priceCell = row.querySelector(
      '[data-name="price"]'
    ) as HTMLElement;
    const pibCell = row.querySelector(
      '[data-name="pib_magazin"]'
    ) as HTMLElement;
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;

    const qty = parseNum(qtyCell?.textContent);
    const price = parseNum(priceCell?.textContent);
    const slyusarName = cleanText(pibCell?.textContent);
    const zp = parseNum(slyusarSumCell?.textContent);

    if (!slyusarName) return;
    out.push({
      slyusarName,
      Найменування: workName,
      Кількість: qty,
      Ціна: price,
      Зарплата: zp,
    });
  });

  return out;
}