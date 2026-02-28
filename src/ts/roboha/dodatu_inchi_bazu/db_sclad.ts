//src\ts\roboha\dodatu_inchi_bazu\db_sclad.ts
import { supabase } from "../../vxid/supabaseClient";
import { CRUD } from "./dodatu_inchi_bazu_danux";
import {
  getCurrentScladId,
  getOriginalScladAnchor,
  getSlyusarIdByPib,
} from "./inhi/scladMagasunDetal";

// toast
function showToast(message: string, color: string) {
  const note = document.createElement("div");
  note.textContent = message;
  note.style.position = "fixed";
  note.style.top = "50%";
  note.style.left = "50%";
  note.style.transform = "translateX(-50%)";
  note.style.backgroundColor = color;
  note.style.color = "white";
  note.style.padding = "12px 24px";
  note.style.borderRadius = "8px";
  note.style.zIndex = "10001";
  note.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  note.style.fontSize = "14px";
  note.style.fontWeight = "500";
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 2500);
}

interface ScladRecord {
  sclad_id: string | number;
  part_number: string;
  name: string;
  kilkist_on: number;
  price: number;
  unit_measurement: string;
  time_on: string;
  shops: string;
  rahunok: string;
  akt: string | null;
  kilkist_off: number | null;
}

// у браузері setTimeout повертає number
let debounceTimer: number | null = null;
let currentAutocompleteResults: ScladRecord[] = [];
let selectedResultIndex = -1;

/* ==== автокомпліт part_number ==== */
async function searchScladByPartNumber(
  partNumber: string,
): Promise<ScladRecord[]> {
  const { data, error } = await supabase
    .from("sclad")
    .select("*")
    .ilike("part_number", `%${partNumber}%`)
    .order("sclad_id", { ascending: false });
  if (error) {
    // console.error("Помилка пошуку за каталожним номером:", error);
    return [];
  }
  return (data as any) || [];
}

function populateFormFields(record: ScladRecord) {
  const fields: Record<string, string> = {
    sclad_detail: String(record.name ?? ""),
    sclad_qty_in: String(record.kilkist_on ?? ""),
    sclad_price: String(record.price ?? ""),
    sclad_unit: String(record.unit_measurement ?? ""),
    sclad_date: String(record.time_on ?? ""),
    sclad_shop: String(record.shops ?? ""),
    sclad_invoice_no: String(record.rahunok ?? ""),
    sclad_procent: String((record as any).scladNomer ?? ""),
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (el) el.value = val;
  });

  // Заповнюємо ПІБ запчастиста за xto_zamovuv
  const xtoZamovuv = (record as any).xto_zamovuv;
  if (xtoZamovuv) {
    supabase
      .from("slyusars")
      .select("data")
      .eq("slyusar_id", xtoZamovuv)
      .single()
      .then(({ data: slyusar, error }) => {
        if (!error && slyusar) {
          try {
            const userData =
              typeof slyusar.data === "string"
                ? JSON.parse(slyusar.data)
                : slyusar.data;
            const pibInput = document.getElementById(
              "sclad_zapchastyst_pib",
            ) as HTMLInputElement | null;
            if (pibInput && userData?.Name) {
              pibInput.value = userData.Name;
            }
          } catch (e) {
            // console.error("Помилка заповнення ПІБ запчастиста:", e);
          }
        }
      });
  }

  const hidden = document.getElementById(
    "hidden-sclad-id",
  ) as HTMLInputElement | null;
  if (hidden) hidden.value = String(record.sclad_id ?? "");
}

function createAutocompleteDropdown(
  results: ScladRecord[],
  input: HTMLInputElement,
) {
  document.getElementById("part-number-dropdown")?.remove();
  if (!results.length) return;

  const dropdown = document.createElement("div");
  dropdown.id = "part-number-dropdown";
  Object.assign(dropdown.style, {
    position: "absolute",
    top: `${input.offsetTop + input.offsetHeight}px`,
    left: `${input.offsetLeft}px`,
    width: `${input.offsetWidth}px`,
    backgroundColor: "white",
    border: "1px solid #ccc",
    borderRadius: "4px",
    maxHeight: "200px",
    overflowY: "auto",
    zIndex: "1000",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
  } as CSSStyleDeclaration);

  results.forEach((r, idx) => {
    const item = document.createElement("div");
    Object.assign(item.style, {
      padding: "8px 12px",
      borderBottom: "1px solid #eee",
      cursor: "pointer",
      backgroundColor: idx === selectedResultIndex ? "#f0f0f0" : "white",
    } as CSSStyleDeclaration);
    item.innerHTML = `
      <div style="font-weight:600">${r.part_number}</div>
      <div style="font-size:12px;color:#666">${r.name} | ${r.price} грн | ID: ${r.sclad_id}</div>
    `;
    item.onmouseenter = () => {
      selectedResultIndex = idx;
      updateDropdownSelection();
    };
    item.onclick = () => {
      input.value = r.part_number;
      populateFormFields(r);
      dropdown.remove();
      selectedResultIndex = -1;
    };
    dropdown.appendChild(item);
  });

  input.parentElement?.appendChild(dropdown);
}

