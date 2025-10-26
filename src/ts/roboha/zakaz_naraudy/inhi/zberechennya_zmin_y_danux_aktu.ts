import { supabase } from "../../../vxid/supabaseClient";
import { showNotification } from "./vspluvauhe_povidomlenna";
import {
  globalCache,
  ZAKAZ_NARAYD_SAVE_BTN_ID,
  EDITABLE_PROBIG_ID,
  EDITABLE_REASON_ID,
  EDITABLE_RECOMMENDATIONS_ID,
  ACT_ITEMS_TABLE_CONTAINER_ID,
  loadGlobalData,
} from "../globalCache";
import { updateCalculatedSumsInFooter } from "../modalUI";
import { refreshActsTable } from "../../tablucya/tablucya";
import { refreshQtyWarningsIn } from "./kastomna_tabluca";
import { syncShopsOnActSave } from "./save_shops";
import { syncSlyusarsOnActSave } from "./save_work";

/* =============================== ТИПИ І ІНТЕРФЕЙСИ =============================== */

interface DetailRow {
  shopName: string;
  sclad_id: number | null;
  Найменування: string;
  Каталог: string | null;
  Кількість: number;
  Ціна: number;
}

interface WorkRow {
  slyusarName: string;
  Найменування: string;
  Кількість: number;
  Ціна: number;
  Зарплата: number;
}

interface ParsedItem {
  type: "detail" | "work";
  name: string;
  quantity: number;
  price: number;
  sum: number;
  pibMagazin: string;
  catalog: string;
  sclad_id: number | null;
  slyusar_id: number | null;
  slyusarSum?: number;
}

/* =============================== УТИЛІТИ =============================== */

const cleanText = (s?: string | null): string =>
  (s ?? "").replace(/\u00A0/g, " ").trim();

const parseNum = (s?: string | null): number => {
  const v = cleanText(s).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
};

const getCellText = (el?: HTMLElement | null): string =>
  cleanText(el?.textContent);

const validateActId = (actId: number): void => {
  if (!Number.isInteger(actId) || actId <= 0) {
    throw new Error("Невірний формат номера акту");
  }
};

/* =============================== РОБОТА З ТАБЛИЦЕЮ =============================== */

function readTableNewNumbers(): Map<number, number> {
  const tableRows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );
  const numberMap = new Map<number, number>();

  tableRows.forEach((row) => {
    const nameCell = row.querySelector(
      '[data-name="name"]'
    ) as HTMLElement | null;
    if (!nameCell?.textContent?.trim()) return;

    const catalogCell = row.querySelector(
      '[data-name="catalog"]'
    ) as HTMLElement | null;
    const qtyCell = row.querySelector(
      '[data-name="id_count"]'
    ) as HTMLElement | null;
    const scladIdAttr = catalogCell?.getAttribute("data-sclad-id");

    if (!scladIdAttr) return;

    const sclad_id = Number(scladIdAttr);
    const qty = parseNum(qtyCell?.textContent);

    if (!isNaN(sclad_id)) {
      numberMap.set(sclad_id, (numberMap.get(sclad_id) || 0) + qty);
    }
  });

  return numberMap;
}

function parseTableRows(): ParsedItem[] {
  const tableRows = document.querySelectorAll(
    `#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`
  );
  const items: ParsedItem[] = [];

  tableRows.forEach((row: Element) => {
    const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
    const name = getCellText(nameCell);
    if (!name) return;

    const quantityCell = row.querySelector(
      '[data-name="id_count"]'
    ) as HTMLElement;
    const priceCell = row.querySelector('[data-name="price"]') as HTMLElement;
    const sumCell = row.querySelector('[data-name="sum"]') as HTMLElement;
    const pibMagazinCell = globalCache.settings.showPibMagazin
      ? (row.querySelector('[data-name="pib_magazin"]') as HTMLElement)
      : null;
    const catalogCell = globalCache.settings.showCatalog
      ? (row.querySelector('[data-name="catalog"]') as HTMLElement)
      : null;
    const slyusarSumCell = row.querySelector(
      '[data-name="slyusar_sum"]'
    ) as HTMLElement;

    const quantity = parseNum(quantityCell?.textContent);
    const price = parseNum(priceCell?.textContent);
    const sum = parseNum(sumCell?.textContent);
    const pibMagazin = getCellText(pibMagazinCell);
    const catalog = getCellText(catalogCell);
    const slyusarSum = parseNum(slyusarSumCell?.textContent);

    const scladIdAttr = catalogCell?.getAttribute("data-sclad-id");
    const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;
    const slyusar_id = nameCell.getAttribute("data-slyusar-id")
      ? Number(nameCell.getAttribute("data-slyusar-id"))
      : null;

    const typeFromCell = nameCell.getAttribute("data-type");
    const type =
      typeFromCell === "works" || globalCache.works.includes(name)
        ? "work"
        : "detail";

    items.push({
      type,
      name,
      quantity,
      price,
      sum,
      pibMagazin,
      catalog,
      sclad_id,
      slyusar_id,
      slyusarSum,
    });
  });

  return items;
}

