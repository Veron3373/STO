// src\ts\roboha\dodatu_inchi_bazu\inhi\scladMagasunDetal.ts
import { supabase } from "../../../vxid/supabaseClient";
import { updateAllBd, CRUD } from "../dodatu_inchi_bazu_danux";
import { initBatchImport } from "./batchImportSclad";

/** ====== СТАН МАГАЗИН ====== */
export type ShopEditState = {
  originalName: string | null;
  currentName: string;
  baseShopId: number | null;
  touched: boolean;
};
export const shopEditState: ShopEditState = {
  originalName: null,
  currentName: "",
  baseShopId: null,
  touched: false,
};
export function resetShopState() {
  shopEditState.originalName = null;
  shopEditState.currentName = "";
  shopEditState.baseShopId = null;
  shopEditState.touched = false;
}

/** ====== СТАН ДЕТАЛЬ ====== */
export type DetailEditState = {
  originalName: string | null;
  currentName: string;
  baseDetailId: number | null;
  touched: boolean;
};
export const detailEditState: DetailEditState = {
  originalName: null,
  currentName: "",
  baseDetailId: null,
  touched: false,
};
export function resetDetailState() {
  detailEditState.originalName = null;
  detailEditState.currentName = "";
  detailEditState.baseDetailId = null;
  detailEditState.touched = false;
}

/** ====== SCLAD ID (ключ для UPDATE/DELETE) ====== */
let currentScladId: string | null = null;
let persistentScladId: string | null = null;

function setScladId(id: string | null) {
  currentScladId = id;
  if (id) {
    persistentScladId = id;
  }
  const hidden = document.getElementById("hidden-sclad-id") as HTMLInputElement | null;
  if (hidden) hidden.value = id ?? "";
}

export function getCurrentScladId() {
  return currentScladId || persistentScladId;
}

let originalScladId: string | null = null;
let originalPartNumber: string | null = null;
export function getOriginalScladAnchor() {
  return { id: originalScladId, part: originalPartNumber };
}

function clearAllScladIds() {
  currentScladId = null;
  persistentScladId = null;
  originalScladId = null;
  originalPartNumber = null;
  const hidden = document.getElementById("hidden-sclad-id") as HTMLInputElement | null;
  if (hidden) hidden.value = "";
}

/** ====== КЕШ ДЛЯ ДЕТАЛЕЙ ====== */
let detailsCache: string[] = [];
let lastDetailQuery = "";

/** Завантаження ВСІХ деталей з бази даних (пагінація для великих обсягів) */
async function loadDetailsFromDB(): Promise<string[]> {
  const names: string[] = [];
  let hasMore = true;
  let offset = 0;
  const batchSize = 1000; // Завантажуємо по 1000 записів за раз

  console.log("Початок завантаження деталей з БД...");

  while (hasMore) {
    const { data, error, count } = await supabase
      .from("details")
      .select("data", { count: "exact" })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error("Помилка завантаження деталей:", error);
      break;
    }

    if (data && data.length > 0) {
      data.forEach((r: any) => {
        const nm = r?.data ? String(r.data).trim() : "";
        if (nm) names.push(nm);
      });

      offset += batchSize;
      hasMore = data.length === batchSize;
      
      console.log(`Завантажено ${names.length} деталей...`);
    } else {
      hasMore = false;
    }

    // Якщо є точна кількість і ми вже все завантажили
    if (count !== null && offset >= count) {
      hasMore = false;
    }
  }

  console.log(`Завершено завантаження ${names.length} деталей з БД`);
  
  return Array.from(new Set(names)).sort();
}

