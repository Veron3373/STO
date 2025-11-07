//src\ts\roboha\zakaz_naraudy\inhi\kastomna_tabluca.ts
import {
  globalCache,
  ensureSkladLoaded,
  findScladItemByPart,
  findScladItemsByName,
  ACT_ITEMS_TABLE_CONTAINER_ID,
} from "../globalCache";
import { supabase } from "../../../vxid/supabaseClient";
import {
  updateCatalogWarningForRow,
  updatePriceWarningForRow,
} from "./kastomna_tabluca_poperedhennya";
export {
  refreshQtyWarningsIn,
  initializeActWarnings,
  resetActDataCache,
} from "./kastomna_tabluca_poperedhennya";

/* ====================== настройки ====================== */
const CATALOG_SUGGEST_MIN = 3;
const LIVE_WARNINGS = false;

// Кеш для відсотку
let cachedPercent: number | null = null;

/** Завантажити відсоток з бази даних settings */
export async function loadPercentFromSettings(): Promise<number> {
  if (cachedPercent !== null) return cachedPercent;

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("procent")
      .eq("setting_id", 4)
      .single();

    if (error) throw error;

    const percent = typeof data?.procent === "number" ? data.procent : 0;
    cachedPercent = percent;
    return percent;
  } catch (err) {
    console.error("Помилка завантаження відсотку:", err);
    return 0; // За замовчуванням 0% якщо помилка
  }
}

/** Скинути кеш відсотку (викликати після збереження налаштувань) */
export function resetPercentCache(): void {
  cachedPercent = null;
}

/* ====================== helpers ====================== */

/** ---------- AUTO-FOLLOW helpers (для списку підказок) ---------- */
function isScrollable(el: Element): boolean {
  const s = getComputedStyle(el as HTMLElement);
  return /(auto|scroll|overlay)/.test(s.overflow + s.overflowY + s.overflowX);
}
function getScrollableAncestors(el: HTMLElement): HTMLElement[] {
  const res: HTMLElement[] = [];
  let p = el.parentElement;
  while (p) {
    if (isScrollable(p)) res.push(p);
    p = p.parentElement;
  }
  return res;
}

let _repositionCleanup: (() => void) | null = null;

function startAutoFollow(
  target: HTMLElement,
  list: HTMLElement,
  positionFn: () => void
) {
  // знімаємо попередні лісенери, якщо були
  _repositionCleanup?.();

  const parents = getScrollableAncestors(target);
  const onScroll = () => positionFn();
  const onResize = () => positionFn();

  const ro = new ResizeObserver(positionFn);
  ro.observe(document.documentElement);
  ro.observe(list);

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  parents.forEach((p) =>
    p.addEventListener("scroll", onScroll, { passive: true })
  );

  const mo = new MutationObserver(() => {
    if (!document.body.contains(target) || !document.body.contains(list)) {
      cleanup();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  function cleanup() {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    parents.forEach((p) => p.removeEventListener("scroll", onScroll));
    ro.disconnect();
    mo.disconnect();
  }

  _repositionCleanup = cleanup;
}

function stopAutoFollow() {
  _repositionCleanup?.();
  _repositionCleanup = null;
}

/** ---------- стилі списку ---------- */
function ensureAutocompleteStyles() {
  if (document.getElementById("autocomplete-styles")) return;
  const css = `
    .catalog-info-popover {
      position: absolute;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 8px 12px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      font-size: 14px;
      line-height: 1.2;
      color: #222;
      z-index: 100000;
    }
    .autocomplete-list {
      position: absolute;
      background: #f1f5ff;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 4px 0;
      box-shadow: 0 6px 18px rgba(0,0,0,0.15);
      font-size: 14px;
      z-index: 100000;
      overflow-y: auto;
      max-width: 880px;
      box-sizing: border-box;
    }
    .autocomplete-item { padding: 6px 10px; cursor: pointer; }
    .autocomplete-item:focus, .autocomplete-item:hover { background: #e0e7ff; outline: none; }
    .autocomplete-item.negative { color: #e40b0b; }
    .autocomplete-item.neutral { color: #888; }
    .autocomplete-item.positive { color: #2e7d32; }
    .editable-autocomplete { transition: box-shadow 120ms ease; }
  `;
  const tag = document.createElement("style");
  tag.id = "autocomplete-styles";
  tag.textContent = css;
  document.head.appendChild(tag);
}

function formatUA(n: number) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 }).format(n);
}

