import { globalCache, ensureSkladLoaded } from "../globalCache";
import { loadPercentFromSettings } from "./kastomna_tabluca";
import { supabase } from "../../../vxid/supabaseClient";

// Кеш для даних поточного акту
let currentActDataCache: any = null;
let autoRefreshInterval: any = null;

/* ===================== UI STYLES ===================== */
function ensureWarningStyles() {
  if (document.getElementById("warn-badge-styles")) return;
  const css = `
    .qty-cell { position: relative; }
    .price-cell { position: relative; }
    .qty-cell[data-warn="1"]::before,
    .price-cell[data-warnprice="1"]::before {
      content: "!";
      position: absolute;
      top: 50%;
      left: 4px;
      transform: translateY(-50%);
      width: 16px; height: 16px; line-height: 16px; text-align: center;
      font-size: 10px; font-weight: 800;
      color: #fff; background: #ff9800;
      clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
      border-radius: 2px; pointer-events: none; user-select: none;
      z-index: 10;
    }
    .qty-cell[data-warn="1"],
    .price-cell[data-warnprice="1"] {
      background-color: #fff3e0 !important;
      border: 1px solid #ff9800 !important;
    }
  `;
  const tag = document.createElement("style");
  tag.id = "warn-badge-styles";
  tag.textContent = css;
  document.head.appendChild(tag);
}
function ensureCellClass(cell: HTMLElement, cls: "qty-cell" | "price-cell") {
  if (!cell.classList.contains(cls)) cell.classList.add(cls);
}
export function setWarningFlag(cell: HTMLElement | null, on: boolean) {
  if (!cell) return;
  ensureWarningStyles();
  ensureCellClass(cell, "qty-cell");           // ⬅️ додаємо клас
  if (on) cell.setAttribute("data-warn", "1");
  else cell.removeAttribute("data-warn");
}

export function setPriceWarningFlag(cell: HTMLElement | null, on: boolean) {
  if (!cell) return;
  ensureWarningStyles();
  ensureCellClass(cell, "price-cell");         // ⬅️ додаємо клас
  if (on) cell.setAttribute("data-warnprice", "1");
  else cell.removeAttribute("data-warnprice");
}


function formatUA(n: number) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 }).format(n);
}

/** Парсер числа з вузла (input/contenteditable/td) */
function parseNumFromNode(node: HTMLElement | null): number {
  if (!node) return 0;
  let raw = "";
  if ((node as HTMLInputElement).value !== undefined) {
    raw = (node as HTMLInputElement).value ?? "";
  } else {
    raw = node.textContent ?? "";
  }
  const val = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(val) ? val : 0;
}

/* ===================== ACT DATA CACHE ===================== */
async function loadCurrentActData(): Promise<any> {
  if (!globalCache.currentActId) {
    currentActDataCache = null;
    return null;
  }
  try {
    const { data, error } = await supabase
      .from("acts")
      .select("data")
      .eq("act_id", globalCache.currentActId)
      .single();

    if (error) {
      console.error("Помилка завантаження даних акту:", error);
      currentActDataCache = null;
      return null;
    }
    currentActDataCache = data?.data || null;
    return currentActDataCache;
  } catch (err) {
    console.error("Помилка завантаження даних акту:", err);
    currentActDataCache = null;
    return null;
  }
}

/** Скинути кеш даних акту (викликати при зміні акту) */
export function resetActDataCache(): void {
  currentActDataCache = null;
}

/** Оновити кеш після збереження акту */
export async function refreshActDataCache(): Promise<void> {
  currentActDataCache = null;
  await loadCurrentActData();
}

/** Отримати збережену кількість деталі з acts.data.Деталі[].Кількість */
async function getCurrentActDetailQty(sclad_id: number): Promise<number> {
  // Тягнемо свіжі дані (щоб після збереження не було "старого" значення)
  await loadCurrentActData();
  if (!currentActDataCache || !currentActDataCache.Деталі) return 0;

  const detail = currentActDataCache.Деталі.find(
    (d: any) => Number(d.sclad_id) === Number(sclad_id)
  );

  const qtyRaw = detail ? detail.Кількість : 0;
  const qty =
    typeof qtyRaw === "number"
      ? qtyRaw
      : parseFloat(String(qtyRaw).replace(/\s/g, "").replace(",", ".")) || 0;

  return qty;
}