/** Рендер форми «Склад» */
export async function renderScladForm() {
  const host = document.getElementById("sclad-form");
  if (!host) return;

  resetShopState();
  resetDetailState();

  host.innerHTML = `
    <input id="hidden-sclad-id" type="hidden" />
    <div class="sclad-grid">
      ${field("sclad_date", "Дата", "date")}
      ${field("sclad_shop", "Магазин", "text", '<div id="sclad_shop_dd" class="custom-dropdown hidden-all_other_bases"></div>')}
      ${field("sclad_detail_catno", "Каталожний номер деталі", "text", '<div id="sclad_part_dd" class="custom-dropdown hidden-all_other_bases"></div>')}
      ${field("sclad_detail", "Деталь", "text", '<div id="sclad_detail_dd" class="custom-dropdown hidden-all_other_bases"></div>')}
      ${field("sclad_qty_in", "Кількість надходженя", "number")}
      ${field("sclad_price", "Ціна", "number")}
      ${field("sclad_invoice_no", "Рахунок №")}
      ${selectField("sclad_unit", "Одиниця виміру", [
        ["штук", "штук"],
        ["літр", "літр"],
        ["комплект", "комплект"],
      ])}
    </div>
  `;
  host.classList.remove("hidden-all_other_bases");

  const hidden = document.getElementById("hidden-sclad-id") as HTMLInputElement | null;
  if (hidden && persistentScladId) {
    hidden.value = persistentScladId;
    currentScladId = persistentScladId;
  }

  await wireShopAutocomplete("sclad_shop", "sclad_shop_dd");
  await wireDetailsAutocompleteWithLiveLoad("sclad_detail", "sclad_detail_dd");
  await wireLinkedAutocomplete();

  const dateInput = host.querySelector<HTMLInputElement>("#sclad_date");
  if (dateInput && !dateInput.dataset.pickerBound) {
    const openPicker = () => {
      try {
        (dateInput as any).showPicker?.();
      } catch {}
    };
    dateInput.dataset.pickerBound = "1";
    dateInput.addEventListener("click", openPicker);
    dateInput.addEventListener("focus", openPicker);
    dateInput.addEventListener("keydown", (e) => {
      if (["ArrowDown", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openPicker();
      }
    });
  }

  host.querySelectorAll("input,select,textarea").forEach((el) => {
    el.addEventListener("input", snapshotToAllBd);
    el.addEventListener("change", snapshotToAllBd);
  });
  snapshotToAllBd();

  initBatchImport();
}

/* ---------- helpers ---------- */
function field(id: string, label: string, type: "text" | "date" | "number" = "text", extra = "") {
  return `
    <div class="form-field">
      <label class="field-label" for="${id}">${label}</label>
      <input id="${id}" type="${type}" class="input-all_other_bases" autocomplete="off" />
      ${extra}
    </div>`;
}

function selectField(id: string, label: string, options: Array<[string, string]>) {
  const opts = options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  return `
    <div class="form-field">
      <label class="field-label" for="${id}">${label}</label>
      <select id="${id}" class="input-all_other_bases">${opts}</select>
    </div>`;
}

/* ==== автопідказка магазин ==== */
async function wireShopAutocomplete(inputId: string, dropdownId: string) {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  const dd = document.getElementById(dropdownId) as HTMLDivElement | null;
  if (!input || !dd) return;

  const { data: rows, error } = await supabase.from("shops").select("shop_id,data");
  if (error) return console.error("Помилка shops:", error);

  const names: string[] = [];
  const nameToId = new Map<string, number>();
  (rows ?? []).forEach((r: any) => {
    try {
      const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      const nm = d?.Name ? String(d.Name).trim() : "";
      if (nm) {
        names.push(nm);
        nameToId.set(nm, Number(r.shop_id));
      }
    } catch (e) {
      console.error("Парсинг shop.data:", e);
    }
  });
  const uniqueSorted = Array.from(new Set(names)).sort();

  const setBaseOnce = () => {
    if (!shopEditState.touched) {
      const val = (input.value ?? "").trim();
      shopEditState.originalName = val || null;
      shopEditState.baseShopId = nameToId.get(val) ?? null;
    }
  };
  const updateCurrent = (v: string) => {
    shopEditState.touched = true;
    shopEditState.currentName = (v ?? "").trim();
  };

  const render = (filter: string) => {
    dd.innerHTML = "";
    const filtered = filter
      ? uniqueSorted.filter((o) => o.toLowerCase().includes(filter.toLowerCase()))
      : uniqueSorted;
    if (!filtered.length) return dd.classList.add("hidden-all_other_bases");

    filtered.forEach((val) => {
      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      item.textContent = val;
      item.onclick = () => {
        input.value = val;
        setBaseOnce();
        if (!shopEditState.baseShopId) shopEditState.baseShopId = nameToId.get(val) ?? null;
        updateCurrent(val);
        dd.classList.add("hidden-all_other_bases");
        snapshotToAllBd();
      };
      dd.appendChild(item);
    });

    dd.classList.remove("hidden-all_other_bases");
    dd.style.minWidth = `${input.getBoundingClientRect().width}px`;
  };

  input.addEventListener("focus", () => {
    setBaseOnce();
    render(input.value);
  });
  input.addEventListener("click", () => render(input.value));
  input.addEventListener("input", () => {
    setBaseOnce();
    updateCurrent(input.value);
    render(input.value);
  });

  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target as Node) && e.target !== input) dd.classList.add("hidden-all_other_bases");
  });
}