/** ---------- робота з назвами ---------- */
function expandName(shortenedName: string): string {
  if (!shortenedName || !shortenedName.includes(".....")) return shortenedName;

  const allNames = [...globalCache.details, ...globalCache.works];
  const [firstPart, lastPart] = shortenedName.split(".....");

  const fullName = allNames.find((name) => {
    const sentences = name
      .split(/(?<=\.)\s*/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length < 2) return false;
    const lastSentence = sentences[sentences.length - 1];
    return (
      name.startsWith(firstPart) &&
      (name.endsWith(lastPart) || lastSentence === lastPart)
    );
  });

  return fullName || shortenedName;
}

export function expandAllNamesInTable(): Map<HTMLElement, string> {
  const originalTexts = new Map<HTMLElement, string>();
  const container = document.getElementById(ACT_ITEMS_TABLE_CONTAINER_ID);
  if (!container) return originalTexts;

  const nameCells =
    container.querySelectorAll<HTMLElement>('[data-name="name"]');

  nameCells.forEach((cell) => {
    const currentText = cell.textContent?.trim() || "";
    originalTexts.set(cell, currentText);
    if (currentText.includes(".....")) {
      cell.textContent = expandName(currentText);
    }
  });

  return originalTexts;
}

export function restoreOriginalNames(
  originalTexts: Map<HTMLElement, string>
): void {
  originalTexts.forEach((originalText, cell) => {
    cell.textContent = originalText;
  });
}

function shortenName(fullName: string): string {
  if (!fullName) return fullName;
  const sentences = fullName
    .split(/(?<=\.)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length <= 1 || fullName.length < 100) return fullName;

  const firstSentence = sentences[0].replace(/\.$/, "");
  const lastSentence = sentences[sentences.length - 1];
  if (sentences.length === 2) return `${firstSentence}.....${lastSentence}`;
  return `${firstSentence}.....${lastSentence}`;
}

/** ---------- підрахунки ---------- */
function setCellText(cell: HTMLElement | null, text: string) {
  if (!cell) return;
  cell.textContent = text;
  cell.dispatchEvent(new Event("input", { bubbles: true }));
}
function parseNum(text: string | null | undefined) {
  return parseFloat(
    (text || "0").replace(/\s/g, "").replace(",", ".")
  ) || 0;
}

function getRowSum(row: HTMLElement) {
  const priceEl = row.querySelector(
    '[data-name="price"]'
  ) as HTMLElement | null;
  const qtyEl = row.querySelector(
    '[data-name="id_count"]'
  ) as HTMLElement | null;
  const price = parseNum(priceEl?.textContent);
  const qty = parseNum(qtyEl?.textContent);
  return Math.round(price * qty);
}
function recalcRowSum(row: HTMLElement) {
  const sumEl = row.querySelector('[data-name="sum"]') as HTMLElement | null;
  const sum = getRowSum(row);
  if (sumEl) sumEl.textContent = formatUA(sum);

  if (!globalCache.isActClosed) {
    updatePriceWarningForRow(row);
    if (LIVE_WARNINGS && globalCache.settings.showCatalog) {
      updateCatalogWarningForRow(row);
    }
  }
}

/** ---------- info popover під Каталог (тільки hover) ---------- */
let currentCatalogInfo: HTMLElement | null = null;
let currentCatalogInfoAnchor: HTMLElement | null = null;

function removeCatalogInfo() {
  currentCatalogInfo?.remove();
  currentCatalogInfo = null;
  currentCatalogInfoAnchor = null;
  window.removeEventListener("scroll", handleScrollForCatalogInfo);
}
function handleScrollForCatalogInfo() {
  if (!currentCatalogInfo || !currentCatalogInfoAnchor) {
    removeCatalogInfo();
    return;
  }
  const rect = currentCatalogInfoAnchor.getBoundingClientRect();
  currentCatalogInfo.style.top = `${rect.bottom + window.scrollY}px`;
  currentCatalogInfo.style.left = `${rect.left + window.scrollX}px`;
}
function showCatalogInfo(target: HTMLElement, sclad_id: number) {
  if (currentAutocompleteList) return;

  ensureAutocompleteStyles();
  removeCatalogInfo();
  const picked = globalCache.skladParts.find((p) => p.sclad_id === sclad_id);
  if (!picked) return;

  const qty = Number(picked.quantity);
  const qtyHtml =
    qty < 0
      ? `<span class="neg">${qty}</span>`
      : qty === 0
      ? `<span class="neutral">${qty}</span>`
      : `<span class="positive">${qty}</span>`;

  const box = document.createElement("div");
  box.className = "catalog-info-popover";
  box.innerHTML = `К-ть: ${qtyHtml} по ${formatUA(Math.round(picked.price))}`;

  const rect = target.getBoundingClientRect();
  box.style.top = `${rect.bottom + window.scrollY}px`;
  box.style.left = `${rect.left + window.scrollX}px`;
  box.style.minWidth = `${rect.width}px`;
  document.body.appendChild(box);

  currentCatalogInfo = box;
  currentCatalogInfoAnchor = target;
  window.addEventListener("scroll", handleScrollForCatalogInfo);
}