/* ===================== CORE CHECK (QTY) ===================== */
/**
 * Формула:
 *  delta_1 = inputNumber - actsOsnova
 *  delta_2 = scladOsnova + delta_1
 *  alarmOsnova = scladOn - delta_2
 * Попередження, якщо alarmOsnova < 0
 */
export async function updateCatalogWarningForRow(row: HTMLElement) {
  if (globalCache.isActClosed) {
    const qtyCellClosed = row.querySelector('[data-name="id_count"]') as HTMLElement | null;
    if (qtyCellClosed) {
      setWarningFlag(qtyCellClosed, false);
      qtyCellClosed.removeAttribute("title");
    }
    return;
  }

  await ensureSkladLoaded();

  // Кількість може бути td/div/input — беремо найближчу клітинку
  const qtyCellCandidate = row.querySelector('[data-name="id_count"]') as HTMLElement | null;
  const qtyCell =
    (qtyCellCandidate?.closest('[data-name="id_count"]') as HTMLElement | null) ||
    qtyCellCandidate;
  if (!qtyCell) return;

  const catalogCell = row.querySelector('[data-name="catalog"]') as HTMLElement | null;
  const scladIdAttr = catalogCell?.getAttribute("data-sclad-id");
  const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;

  if (!sclad_id) {
    setWarningFlag(qtyCell, false);
    qtyCell.removeAttribute("title");
    return;
  }

  const picked = globalCache.skladParts.find(
    (p) => Number(p.sclad_id) === Number(sclad_id)
  );
  if (!picked) {
    setWarningFlag(qtyCell, false);
    qtyCell.removeAttribute("title");
    return;
  }

  // 1) inputNumber - щойно введена кількість
  const inputNumber = parseNumFromNode(qtyCell);

  // 2) actsOsnova - збережена кількість у поточному акті
  const actsOsnova = await getCurrentActDetailQty(sclad_id);

  // 3) delta_1 = inputNumber - actsOsnova  (ВАЖЛИВО: саме так)
  const delta_1 = inputNumber - actsOsnova;

  // 4) scladOsnova - kilkist_off
  const scladOsnova = Number(picked.kilkist_off ?? 0);

  // 5) delta_2 = scladOsnova + delta_1
  const delta_2 = scladOsnova + delta_1;

  // 6) scladOn - kilkist_on
  const scladOn = Number(picked.kilkist_on ?? 0);

  // 7) alarmOsnova = scladOn - delta_2
  const alarmOsnova = scladOn - delta_2;

  // 8) Попередження якщо залишок < 0
  const warn = alarmOsnova < 0;

  setWarningFlag(qtyCell, warn);
  const unit = (picked as any).unit ?? "";
  if (warn) {
    const needMore = Math.abs(alarmOsnova);
    qtyCell.title = `Не вистачає ${formatUA(needMore)} ${unit}`.trim();
  } else {
    qtyCell.removeAttribute("title");
  }
}

/* ===================== PRICE CHECK ===================== */
export async function updatePriceWarningForRow(row: HTMLElement) {
  if (globalCache.isActClosed) {
    const priceCellClosed = row.querySelector('[data-name="price"]') as HTMLElement | null;
    if (priceCellClosed) {
      setPriceWarningFlag(priceCellClosed, false);
      priceCellClosed.removeAttribute("title");
    }
    return;
  }

  const priceCell = row.querySelector('[data-name="price"]') as HTMLElement | null;
  const catalogCell = row.querySelector('[data-name="catalog"]') as HTMLElement | null;
  if (!priceCell) return;

  const scladIdAttr = catalogCell?.getAttribute("data-sclad-id");
  const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;

  if (!sclad_id) {
    setPriceWarningFlag(priceCell, false);
    priceCell.removeAttribute("title");
    return;
  }

  const picked = globalCache.skladParts.find(
    (p) => Number(p.sclad_id) === Number(sclad_id)
  );
  if (!picked) {
    setPriceWarningFlag(priceCell, false);
    priceCell.removeAttribute("title");
    return;
  }

  const percent = await loadPercentFromSettings();
  const enteredPrice = parseNumFromNode(priceCell);
  const basePrice = Math.round(Number(picked.price) || 0);
  const minPrice = Math.round(basePrice * (1 + percent / 100));
  const warn = enteredPrice > 0 && enteredPrice < minPrice;

  setPriceWarningFlag(priceCell, warn);
  if (warn) priceCell.title = `Вхідна ціна: ${formatUA(basePrice)}`;
  else priceCell.removeAttribute("title");
}