function updateDropdownSelection() {
  const dd = document.getElementById("part-number-dropdown");
  if (!dd) return;
  Array.from(dd.children).forEach((el, i) => {
    (el as HTMLElement).style.backgroundColor =
      i === selectedResultIndex ? "#f0f0f0" : "white";
  });
}

function handleDropdownKeyNavigation(
  e: KeyboardEvent,
  input: HTMLInputElement,
) {
  const dd = document.getElementById("part-number-dropdown");
  if (!dd || !currentAutocompleteResults.length) return;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      selectedResultIndex = Math.min(
        selectedResultIndex + 1,
        currentAutocompleteResults.length - 1,
      );
      updateDropdownSelection();
      break;
    case "ArrowUp":
      e.preventDefault();
      selectedResultIndex = Math.max(selectedResultIndex - 1, 0);
      updateDropdownSelection();
      break;
    case "Enter":
      e.preventDefault();
      if (selectedResultIndex >= 0) {
        const r = currentAutocompleteResults[selectedResultIndex];
        input.value = r.part_number;
        populateFormFields(r);
        dd.remove();
        selectedResultIndex = -1;
      }
      break;
    case "Escape":
      dd.remove();
      selectedResultIndex = -1;
      break;
  }
}

export function initPartNumberAutocomplete() {
  const input = document.getElementById(
    "sclad_detail_catno",
  ) as HTMLInputElement | null;
  if (!input) return;

  input.addEventListener("input", () => {
    const v = input.value.trim();
    if (debounceTimer) window.clearTimeout(debounceTimer);

    if (v.length < 3) {
      document.getElementById("part-number-dropdown")?.remove();
      currentAutocompleteResults = [];
      selectedResultIndex = -1;
      return;
    }
    debounceTimer = window.setTimeout(async () => {
      const results = await searchScladByPartNumber(v);
      currentAutocompleteResults = results;
      selectedResultIndex = -1;
      createAutocompleteDropdown(results, input);
    }, 300);
  });

  input.addEventListener("keydown", (e) =>
    handleDropdownKeyNavigation(e, input),
  );

  document.addEventListener("click", (e) => {
    const dd = document.getElementById("part-number-dropdown");
    if (
      dd &&
      !input.contains(e.target as Node) &&
      !dd.contains(e.target as Node)
    ) {
      dd.remove();
      selectedResultIndex = -1;
    }
  });
}

/* ==== читання/валідації ==== */
function readScladFormValues() {
  const pick = (id: string) =>
    (
      document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
    )?.value?.trim() ?? "";

  const toNum = (s: string) => {
    if (!s) return null;
    const num = Number(s.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(num) ? num : null;
  };

  const off = toNum(pick("sclad_kilkist_off")); // читаємо значення поля kilkist_off

  // Отримуємо slyusar_id: спочатку з інпуту ПІБ, якщо він заповнений, або з localStorage
  let slyusarId: number | null = null;
  const selectedPib = pick("sclad_zapchastyst_pib");

  if (selectedPib) {
    // Шукаємо slyusar_id за вибраним ПІБ в кеші запчастистів
    slyusarId = getSlyusarIdByPib(selectedPib);
  }

  // Якщо не вдалось отримати з вибраного ПІБ, використовуємо дефолтний slyusar_id поточного користувача
  if (!slyusarId) {
    try {
      const userDataStr = localStorage.getItem("userAuthData");
      if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        const id = userData.slyusar_id;
        if (id) {
          slyusarId = Number(id);
        }
      }
    } catch (e) {
      // console.error("Помилка отримання slyusar_id з localStorage:", e);
    }
  }

  // Перевіряємо чи є приховані інпути від batch import
  const hiddenXtoZamovuv = pick("sclad_xto_zamovuv");
  if (hiddenXtoZamovuv) {
    const hiddenId = Number(hiddenXtoZamovuv);
    if (Number.isFinite(hiddenId) && hiddenId > 0) {
      slyusarId = hiddenId;
    }
  }

  return {
    time_on: pick("sclad_date") || null,
    shops: pick("sclad_shop") || null,
    part_number: pick("sclad_detail_catno") || null,
    name: pick("sclad_detail") || null,
    kilkist_on: toNum(pick("sclad_qty_in")),
    price: toNum(pick("sclad_price")),
    rahunok: pick("sclad_invoice_no") || null,
    unit_measurement: pick("sclad_unit") || null,
    akt: pick("sclad_akt") || null,
    scladNomer: toNum(pick("sclad_procent")),
    xto_zamovuv: slyusarId, // ID користувача (запчастиста), який завантажив деталь
    statys: pick("sclad_statys") || null, // Статус деталі (Прибуло/Замовлено/Замовити)
    prumitka: pick("sclad_prumitka") || null, // Примітка

    // 🛠️ Безпечна заміна: якщо null → ставимо 0
    kilkist_off: off === null ? 0 : off,
  };
}