/* ======== AUTOCOMPLETE state & utils ======== */
type Suggest = {
  label: string;
  value: string;
  sclad_id?: number;
  labelHtml?: string;
  fullName?: string;
};

let currentAutocompleteInput: HTMLElement | null = null;
let currentAutocompleteList: HTMLElement | null = null;

function closeAutocompleteList() {
  document.querySelector(".autocomplete-list")?.remove();
  stopAutoFollow();
  if (currentAutocompleteInput)
    currentAutocompleteInput.classList.remove("ac-open");
  currentAutocompleteList = null;
  currentAutocompleteInput = null;
}

/** ---------- рендер списку підказок (з автослідуванням) ---------- */
function renderAutocompleteList(target: HTMLElement, suggestions: Suggest[]) {
  ensureAutocompleteStyles();
  closeAutocompleteList();
  if (!suggestions.length) return;

  const GAP = 4;
  const ROWS_MAX = 15;

  target.classList.add("ac-open");

  const list = document.createElement("ul");
  list.className = "autocomplete-list";
  list.style.position = "absolute";
  list.style.visibility = "hidden";
  list.style.zIndex = "100000";

  suggestions.forEach((s) => {
    const { label, value, sclad_id, labelHtml, fullName } = s;
    const li = document.createElement("li");
    li.className = "autocomplete-item";
    li.tabIndex = 0;
    li.dataset.value = value;
    if (sclad_id !== undefined) li.dataset.scladId = String(sclad_id);
    if (fullName) li.dataset.fullName = fullName;

    const m = label.match(/К-ть:\s*(-?\d+)/);
    if (m) {
      const qty = parseInt(m[1], 10);
      if (qty < 0) li.classList.add("negative");
      else if (qty === 0) li.classList.add("neutral");
      else li.classList.add("positive");
    }
    if (labelHtml) li.innerHTML = labelHtml;
    else li.textContent = label;

    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      const chosenValue = el.dataset.value || value;
      const chosenScladId = Number(el.dataset.scladId) || undefined;
      const chosenFullName = el.dataset.fullName;

      const dataName = target.getAttribute("data-name");
      if (dataName === "catalog") {
        target.textContent = chosenValue;
        if (chosenScladId !== undefined)
          applyCatalogSelectionById(target, chosenScladId, chosenFullName);
      } else if (dataName === "name") {
        const fullText = chosenFullName || label;
        const shortenedText = shortenName(fullText);
        target.textContent = shortenedText;

        const row = target.closest("tr")!;
        const pibMagCell = row.querySelector(
          '[data-name="pib_magazin"]'
        ) as HTMLElement | null;
        if (pibMagCell) {
          const isDetail = globalCache.details.includes(fullText);
          pibMagCell.setAttribute("data-type", isDetail ? "shops" : "slyusars");
          pibMagCell.textContent = "";
        }
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.focus();
      } else {
        target.textContent = chosenValue;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }

      closeAutocompleteList();
    });

    list.appendChild(li);
  });

  document.body.appendChild(list);

  // Перше позиціонування
  const tr = target.getBoundingClientRect();
  const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

  const firstLi = list.querySelector("li") as HTMLElement | null;
  const rowH = Math.max(firstLi?.offsetHeight || 0, 28);

  const ls = getComputedStyle(list);
  const padV = parseFloat(ls.paddingTop) + parseFloat(ls.paddingBottom);
  const borderV =
    parseFloat(ls.borderTopWidth) + parseFloat(ls.borderBottomWidth);

  const availableAbove = Math.max(0, tr.top - GAP);
  const rowsFitBySpace = Math.max(
    1,
    Math.floor((availableAbove - padV - borderV) / rowH)
  );
  const rowsToShow = Math.min(ROWS_MAX, rowsFitBySpace, suggestions.length);

  const finalMaxHeight = rowsToShow * rowH + padV + borderV;
  list.style.maxHeight = `${finalMaxHeight}px`;
  list.style.overflowY = rowsToShow < suggestions.length ? "auto" : "hidden";

  const minW = Math.max(tr.width, 200);
  list.style.minWidth = `${minW}px`;

  const effectiveHeight = rowsToShow * rowH + padV + borderV;
  let top = scrollY + tr.top - effectiveHeight - GAP;
  if (top < scrollY) top = scrollY;

  let left = scrollX + tr.left;
  const vw = document.documentElement.clientWidth;
  const listW = Math.max(minW, list.offsetWidth);
  if (left + listW > scrollX + vw - 4)
    left = Math.max(scrollX, scrollX + vw - listW - 4);

  list.style.left = `${left}px`;
  list.style.top = `${top}px`;
  list.style.visibility = "visible";

  currentAutocompleteInput = target;
  currentAutocompleteList = list;

  const reposition = () => {
    if (!document.body.contains(target) || !document.body.contains(list)) {
      closeAutocompleteList();
      return;
    }

    const rect = target.getBoundingClientRect();
    const sX = window.scrollX || document.documentElement.scrollLeft || 0;
    const sY = window.scrollY || document.documentElement.scrollTop || 0;

    const first = list.querySelector("li") as HTMLElement | null;
    const rowH2 = Math.max(first?.offsetHeight || 0, 28);

    const ls2 = getComputedStyle(list);
    const padV2 = parseFloat(ls2.paddingTop) + parseFloat(ls2.paddingBottom);
    const borderV2 =
      parseFloat(ls2.borderTopWidth) + parseFloat(ls2.borderBottomWidth);

    const parents = getScrollableAncestors(target);
    const viewportEl = parents[0] || document.documentElement;
    const vpRect = viewportEl.getBoundingClientRect();

    const availableAbove2 = Math.max(
      0,
      rect.top - Math.max(vpRect.top, 0) - GAP
    );

    const totalItems = list.children.length;
    const rowsFit = Math.max(
      1,
      Math.floor((availableAbove2 - padV2 - borderV2) / rowH2)
    );
    const rowsToShow2 = Math.min(ROWS_MAX, totalItems, rowsFit);

    const finalMaxH = rowsToShow2 * rowH2 + padV2 + borderV2;
    list.style.maxHeight = `${finalMaxH}px`;
    list.style.overflowY = rowsToShow2 < totalItems ? "auto" : "hidden";

    const effH = rowsToShow2 * rowH2 + padV2 + borderV2;
    let top2 = sY + rect.top - effH - GAP;

    const vpTopAbs = sY + vpRect.top;
    if (top2 < vpTopAbs) top2 = vpTopAbs;

    let left2 = sX + rect.left;
    const vw2 = document.documentElement.clientWidth;
    const listW2 = list.offsetWidth || Math.max(rect.width, 200);
    if (left2 + listW2 > sX + vw2 - 4) {
      left2 = Math.max(sX, sX + vw2 - listW2 - 4);
    }

    list.style.top = `${top2}px`;
    list.style.left = `${left2}px`;

    const fullyOut =
      rect.bottom < Math.max(vpRect.top, 0) ||
      rect.top > vpRect.bottom ||
      rect.right < vpRect.left ||
      rect.left > vpRect.right;

    if (fullyOut) closeAutocompleteList();
  };

  startAutoFollow(target, list, reposition);
}