/* ==== НОВИЙ автокомпліт деталі з підтягуванням даних ==== */
async function wireDetailsAutocompleteWithLiveLoad(inputId: string, dropdownId: string) {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  const dd = document.getElementById(dropdownId) as HTMLDivElement | null;
  if (!input || !dd) return;

  let nameToId = new Map<string, number>();

  const setBaseOnce = () => {
    if (!detailEditState.touched) {
      const val = (input.value ?? "").trim();
      detailEditState.originalName = val || null;
      detailEditState.baseDetailId = nameToId.get(val) ?? null;
    }
  };

  const updateCurrent = (v: string) => {
    detailEditState.touched = true;
    detailEditState.currentName = (v ?? "").trim();
  };

  const render = (filtered: string[]) => {
    dd.innerHTML = "";
    if (!filtered.length) return dd.classList.add("hidden-all_other_bases");

    filtered.forEach((val) => {
      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      item.textContent = val;
      item.onclick = () => {
        input.value = val;
        setBaseOnce();
        if (!detailEditState.baseDetailId) detailEditState.baseDetailId = nameToId.get(val) ?? null;
        updateCurrent(val);
        dd.classList.add("hidden-all_other_bases");
        snapshotToAllBd();
      };
      dd.appendChild(item);
    });

    dd.classList.remove("hidden-all_other_bases");
    dd.style.minWidth = `${input.getBoundingClientRect().width}px`;
  };

  // Завантаження даних при введенні >= 3 символів
  const loadAndFilter = async (query: string) => {
    const trimmedQuery = query.trim();
    
    // Якщо менше 3 символів - очищаємо
    if (trimmedQuery.length < 3) {
      detailsCache = [];
      lastDetailQuery = "";
      dd.classList.add("hidden-all_other_bases");
      return;
    }

    // Перевірка чи потрібно перезавантажувати дані
    const needsReload = trimmedQuery.length < lastDetailQuery.length || 
                        !lastDetailQuery || 
                        !trimmedQuery.startsWith(lastDetailQuery.substring(0, 3));

    if (needsReload) {
      // Завантажуємо ВСІ дані з бази (з пагінацією)
      console.log("Завантаження ВСІХ деталей з БД...");
      const allDetails = await loadDetailsFromDB();
      
      // Завантажуємо ID для ВСІХ деталей (також з пагінацією)
      nameToId = new Map();
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("details")
          .select("detail_id,data")
          .range(offset, offset + batchSize - 1);

        if (!error && data && data.length > 0) {
          data.forEach((r: any) => {
            const nm = r?.data ? String(r.data).trim() : "";
            if (nm) nameToId.set(nm, Number(r.detail_id));
          });
          
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      detailsCache = allDetails;
      lastDetailQuery = trimmedQuery;
      console.log(`Завантажено і закешовано ${detailsCache.length} деталей`);
    } else {
      // Просто оновлюємо останній запит
      lastDetailQuery = trimmedQuery;
    }

    // Фільтруємо з кешу
    const filtered = detailsCache.filter((name) =>
      name.toLowerCase().includes(trimmedQuery.toLowerCase())
    );

    console.log(`Знайдено ${filtered.length} деталей за запитом "${trimmedQuery}"`);
    render(filtered);
  };

  input.addEventListener("input", async () => {
    const val = input.value;
    setBaseOnce();
    updateCurrent(val);
    await loadAndFilter(val);
  });

  input.addEventListener("focus", async () => {
    setBaseOnce();
    if (input.value.trim().length >= 3) {
      await loadAndFilter(input.value);
    }
  });

  input.addEventListener("click", async () => {
    if (input.value.trim().length >= 3) {
      await loadAndFilter(input.value);
    }
  });

  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target as Node) && e.target !== input) {
      dd.classList.add("hidden-all_other_bases");
    }
  });
}