/* ===================== MASS REFRESH ===================== */
export async function refreshQtyWarningsIn(containerId: string) {
  ensureWarningStyles();
  if (globalCache.isActClosed) return;

  await ensureSkladLoaded();
  await refreshActDataCache(); // підтягнути свіжий acts.data перед масовим перерахунком

  const container = document.getElementById(containerId);
  if (!container) return;

  const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  for (const tr of rows) {
    const row = tr as unknown as HTMLElement;
    await updateCatalogWarningForRow(row);
    await updatePriceWarningForRow(row);
  }
}

/* ===================== LISTENERS ===================== */
export function setupQtyWarningListeners(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const onInput = async (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const cell = target.closest('[data-name="id_count"]') as HTMLElement | null;
    if (!cell) return;
    const row = cell.closest("tr") as HTMLElement | null;
    if (row) await updateCatalogWarningForRow(row);
  };

  const onBlur = async (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const cell = target.closest('[data-name="id_count"]') as HTMLElement | null;
    if (!cell) return;
    const row = cell.closest("tr") as HTMLElement | null;
    if (row) await updateCatalogWarningForRow(row);
  };

  // ⬇️ НОВЕ: перед зміною фокуса мишкою — перерахуємо активну клітинку
  const onPointerDownPreCommit = async (e: Event) => {
    const active = (document.activeElement as HTMLElement | null)?.closest(
      '[data-name="id_count"]'
    ) as HTMLElement | null;

    if (!active) return;

    const clickTarget = e.target as Node;
    // якщо клікаємо поза активною клітинкою кількості — перерахувати негайно
    if (!active.contains(clickTarget)) {
      const row = active.closest("tr") as HTMLElement | null;
      if (row) await updateCatalogWarningForRow(row);
    }
  };

  // ⬇️ НОВЕ: клавіші, які переміщують фокус/рядок — перерахуємо до переходу
  const onKeyDownPreCommit = async (e: KeyboardEvent) => {
    const keys = ["Enter", "Tab", "ArrowDown", "ArrowUp"];
    if (!keys.includes(e.key)) return;

    const active = (document.activeElement as HTMLElement | null)?.closest(
      '[data-name="id_count"]'
    ) as HTMLElement | null;

    if (active) {
      const row = active.closest("tr") as HTMLElement | null;
      if (row) {
        await updateCatalogWarningForRow(row);
        // не блокуємо дефолт — просто встигаємо порахувати до переходу
      }
    }
  };

  // ВАЖЛИВО: input — у capture, щоб ловити вкладені <input>
  container.addEventListener("input", onInput, { capture: true });
  container.addEventListener("blur", onBlur, true);

  // ⬇️ ДОДАЙ
  container.addEventListener("pointerdown", onPointerDownPreCommit, { capture: true });
  container.addEventListener("keydown", onKeyDownPreCommit, { capture: true });
}


/* ===================== INIT / SAVE HOOK / AUTO REFRESH ===================== */
export function initializeActWarnings(containerId: string, actId: number, enableAutoRefresh = false) {
  globalCache.currentActId = actId;
  resetActDataCache();
  setupQtyWarningListeners(containerId);
  if (enableAutoRefresh) startAutoRefresh(containerId);
}

/** Викликати одразу після УСПІШНОГО збереження акту */
export async function onActSaved(containerId: string) {
  resetActDataCache();
  await loadCurrentActData();
  await refreshQtyWarningsIn(containerId);
}

/** Автооновлення (опціонально) */
export function startAutoRefresh(containerId: string) {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(async () => {
    await refreshQtyWarningsIn(containerId);
  }, 2000);
}
export function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}