/* ===== генератори підказок ===== */
function buildCatalogSuggestions(
  items: typeof globalCache.skladParts,
  prefix: string
): Suggest[] {
  const pr = (prefix || "").trim().toLowerCase();
  if (pr.length < CATALOG_SUGGEST_MIN) return [];
  const filtered = items.filter((p) =>
    p.part_number.toLowerCase().startsWith(pr)
  );
  return filtered.map((p) => {
    const qty = Number(p.quantity) || 0;
    const qtyHtml = qty < 0 ? `<span class="neg">${qty}</span>` : `${qty}`;
    const priceRounded = formatUA(Math.round(p.price));
    return {
      value: p.part_number,
      sclad_id: p.sclad_id,
      label: `${p.part_number} · К-ть: ${qty} по ${priceRounded}`,
      labelHtml: `${p.part_number} · К-ть: ${qtyHtml} по ${priceRounded}`,
      fullName: p.name,
    };
  });
}
function buildCatalogSuggestionsNoMin(
  items: typeof globalCache.skladParts,
  prefix: string
): Suggest[] {
  const pr = (prefix || "").trim().toLowerCase();
  const filtered = pr
    ? items.filter((p) => p.part_number.toLowerCase().startsWith(pr))
    : items;
  return filtered.map((p) => {
    const qty = Number(p.quantity) || 0;
    const qtyHtml = qty < 0 ? `<span class="neg">${qty}</span>` : `${qty}`;
    const priceRounded = formatUA(Math.round(p.price));
    return {
      value: p.part_number,
      sclad_id: p.sclad_id,
      label: `${p.part_number} · К-ть: ${qty} по ${priceRounded}`,
      labelHtml: `${p.part_number} · К-ть: ${qtyHtml} по ${priceRounded}`,
      fullName: p.name,
    };
  });
}
function buildCatalogSuggestionsAll(
  items: typeof globalCache.skladParts
): Suggest[] {
  return items.map((p) => {
    const qty = Number(p.quantity) || 0;
    const qtyHtml = qty < 0 ? `<span class="neg">${qty}</span>` : `${qty}`;
    const priceRounded = formatUA(Math.round(p.price));
    return {
      value: p.part_number,
      sclad_id: p.sclad_id,
      label: `${p.part_number} · К-ть: ${qty} по ${priceRounded}`,
      labelHtml: `${p.part_number} · К-ть: ${qtyHtml} по ${priceRounded}`,
      fullName: p.name,
    };
  });
}