/* ==== автокомпліт SCLAD по part_number (з дублями) ==== */
function fillFormFieldsFromSclad(record: any) {
  if (record?.sclad_id) {
    setScladId(String(record.sclad_id));
    originalScladId = String(record.sclad_id);
  }

  originalPartNumber = record?.part_number ?? null;

  const fields: Record<string, any> = {
    sclad_date: record?.time_on ? String(record.time_on).split("T")[0] : "",
    sclad_shop: record?.shops ?? "",
    sclad_detail: record?.name ?? "",
    sclad_qty_in: record?.kilkist_on ?? "",
    sclad_price: record?.price ?? "",
    sclad_invoice_no: record?.rahunok ?? "",
    sclad_unit: record?.unit_measurement ?? "",
    sclad_detail_catno: record?.part_number ?? "",
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = String(val ?? "");
  });

  const shopInput = document.getElementById("sclad_shop") as HTMLInputElement | null;
  if (shopInput?.value) {
    shopEditState.touched = true;
    shopEditState.originalName = shopInput.value.trim();
    shopEditState.currentName = shopInput.value.trim();
  }
  const detailInput = document.getElementById("sclad_detail") as HTMLInputElement | null;
  if (detailInput?.value) {
    detailEditState.touched = true;
    detailEditState.originalName = detailInput.value.trim();
    detailEditState.currentName = detailInput.value.trim();
  }
}