function validateCatalogNumber(part_number: string | null) {
  return !!(part_number && part_number.trim());
}

function validateScladPayload(p: ReturnType<typeof readScladFormValues>) {
  const missing: string[] = [];
  if (!p.time_on) missing.push("Дата");
  if (!p.shops) missing.push("Магазин");
  if (!p.part_number) missing.push("Каталог номер");
  if (!p.name) missing.push("Деталь");
  if (p.kilkist_on === null || p.kilkist_on <= 0)
    missing.push("Кількість надходження");
  if (p.price === null || p.price <= 0) missing.push("Ціна");
  if (!p.rahunok) missing.push("Рахунок №");
  if (!p.unit_measurement) missing.push("Найменування");
  if (missing.length)
    throw new Error(`Заповніть обов'язкові поля: ${missing.join(", ")}`);
}

/* ==== CRUD ==== */
export async function handleScladCrud(): Promise<boolean> {
  const mode = CRUD;
  try {
    const payload = readScladFormValues();
    if (!validateCatalogNumber(payload.part_number)) return false;

    if (mode === "Додати") {
      validateScladPayload(payload);
      const { error } = await supabase.from("sclad").insert(payload).select();
      if (error) {
        showToast(`Помилка додавання: ${error.message}`, "#f44336");
        throw error;
      }
      showToast("Запис успішно додано до складу", "#4caf50");
      return true;
    }

    // вибір ID: поточний/hidden/якір
    let sclad_id =
      getCurrentScladId() ||
      (
        document.getElementById("hidden-sclad-id") as HTMLInputElement | null
      )?.value?.trim() ||
      "";

    const { id: rememberedId, part: rememberedPart } = getOriginalScladAnchor();
    if (mode === "Редагувати" && rememberedId) {
      const currentPart = payload.part_number ?? "";
      if (rememberedPart && currentPart && currentPart !== rememberedPart) {
        sclad_id = rememberedId; // апдейтимо за старим ID
      }
    }

    const idForMatch = /^\d+$/.test(String(sclad_id))
      ? Number(sclad_id)
      : sclad_id;

    if (mode === "Редагувати") {
      validateScladPayload(payload);
      if (!sclad_id) {
        showToast("Не знайдено ID запису для редагування.", "#ff9800");
        return false;
      }
      const { data, error } = await supabase
        .from("sclad")
        .update(payload)
        .eq("sclad_id", idForMatch)
        .select();
      if (error) {
        showToast(`Помилка редагування: ${error.message}`, "#f44336");
        throw error;
      }
      if (!data?.length) {
        showToast("Запис не знайдено для редагування", "#ff9800");
        return false;
      }
      showToast("Запис успішно відредаговано", "#4caf50");
      return true;
    }

    if (mode === "Видалити") {
      if (!sclad_id) {
        showToast("Не знайдено ID запису для видалення", "#ff9800");
        return false;
      }
      const { data: exists, error: checkErr } = await supabase
        .from("sclad")
        .select("sclad_id")
        .eq("sclad_id", idForMatch)
        .maybeSingle();

      if (checkErr || !exists) {
        showToast("Запис не знайдено для видалення", "#ff9800");
        return false;
      }
      const { error } = await supabase
        .from("sclad")
        .delete()
        .eq("sclad_id", idForMatch);
      if (error) {
        showToast(`Помилка видалення: ${error.message}`, "#f44336");
        throw error;
      }
      showToast("Запис успішно видалено", "#4caf50");
      return true;
    }

    throw new Error(`Невідомий CRUD режим: ${mode}`);
  } catch (e: any) {
    if (!String(e?.message || "").includes("Помилка"))
      showToast(e?.message || "Невідома помилка", "#f44336");
    throw e;
  }
}

/* ==== утиліти ==== */
export async function getScladRecords(limit = 50) {
  const { data, error } = await supabase
    .from("sclad")
    .select("*")
    .order("sclad_id", { ascending: false })
    .limit(limit);
  if (error) {
    // console.error("Помилка отримання записів складу:", error);
    return [];
  }
  return (data as any) || [];
}

export async function findScladByPartNumber(partNumber: string) {
  const { data, error } = await supabase
    .from("sclad")
    .select("*")
    .ilike("part_number", `%${partNumber}%`)
    .order("sclad_id", { ascending: false });
  if (error) {
    // console.error("Помилка пошуку за каталожним номером:", error);
    return [];
  }
  return (data as any) || [];
}