/* ====================== public API ====================== */

export function setupAutocompleteForEditableCells(
  containerId: string,
  cache: typeof globalCache
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // ← ДОДАНО: отримуємо налаштування
  const showCatalog = globalCache.settings.showCatalog;
  const showPibMagazin = globalCache.settings.showPibMagazin;

  container.addEventListener("focusin", async (e) => {
    const target = e.target as HTMLElement;
    if (
      !target.classList.contains("editable-autocomplete") ||
      cache.isActClosed
    )
      return;

    const dataName = target.getAttribute("data-name") || "";

    // ← ДОДАНО: перевірка для каталогу
    if (dataName === "catalog") {
      if (!showCatalog) return; // ← ІГНОРУЄМО якщо прихований

      const initial = (target.textContent || "").trim();
      (target as any)._initialPn = initial;
      (target as any)._prevCatalogText = initial;
      await ensureSkladLoaded();

      const row = target.closest("tr") as HTMLElement | null;
      const nameCell = row?.querySelector(
        '[data-name="name"]'
      ) as HTMLElement | null;
      const selectedName = nameCell?.textContent?.trim() || "";

      if (selectedName && !initial) {
        const matches = findScladItemsByName(selectedName);
        if (matches.length > 0) {
          renderAutocompleteList(target, buildCatalogSuggestionsAll(matches));
        } else {
          closeAutocompleteList();
        }
      }

      removeCatalogInfo();
      return;
    }

    let suggestions: Suggest[] = [];

    if (dataName === "name") {
      const query = target.textContent?.trim().toLowerCase() || "";
      const all = [...globalCache.details, ...globalCache.works];
      const filtered = query
        ? all.filter((t) => t.toLowerCase().includes(query))
        : all;
      suggestions = filtered.map((x) => ({
        label: x,
        value: shortenName(x),
        fullName: x,
      }));
    } else if (dataName === "pib_magazin") {
      if (!showPibMagazin) return; // ← ІГНОРУЄМО якщо прихований

      const query = target.textContent?.trim().toLowerCase() || "";
      const t = updatePibMagazinDataType(target);
      if (t === "shops") {
        const all = globalCache.shops
          .map((s) => s.Name)
          .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
        const filtered = query
          ? all.filter((n) => n.toLowerCase().includes(query))
          : all;
        suggestions = filtered.map((x) => ({ label: x, value: x }));
      } else if (t === "slyusars") {
        const allowedSlyusars = globalCache.slyusars
          .filter((s) => s.Доступ === "Слюсар" || s.Доступ === "Адміністратор")
          .map((s) => s.Name)
          .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
        const filtered = query
          ? allowedSlyusars.filter((n) => n.toLowerCase().includes(query))
          : allowedSlyusars;
        suggestions = filtered.map((x) => ({ label: x, value: x }));
      }
    } else if (target.getAttribute("data-type") === "shops") {
      const query = target.textContent?.trim().toLowerCase() || "";
      const all = globalCache.shops
        .map((s) => s.Name)
        .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
      const filtered = query
        ? all.filter((n) => n.toLowerCase().includes(query))
        : all;
      suggestions = filtered.map((x) => ({ label: x, value: x }));
    } else if (target.getAttribute("data-type") === "slyusars") {
      const query = target.textContent?.trim().toLowerCase() || "";
      const allowedSlyusars = globalCache.slyusars
        .filter((s) => s.Доступ === "Слюсар" || s.Доступ === "Адміністратор")
        .map((s) => s.Name)
        .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
      const filtered = query
        ? allowedSlyusars.filter((n) => n.toLowerCase().includes(query))
        : allowedSlyusars;
      suggestions = filtered.map((x) => ({ label: x, value: x }));
    }

    if (suggestions.length) renderAutocompleteList(target, suggestions);
    else closeAutocompleteList();
  });

  container.addEventListener("input", async (e) => {
    const target = e.target as HTMLElement;
    if (
      !target.classList.contains("editable-autocomplete") ||
      cache.isActClosed
    ) {
      closeAutocompleteList();
      removeCatalogInfo();
      return;
    }

    const dataName = target.getAttribute("data-name") || "";
    const currTextRaw = (target.textContent || "").trim();
    const query = currTextRaw.toLowerCase();

    let suggestions: Suggest[] = [];

    if (dataName === "catalog") {
      await ensureSkladLoaded();

      const row = target.closest("tr") as HTMLElement;
      const nameCell = row?.querySelector(
        '[data-name="name"]'
      ) as HTMLElement | null;

      const prevText: string = (target as any)._prevCatalogText ?? currTextRaw;
      (target as any)._prevCatalogText = currTextRaw;
      const deleted = currTextRaw.length < prevText.length;

      if (deleted) {
        // 1) Скидаємо прив'язку каталогу
        target.removeAttribute("data-sclad-id");

        // 2) Очищаємо пов'язані поля рядка
        const row = target.closest("tr") as HTMLTableRowElement; // ← Змінили тип
        if (!row) return; // ← Додали перевірку

        const nameCell = row.querySelector(
          '[data-name="name"]'
        ) as HTMLElement | null;
        const qtyCell = row.querySelector(
          '[data-name="id_count"]'
        ) as HTMLElement | null;
        const priceCell = row.querySelector(
          '[data-name="price"]'
        ) as HTMLElement | null;

        // Використовуємо helper, щоб згенерувати події input
        if (nameCell) setCellText(nameCell, "");
        if (qtyCell) setCellText(qtyCell, "");
        if (priceCell) setCellText(priceCell, "");

        // 3) Перерахунок суми та індикаторів
        const typeFromCell = nameCell?.getAttribute("data-type");

        if (typeFromCell === "works") {
          // Для робіт викликаємо async calculateRowSum
          import("../modalUI")
            .then(async ({ calculateRowSum }) => {
              await calculateRowSum(row); // ← Тепер row має правильний тип
            })
            .catch((err) => {
              console.error(
                "Помилка при розрахунку суми після видалення каталогу:",
                err
              );
            });
        } else {
          // Для деталей звичайний recalc
          recalcRowSum(row);
        }

        // 4) Підказки по каталогу
        const allItems = globalCache.skladParts;
        suggestions =
          query.length === 0
            ? buildCatalogSuggestionsAll(allItems)
            : buildCatalogSuggestionsNoMin(allItems, query);
      } else {
        const selectedName = nameCell?.textContent?.trim() || "";
        if (query.length >= CATALOG_SUGGEST_MIN) {
          const items = selectedName
            ? findScladItemsByName(selectedName)
            : globalCache.skladParts;
          suggestions = buildCatalogSuggestions(items, query);
        } else {
          suggestions = [];
        }
      }

      removeCatalogInfo();
    } else if (dataName === "name") {
      const d = globalCache.details.filter((t) =>
        t.toLowerCase().includes(query)
      );
      const w = globalCache.works.filter((t) =>
        t.toLowerCase().includes(query)
      );
      const all = [...d, ...w];
      suggestions = all.map((x) => ({
        label: x,
        value: shortenName(x),
        fullName: x,
      }));

      const row = target.closest("tr");
      const pibMagCell = row?.querySelector(
        '[data-name="pib_magazin"]'
      ) as HTMLElement | null;
      if (pibMagCell) {
        const t = updatePibMagazinDataType(pibMagCell);
        const currentText = pibMagCell.textContent?.trim() || "";
        if (t === "slyusars") {
          const allowedSlyusarNames = globalCache.slyusars
            .filter(
              (s) => s.Доступ === "Слюсар" || s.Доступ === "Адміністратор"
            )
            .map((s) => s.Name.toLowerCase());
          if (!allowedSlyusarNames.includes(currentText.toLowerCase())) {
            pibMagCell.textContent = "";
          }
        }
        if (
          t === "shops" &&
          !globalCache.shops
            .map((s) => s.Name.toLowerCase())
            .includes(currentText.toLowerCase())
        ) {
          pibMagCell.textContent = "";
        }
        if (query.length === 0) pibMagCell.textContent = "";
      }
    } else if (dataName === "pib_magazin") {
      const t = updatePibMagazinDataType(target);
      if (t === "shops") {
        suggestions = globalCache.shops
          .map((s) => s.Name)
          .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }))
          .filter((n) => n.toLowerCase().includes(query))
          .map((x) => ({ label: x, value: x }));
      } else if (t === "slyusars") {
        const allowedSlyusars = globalCache.slyusars
          .filter((s) => s.Доступ === "Слюсар" || s.Доступ === "Адміністратор")
          .map((s) => s.Name)
          .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
        suggestions = allowedSlyusars
          .filter((n) => n.toLowerCase().includes(query))
          .map((x) => ({ label: x, value: x }));
      }
    } else if (target.getAttribute("data-type") === "shops") {
      suggestions = globalCache.shops
        .map((s) => s.Name)
        .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }))
        .filter((n) => n.toLowerCase().includes(query))
        .map((x) => ({ label: x, value: x }));
    } else if (target.getAttribute("data-type") === "slyusars") {
      const allowedSlyusars = globalCache.slyusars
        .filter((s) => s.Доступ === "Слюсар" || s.Доступ === "Адміністратор")
        .map((s) => s.Name)
        .sort((a, b) => a.localeCompare(b, "uk", { sensitivity: "base" }));
      suggestions = allowedSlyusars
        .filter((n) => n.toLowerCase().includes(query))
        .map((x) => ({ label: x, value: x }));
    }

    if (suggestions.length) renderAutocompleteList(target, suggestions);
    else closeAutocompleteList();

    const row = target.closest("tr") as HTMLElement | null;
    if (!row) return;

    if (dataName === "price") {
      await updatePriceWarningForRow(row);
    } else if (
      dataName === "id_count" &&
      LIVE_WARNINGS &&
      globalCache.settings.showCatalog
    ) {
      updateCatalogWarningForRow(row);
    }
  });

  container.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("editable-autocomplete")) return;
    if (target.getAttribute("data-name") !== "catalog") return;
    if (e.key === "Enter") {
      e.preventDefault();
      const scladIdAttr = target.getAttribute("data-sclad-id");
      const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;
      if (sclad_id) applyCatalogSelectionById(target, sclad_id);
      closeAutocompleteList();
      removeCatalogInfo();
    }
  });

  container.addEventListener("focusout", (e) => {
    const target = e.target as HTMLElement;

    if (
      target &&
      target.classList.contains("editable-autocomplete") &&
      target.getAttribute("data-name") === "catalog"
    ) {
      setTimeout(() => {
        const pn = (target.textContent || "").trim();
        const initial = (target as any)._initialPn || "";
        removeCatalogInfo();

        const row = target.closest("tr") as HTMLElement | null;
        const catalogCell = row?.querySelector(
          '[data-name="catalog"]'
        ) as HTMLElement | null;

        const scladIdAttr = target.getAttribute("data-sclad-id");
        const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;

        if (pn && pn !== initial) {
          if (sclad_id) {
            applyCatalogSelectionById(target, sclad_id);
          } else {
            const picked = findScladItemByPart(pn);
            if (picked) applyCatalogSelectionById(target, picked.sclad_id);
          }
        } else {
          if (row && LIVE_WARNINGS) {
            updateCatalogWarningForRow(row);
            updatePriceWarningForRow(row);
          }
          if (catalogCell && pn && !findScladItemByPart(pn)) {
            catalogCell.removeAttribute("data-sclad-id");
          }
        }
      }, 0);
    }

    const relatedTarget = (e as FocusEvent).relatedTarget as HTMLElement;
    if (relatedTarget && relatedTarget.closest(".autocomplete-list")) return;

    setTimeout(() => {
      if (
        !document.activeElement?.closest(".autocomplete-list") &&
        document.activeElement !== currentAutocompleteInput
      ) {
        closeAutocompleteList();
      }
    }, 100);
  });

  // hover-підказка складу тільки коли список закритий
  container.addEventListener(
    "mouseenter",
    async (e) => {
      const t = e.target as HTMLElement;
      const cell = t.closest('[data-name="catalog"]') as HTMLElement | null;
      if (!cell) return;
      if (currentAutocompleteList) return;

      const scladIdAttr = cell.getAttribute("data-sclad-id");
      const sclad_id = scladIdAttr ? Number(scladIdAttr) : null;
      if (!sclad_id) return;

      await ensureSkladLoaded();
      showCatalogInfo(cell, sclad_id);
    },
    true
  );

  container.addEventListener(
    "mouseleave",
    (e) => {
      const t = e.target as HTMLElement;
      const cell = t.closest('[data-name="catalog"]');
      if (!cell) return;
      removeCatalogInfo();
    },
    true
  );

  container.addEventListener("mouseleave", () => {
    removeCatalogInfo();
  });
}