/* =============================== РОБОТА З БАЗОЮ ДАНИХ =============================== */

async function updateScladActNumbers(
  actId: number,
  newScladIds: Set<number>
): Promise<void> {
  validateActId(actId);

  const initialScladIds = new Set(
    (globalCache.initialActItems || [])
      .filter((item) => item.type === "detail" && item.sclad_id != null)
      .map((item) => item.sclad_id!)
  );

  const scladIdsToSetAct = Array.from(newScladIds);
  const scladIdsToClearAct = Array.from(initialScladIds).filter(
    (id) => !newScladIds.has(id)
  );

  if (scladIdsToSetAct.length > 0) {
    await updateScladAkt(scladIdsToSetAct, actId);
  }

  if (scladIdsToClearAct.length > 0) {
    await updateScladAkt(scladIdsToClearAct, null);
  }
}

async function updateScladAkt(
  scladIds: number[],
  aktValue: number | null
): Promise<void> {
  if (scladIds.length === 0) return;

  const { data: rows, error: selErr } = await supabase
    .from("sclad")
    .select("sclad_id")
    .in("sclad_id", scladIds);

  if (selErr) {
    console.error("Помилка при отриманні записів sclad:", selErr);
    throw new Error(`Не вдалося отримати записи складу: ${selErr.message}`);
  }

  const foundIds = new Set(rows?.map((r) => Number(r.sclad_id)) || []);
  const missingIds = scladIds.filter((id) => !foundIds.has(id));

  if (missingIds.length > 0) {
    console.warn(`Записи sclad_id не знайдено:`, missingIds);
  }

  const existingIds = scladIds.filter((id) => foundIds.has(id));
  if (existingIds.length > 0) {
    const { error: updateErr } = await supabase
      .from("sclad")
      .update({ akt: aktValue })
      .in("sclad_id", existingIds);

    if (updateErr) {
      console.error("Помилка при оновленні akt:", updateErr);
      throw new Error(`Не вдалося оновити akt: ${updateErr.message}`);
    }
  }
}

async function applyScladDeltas(deltas: Map<number, number>): Promise<void> {
  if (deltas.size === 0) return;

  const ids = Array.from(deltas.keys());
  const { data: rows, error: selErr } = await supabase
    .from("sclad")
    .select("sclad_id, kilkist_off")
    .in("sclad_id", ids);

  if (selErr) {
    throw new Error(
      `Не вдалося отримати склад для оновлення: ${selErr.message}`
    );
  }

  const updates = ids
    .map((id) => {
      const row = rows?.find((r) => Number(r.sclad_id) === id);
      if (!row) {
        console.warn(`Запис sclad_id=${id} не знайдено`);
        return null;
      }

      const currentOff = Number(row.kilkist_off ?? 0);
      const delta = Number(deltas.get(id) || 0);
      const newOff = Math.max(0, currentOff + delta);

      return { sclad_id: id, kilkist_off: newOff };
    })
    .filter((update): update is NonNullable<typeof update> => update !== null);

  if (updates.length > 0) {
    for (const update of updates) {
      const { error: upErr } = await supabase
        .from("sclad")
        .update({ kilkist_off: update.kilkist_off })
        .eq("sclad_id", update.sclad_id);

      if (upErr) {
        throw new Error(
          `Помилка оновлення складу #${update.sclad_id}: ${upErr.message}`
        );
      }
    }
  }
}

/* =============================== ГОЛОВНА ЛОГІКА ЗБЕРЕЖЕННЯ =============================== */

function calculateDeltas(): Map<number, number> {
  const newNumbers = readTableNewNumbers();
  const oldNumbers = globalCache.oldNumbers || new Map<number, number>();
  const allIds = new Set<number>([
    ...Array.from(newNumbers.keys()),
    ...Array.from(oldNumbers.keys()),
  ]);

  const deltas = new Map<number, number>();
  for (const id of allIds) {
    const delta = (newNumbers.get(id) || 0) - (oldNumbers.get(id) || 0);
    if (delta !== 0) {
      deltas.set(id, delta);
    }
  }

  return deltas;
}

function processItems(items: ParsedItem[]) {
  const details: any[] = [];
  const works: any[] = [];
  const detailRowsForShops: DetailRow[] = [];
  const workRowsForSlyusars: WorkRow[] = [];
  const newScladIds = new Set<number>();

  let totalDetailsSum = 0;
  let totalWorksSum = 0;

  items.forEach((item) => {
    const {
      type,
      name,
      quantity,
      price,
      sum,
      pibMagazin,
      catalog,
      sclad_id,
      slyusar_id,
      slyusarSum,
    } = item;
    const itemBase = { Кількість: quantity, Ціна: price, Сума: sum };

    if (type === "work") {
      works.push({
        ...itemBase,
        Робота: name,
        Слюсар: pibMagazin,
        Каталог: catalog,
        slyusar_id,
      });
      totalWorksSum += sum;

      if (pibMagazin) {
        workRowsForSlyusars.push({
          slyusarName: pibMagazin,
          Найменування: name,
          Кількість: quantity,
          Ціна: price,
          Зарплата: slyusarSum || 0,
        });
      }
    } else {
      details.push({
        ...itemBase,
        Деталь: name,
        Магазин: pibMagazin,
        Каталог: catalog,
        sclad_id,
      });
      totalDetailsSum += sum;

      if (pibMagazin) {
        detailRowsForShops.push({
          shopName: pibMagazin,
          sclad_id,
          Найменування: name,
          Каталог: catalog || null,
          Кількість: quantity,
          Ціна: price,
        });
      }
      if (sclad_id) newScladIds.add(sclad_id);
    }
  });

  return {
    details,
    works,
    detailRowsForShops,
    workRowsForSlyusars,
    newScladIds,
    totalDetailsSum,
    totalWorksSum,
    grandTotalSum: totalDetailsSum + totalWorksSum,
  };
}