async function wireLinkedAutocomplete() {
  const input = document.getElementById("sclad_detail_catno") as HTMLInputElement | null;
  const dd = document.getElementById("sclad_part_dd") as HTMLDivElement | null;
  if (!input || !dd) return;

  const { data, error } = await supabase
    .from("sclad")
    .select("sclad_id, part_number, name, shops, kilkist_on, price, rahunok, unit_measurement, time_on")
    .order("sclad_id", { ascending: false });
  if (error) return console.error("Помилка sclad:", error);

  const all = (data ?? []).filter((r) => r.part_number);

  const renderDropdown = (filtered: any[], onSelect: (r: any) => void) => {
    dd.innerHTML = "";
    if (!filtered.length) return dd.classList.add("hidden-all_other_bases");

    filtered.forEach((r) => {
      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      Object.assign(item.style, {
        padding: "8px 12px",
        borderBottom: "1px solid #eee",
        cursor: "pointer",
        transition: "background-color .2s ease",
        backgroundColor: "white",
      } as CSSStyleDeclaration);
      item.innerHTML = `
        <div style="font-weight:600;color:#333">${r.part_number}</div>
        <div style="font-size:11px;color:#666;margin-top:2px">
          ${r.name || "Немає деталі"} | ${r.price || 0} грн | к-ть: ${r.kilkist_on} | ${r.rahunok}
        </div>`;
      item.onmouseenter = () => {
        item.style.backgroundColor = "#f0f8ff";
        dd.querySelectorAll(".custom-dropdown-item").forEach((o) => {
          o.classList.remove("selected");
          if (o !== item) (o as HTMLElement).style.backgroundColor = "white";
        });
        item.classList.add("selected");
      };
      item.onmouseleave = () => {
        if (!item.classList.contains("selected")) item.style.backgroundColor = "white";
      };
      item.dataset.scladId = r.sclad_id;
      item.onclick = () => onSelect(r);
      dd.appendChild(item);
    });

    dd.classList.remove("hidden-all_other_bases");
    dd.style.minWidth = `${input.getBoundingClientRect().width}px`;
    dd.style.maxHeight = "300px";
    dd.style.overflowY = "auto";
    dd.style.border = "1px solid #ccc";
    dd.style.borderRadius = "4px";
    dd.style.backgroundColor = "white";
    dd.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
    dd.style.zIndex = "1000";
    dd.style.position = "absolute";
  };

  const handleInput = () => {
    const v = input.value.trim();
    if (v.length >= 3) {
      const filtered = all
        .filter((r) => r.part_number && r.part_number.toLowerCase().includes(v.toLowerCase()))
        .sort((a, b) => b.sclad_id - a.sclad_id);
      renderDropdown(filtered, (rec) => {
        input.value = rec.part_number;
        fillFormFieldsFromSclad(rec);
        dd.classList.add("hidden-all_other_bases");
        snapshotToAllBd();
      });
    } else {
      dd.classList.add("hidden-all_other_bases");
    }
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 3) handleInput();
  });

  input.addEventListener("input", () => {
    if (!input.value.trim()) {
      if ((CRUD ?? "").toLowerCase() === "додати") {
        clearAllScladIds();
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!dd.contains(e.target as Node) && e.target !== input) dd.classList.add("hidden-all_other_bases");
  });

  input.addEventListener("keydown", (e) => {
    const dropdown = document.getElementById("sclad_part_dd");
    if (!dropdown || dropdown.classList.contains("hidden-all_other_bases")) return;

    const items = dropdown.querySelectorAll(".custom-dropdown-item");
    let idx = -1;
    items.forEach((it, i) => {
      if (it.classList.contains("selected")) idx = i;
    });

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectDropdownItem(items, idx < items.length - 1 ? idx + 1 : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectDropdownItem(items, idx > 0 ? idx - 1 : items.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (idx >= 0) (items[idx] as HTMLElement).click();
    } else if (e.key === "Escape") {
      dropdown.classList.add("hidden-all_other_bases");
    }
  });
}

function selectDropdownItem(items: NodeListOf<Element>, index: number) {
  items.forEach((item, i) => {
    const el = item as HTMLElement;
    if (i === index) {
      item.classList.add("selected");
      el.style.backgroundColor = "#e3f2fd";
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
      el.style.backgroundColor = "white";
    }
  });
}

function pick(id: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el ? el.value : "";
}

function snapshotToAllBd() {
  const payload = {
    table: "sclad",
    sclad_id: getCurrentScladId(),
    data: {
      Дата: pick("sclad_date"),
      Магазин: pick("sclad_shop"),
      "Рахунок №": pick("sclad_invoice_no"),
      Деталь: pick("sclad_detail"),
      "Каталожний номер деталі": pick("sclad_detail_catno"),
      "Кількість надходження": pick("sclad_qty_in"),
      Ціна: pick("sclad_price"),
      Найменування: pick("sclad_unit"),
    },
  };
  updateAllBd(JSON.stringify(payload, null, 2));
}

export function clearScladForm() {
  clearAllScladIds();

  const formFields = [
    "sclad_date",
    "sclad_shop",
    "sclad_detail_catno",
    "sclad_detail",
    "sclad_qty_in",
    "sclad_price",
    "sclad_invoice_no",
    "sclad_unit",
  ];

  formFields.forEach((id) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = "";
  });

  resetShopState();
  resetDetailState();

  // Очищаємо кеш деталей
  detailsCache = [];
  lastDetailQuery = "";

  snapshotToAllBd();
}

export const handleScladClick = async () => {
  await renderScladForm();
  console.log("Склад форма відкрита, поточний ID:", getCurrentScladId());
};

export const initScladMagasunDetal = () => {
  console.log("Склад модуль ініціалізовано");
};