/** підтягування даних по вибраному sclad_id */
async function applyCatalogSelectionById(
  target: HTMLElement,
  sclad_id: number,
  fullName?: string
) {
  const picked = globalCache.skladParts.find((p) => p.sclad_id === sclad_id);
  if (!picked) return;

  const row = target.closest("tr") as HTMLTableRowElement; // ← Змінили тип
  if (!row) return; // ← Додали перевірку

  const nameCell = row.querySelector(
    '[data-name="name"]'
  ) as HTMLElement | null;
  const priceCell = row.querySelector(
    '[data-name="price"]'
  ) as HTMLElement | null;
  const pibMagCell = row.querySelector(
    '[data-name="pib_magazin"]'
  ) as HTMLElement | null;
  const catalogCell = row.querySelector(
    '[data-name="catalog"]'
  ) as HTMLElement | null;

  // Завантажити відсоток з БД
  const percent = await loadPercentFromSettings();

  const basePrice = Math.round(picked.price || 0);
  const priceWithMarkup = Math.round(basePrice * (1 + percent / 100));

  const nameToSet = fullName || shortenName(picked.name || "");
  setCellText(nameCell, nameToSet);
  setCellText(priceCell, formatUA(priceWithMarkup));
  if (catalogCell) {
    catalogCell.setAttribute("data-sclad-id", String(picked.sclad_id));
    setCellText(catalogCell, picked.part_number || "");
  }
  if (pibMagCell) {
    pibMagCell.setAttribute("data-type", "shops");
    setCellText(pibMagCell, picked.shop || "");
  }

  // Визначаємо тип ДО асинхронного виклику
  const typeFromCell = nameCell?.getAttribute("data-type");

  if (typeFromCell === "works") {
    // Для робіт викликаємо async calculateRowSum
    import("../modalUI")
      .then(async ({ calculateRowSum }) => {
        await calculateRowSum(row); // ← Тепер row має правильний тип
      })
      .catch((err) => {
        console.error(
          "Помилка при розрахунку суми після вибору каталогу:",
          err
        );
      });
  } else {
    // Для деталей звичайний recalc
    recalcRowSum(row);
  }
}

/** ПІБ/Магазин: тип */
function updatePibMagazinDataType(pibMagazinCell: HTMLElement): string {
  const currentRow = pibMagazinCell.closest("tr");
  const nameCell = currentRow?.querySelector(
    '[data-name="name"]'
  ) as HTMLElement;
  const nameQuery = nameCell?.textContent?.trim() || "";

  const isExactDetail = globalCache.details.some(
    (d) => d.toLowerCase() === nameQuery.toLowerCase()
  );
  const isExactWork = globalCache.works.some(
    (w) => w.toLowerCase() === nameQuery.toLowerCase()
  );

  let targetType = "slyusars";
  if (isExactDetail && !isExactWork) targetType = "shops";

  pibMagazinCell.setAttribute("data-type", targetType);
  return targetType;
}