async function cleanupEmptyRows(): Promise<void> {
  document
    .querySelectorAll(`#${ACT_ITEMS_TABLE_CONTAINER_ID} tbody tr`)
    .forEach((row) => {
      const nameCell = row.querySelector('[data-name="name"]') as HTMLElement;
      if (!nameCell?.textContent?.trim()) {
        row.remove();
      }
    });
}

function updateInitialActItems(details: any[], works: any[]): void {
  globalCache.initialActItems = [
    ...details.map((d) => ({
      type: "detail" as const,
      name: d.Деталь,
      catalog: d.Каталог || "",
      quantity: d.Кількість,
      price: d.Ціна,
      sum: d.Сума,
      person_or_store: d.Магазин || "",
      sclad_id: d.sclad_id ?? null,
      slyusar_id: null,
    })),
    ...works.map((w) => ({
      type: "work" as const,
      name: w.Робота,
      catalog: w.Каталог || "",
      quantity: w.Кількість,
      price: w.Ціна,
      sum: w.Сума,
      person_or_store: w.Слюсар || "",
      sclad_id: null,
      slyusar_id: w.slyusar_id ?? null,
    })),
  ];
}

async function saveActData(actId: number, originalActData: any): Promise<void> {
  if (globalCache.isActClosed) {
    throw new Error("Неможливо редагувати закритий акт");
  }

  // Отримуємо значення пробігу та перетворюємо на число
  const probigText = cleanText(
    document.getElementById(EDITABLE_PROBIG_ID)?.textContent
  );
  const probigCleaned = probigText.replace(/\s/g, ""); // Видаляємо всі пробіли
  const newProbig = probigCleaned && /^\d+$/.test(probigCleaned) 
    ? Number(probigCleaned) 
    : (probigCleaned || 0);
  
  const newReason = getCellText(document.getElementById(EDITABLE_REASON_ID));
  const newRecommendations = getCellText(
    document.getElementById(EDITABLE_RECOMMENDATIONS_ID)
  );

  const items = parseTableRows();
  const {
    details,
    works,
    detailRowsForShops,
    workRowsForSlyusars,
    newScladIds,
    totalDetailsSum,
    totalWorksSum,
    grandTotalSum,
  } = processItems(items);

  const updatedActData = {
    ...(originalActData || {}),
    Пробіг: newProbig,
    "Причина звернення": newReason,
    Рекомендації: newRecommendations,
    Деталі: details,
    Роботи: works,
    "За деталі": totalDetailsSum,
    "За роботу": totalWorksSum,
    "Загальна сума": grandTotalSum,
  };

  const deltas = calculateDeltas();

  showNotification("Збереження змін...", "info");

  const { error: updateError } = await supabase
    .from("acts")
    .update({ data: updatedActData })
    .eq("act_id", actId);
  if (updateError) {
    throw new Error(`Не вдалося оновити акт: ${updateError.message}`);
  }

  await updateScladActNumbers(actId, newScladIds);
  await applyScladDeltas(deltas);
  await syncShopsOnActSave(actId, detailRowsForShops);
  await syncSlyusarsOnActSave(actId, workRowsForSlyusars);

  globalCache.oldNumbers = readTableNewNumbers();
  updateInitialActItems(details, works);

  await Promise.all([
    loadGlobalData(),
    refreshQtyWarningsIn(ACT_ITEMS_TABLE_CONTAINER_ID),
    cleanupEmptyRows(),
  ]);

  updateCalculatedSumsInFooter();
  refreshActsTable();
}

/* =============================== ЕКСПОРТОВАНІ ФУНКЦІЇ =============================== */

export function addSaveHandler(actId: number, originalActData: any): void {
  const saveButton = document.getElementById(
    ZAKAZ_NARAYD_SAVE_BTN_ID
  ) as HTMLButtonElement | null;
  if (!saveButton) return;

  const newSaveButton = saveButton.cloneNode(true) as HTMLButtonElement;
  saveButton.parentNode?.replaceChild(newSaveButton, saveButton);

  newSaveButton.addEventListener("click", async () => {
    try {
      await saveActData(actId, originalActData);
      showNotification("Зміни успішно збережено", "success");
    } catch (err: any) {
      console.error("Помилка збереження:", err);
      showNotification(
        `Помилка збереження даних: ${err?.message || err}`,
        "error"
      );
    }
  });
}