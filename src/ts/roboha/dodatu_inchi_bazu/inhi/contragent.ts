// D:\Alim\Проект\Бодя СТО\stoBraclavecGIT\src\ts\roboha\dodatu_inchi_bazu\inhi\contragent.ts
import { supabase } from "../../../vxid/supabaseClient";
import { updateAllBd, all_bd } from "../dodatu_inchi_bazu_danux";

export interface ContragentRecord {
  faktura_id: number;
  name: string;
  oderjyvach: string;
  prumitka: string;
  data: string | null;
}

export let contragentData: ContragentRecord[] = [];

// Завантаження даних з бази faktura
export async function loadContragentData(): Promise<ContragentRecord[]> {
  try {
    const { data, error } = await supabase
      .from("faktura")
      .select("faktura_id, name, oderjyvach, prumitka, data")
      .order("faktura_id", { ascending: true });

    if (error) {
      console.error("Помилка завантаження контрагентів:", error);
      return [];
    }

    return (data as ContragentRecord[]) || [];
  } catch (err) {
    console.error("Критична помилка завантаження:", err);
    return [];
  }
}

function isoToDots(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  const parts = iso.split("T")[0]?.split("-");
  if (parts && parts.length === 3) {
    const [y, m, d2] = parts;
    return `${d2.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
  }
  return iso;
}

// Створення ультра-компактного календаря
function createDatePicker(input: HTMLInputElement) {
  const calendar = document.createElement("div");
  calendar.className = "contragent-calendar";
  calendar.style.cssText = `
    position: absolute;
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 8px 8px 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    display: none;
    width: 200px;
  `;

  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    font-weight: bold;
    font-size: 12px;
  `;

  const monthNames = [
    "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
    "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
  ];

  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  header.innerHTML = `
    <button type="button" class="cal-prev" style="border:none;background:none;cursor:pointer;font-size:11px;padding:1px 2px;">◀</button>
    <span style="font-size:10px;">${monthNames[month]} ${year}</span>
    <button type="button" class="cal-next" style="border:none;background:none;cursor:pointer;font-size:11px;padding:1px 2px;">▶</button>
  `;

  calendar.appendChild(header);

  const daysHeader = document.createElement("div");
  daysHeader.style.cssText = `
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    text-align: center;
    font-weight: bold;
    margin-bottom: 6px;
    font-size: 10px;
  `;

  daysHeader.innerHTML = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]
    .map((d) => `<div style="padding:1px;">${d}</div>`)
    .join("");
  calendar.appendChild(daysHeader);

  const renderDays = (y: number, m: number) => {
    const daysGrid = calendar.querySelector(".days-grid") as HTMLDivElement;
    if (daysGrid) daysGrid.remove();

    const grid = document.createElement("div");
    grid.className = "days-grid";
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 3px;
      text-align: center;
    `;

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < offset; i++) {
      grid.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.textContent = String(day);
      dayBtn.style.cssText = `
        min-height: 22px;
        padding: 4px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 12px;
        line-height: 1.1;
      `;

      const isToday = y === todayY && m === todayM && day === todayD;
      if (isToday) {
        dayBtn.style.background = "#e6f0ff";
        dayBtn.style.borderColor = "#3b82f6";
        dayBtn.style.color = "#0b5cff";
      }

      dayBtn.addEventListener("mouseenter", () => {
        if (!isToday) dayBtn.style.background = "#e3f2fd";
      });
      dayBtn.addEventListener("mouseleave", () => {
        dayBtn.style.background = isToday ? "#e6f0ff" : "white";
      });

      dayBtn.addEventListener("click", () => {
        const yyyy = String(y);
        const mm = String(m + 1).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        input.value = `${dd}.${mm}.${yyyy}`;
        calendar.style.display = "none";
      });

      grid.appendChild(dayBtn);
    }

    calendar.appendChild(grid);
  };

  renderDays(year, month);

  let currentYear = year;
  let currentMonth = month;

  header.querySelector(".cal-prev")?.addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    header.querySelector("span")!.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    renderDays(currentYear, currentMonth);
  });

  header.querySelector(".cal-next")?.addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    header.querySelector("span")!.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    renderDays(currentYear, currentMonth);
  });

  return calendar;
}

// Функція для очищення полів форми
export function clearFormFields() {
  const nameInput = document.getElementById("contragent-name") as HTMLTextAreaElement;
  const receiverInput = document.getElementById("contragent-receiver") as HTMLTextAreaElement;
  const noteInput = document.getElementById("contragent-note") as HTMLTextAreaElement;
  const dateInput = document.getElementById("contragent-date") as HTMLInputElement;

  if (nameInput) nameInput.value = "";
  if (receiverInput) receiverInput.value = "";
  if (noteInput) noteInput.value = "";
  if (dateInput) dateInput.value = "";
  updateAllBd(null);
}

// Головна функція обробки
export async function handleDhereloContragent() {
  contragentData = await loadContragentData();

  const rightPanel = document.querySelector(".modal-right-all_other_bases") as HTMLDivElement;
  if (!rightPanel) {
    console.error("Не знайдено правої панелі модального вікна");
    return;
  }

  const globalSearch = document.getElementById("global-search-wrap");
  if (globalSearch) {
    globalSearch.classList.add("hidden-all_other_bases");
  }

  const existing = document.getElementById("contragent-form");
  if (existing) existing.remove();

  const formContainer = document.createElement("div");
  formContainer.id = "contragent-form";
  formContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 0;
  `;

  // --- Інпут 1: Одержувач (textarea з автокомплітом) ---
  const receiverWrapper = document.createElement("div");
  receiverWrapper.style.position = "relative";

  const receiverLabel = document.createElement("label");
  receiverLabel.textContent = "Одержувач:";
  receiverLabel.style.cssText = "font-weight: 500; margin-bottom: 5px; display: block;";

  const receiverInput = document.createElement("textarea");
  receiverInput.id = "contragent-receiver";
  receiverInput.className = "textarea-all_other_bases";
  receiverInput.placeholder = "Введіть одержувача...";
  receiverInput.autocomplete = "off";
  receiverInput.rows = 2;

  const receiverDropdown = document.createElement("div");
  receiverDropdown.className = "contragent-dropdown hidden-all_other_bases";
  receiverDropdown.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;

  receiverWrapper.appendChild(receiverInput);
  receiverWrapper.appendChild(receiverDropdown);

  // --- Інпут 2: ЗАТВЕРДЖУЮ (textarea) ---
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "ЗАТВЕРДЖУЮ:";
  nameLabel.style.cssText = "font-weight: 500; margin-bottom: 5px; display: block;";

  const nameInput = document.createElement("textarea");
  nameInput.id = "contragent-name";
  nameInput.className = "textarea-all_other_bases";
  nameInput.placeholder = "Введіть назву контрагента...";
  nameInput.rows = 2;

  // --- Інпут 3: Від Замовника (textarea) ---
  const noteLabel = document.createElement("label");
  noteLabel.textContent = "Від Замовника:";
  noteLabel.style.cssText = "font-weight: 500; margin-bottom: 5px; display: block;";

  const noteInput = document.createElement("textarea");
  noteInput.id = "contragent-note";
  noteInput.className = "textarea-all_other_bases";
  noteInput.placeholder = "Введіть примітку...";
  noteInput.rows = 2;

  // --- Інпут 4: Дата ---
  const dateWrapper = document.createElement("div");
  dateWrapper.style.cssText = `
    position: relative;
    align-self: flex-start;
    width: 200px;
  `;

  const dateLabel = document.createElement("label");
  dateLabel.textContent = "Дата:";
  dateLabel.style.cssText = `
    font-weight: 100;
    margin-bottom: 5px;
    display: block;
    text-align: left;
  `;

  const dateInput = document.createElement("input");
  dateInput.type = "text";
  dateInput.id = "contragent-date";
  dateInput.className = "input-all_other_bases";
  dateInput.placeholder = "Оберіть дату...";
  dateInput.readOnly = true;
  dateInput.style.cssText = `
    cursor: pointer;
    width: 200px;
    text-align: left;
  `;

  const calendar = createDatePicker(dateInput);
  dateWrapper.appendChild(dateLabel);
  dateWrapper.appendChild(dateInput);
  dateWrapper.appendChild(calendar);

  // --- Спільна функція для заповнення форми ---
  const fillFormWithContragent = (item: ContragentRecord) => {
    receiverInput.value = item.oderjyvach || "";
    nameInput.value = item.name;
    noteInput.value = item.prumitka || "";
    dateInput.value = isoToDots(item.data);

    receiverDropdown.classList.add("hidden-all_other_bases");

    updateAllBd(
      JSON.stringify({
        table: "faktura",
        faktura_id: item.faktura_id,
        name: item.name,
        oderjyvach: item.oderjyvach,
        prumitka: item.prumitka,
        data: item.data,
      })
    );
  };

  // --- Функція оновлення списку для "Одержувач" ---
  const updateReceiverDropdown = (query: string) => {
    receiverDropdown.innerHTML = "";
    const filtered = contragentData
      .filter((item) => item.oderjyvach && item.oderjyvach.toLowerCase().includes(query))
      .slice(0, 50);

    if (!filtered.length) {
      receiverDropdown.classList.add("hidden-all_other_bases");
      return;
    }

    filtered.forEach((item) => {
      const option = document.createElement("div");
      option.className = "contragent-dropdown-item";
      option.style.cssText = `
        padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;
      `;
      option.textContent = item.oderjyvach;
      option.addEventListener("mouseenter", () => {
        option.style.background = "#f0f0f0";
      });
      option.addEventListener("mouseleave", () => {
        option.style.background = "white";
      });
      option.addEventListener("click", () => {
        fillFormWithContragent(item);
      });
      receiverDropdown.appendChild(option);
    });
    receiverDropdown.classList.remove("hidden-all_other_bases");
  };

  // --- Обробники подій для "Одержувач" ---
  receiverInput.addEventListener("input", () => {
    const query = receiverInput.value.toLowerCase().trim();
    updateReceiverDropdown(query);
    if (!query) {
      nameInput.value = "";
      noteInput.value = "";
      dateInput.value = "";
      updateAllBd(null);
    }
  });

  receiverInput.addEventListener("click", (e) => {
    e.stopPropagation();
    updateReceiverDropdown(receiverInput.value.toLowerCase().trim());
  });

  // --- Глобальний обробник для закриття списків ---
  const closeDropdownHandler = (e: MouseEvent) => {
    if (!receiverWrapper.contains(e.target as Node)) {
      receiverDropdown.classList.add("hidden-all_other_bases");
    }
  };
  document.addEventListener("click", closeDropdownHandler);

  // Показ/приховування календаря
  dateInput.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".contragent-calendar").forEach((cal) => {
      if (cal !== calendar) (cal as HTMLElement).style.display = "none";
    });
    receiverDropdown.classList.add("hidden-all_other_bases");

    const isVisible = calendar.style.display === "block";
    if (isVisible) {
      calendar.style.display = "none";
      return;
    }
    
    calendar.style.display = "block";
    calendar.style.left = "0";
    calendar.style.top = "auto";
    calendar.style.bottom = `${dateInput.offsetHeight + 5}px`;
    const calRect = calendar.getBoundingClientRect();
    if (calRect.top < 0) {
      calendar.style.bottom = "auto";
      calendar.style.top = `${dateInput.offsetHeight + 5}px`;
    }
  });

  const closeCalendarHandler = (e: MouseEvent) => {
    if (!dateWrapper.contains(e.target as Node)) {
      calendar.style.display = "none";
    }
  };
  document.addEventListener("click", closeCalendarHandler);

  // Додаємо елементи до форми в новому порядку
  formContainer.appendChild(receiverLabel);
  formContainer.appendChild(receiverWrapper);

  formContainer.appendChild(nameLabel);
  formContainer.appendChild(nameInput);

  formContainer.appendChild(noteLabel);
  formContainer.appendChild(noteInput);

  formContainer.appendChild(dateWrapper);

  const buttonsDiv = rightPanel.querySelector(".yes-no-buttons-all_other_bases");
  if (buttonsDiv) {
    rightPanel.insertBefore(formContainer, buttonsDiv);
  } else {
    rightPanel.appendChild(formContainer);
  }
}

// Функція для очищення форми контрагентів
export function clearContragentForm() {
  const form = document.getElementById("contragent-form");
  if (form) {
    form.remove();
  }

  document.querySelectorAll(".contragent-calendar").forEach((cal) => {
    (cal as HTMLElement).style.display = "none";
  });

  contragentData = [];
  updateAllBd(null);
}

// ====== CONTRAGENT (faktura) CRUD =========================================

function dotsToISO(dots: string | null): string | null {
  if (!dots) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dots.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

async function getNextFakturaId(): Promise<number | null> {
  const { data, error } = await supabase
    .from("faktura")
    .select("faktura_id")
    .order("faktura_id", { ascending: false })
    .limit(1);
  if (error) {
    console.error("Помилка отримання наступного faktura_id:", error);
    return null;
  }
  const max = (data?.[0]?.faktura_id ?? 0) as number;
  return max + 1;
}

function readFakturaFormPayload() {
  const nameEl = document.getElementById("contragent-name") as HTMLTextAreaElement | null;
  const receiverEl = document.getElementById("contragent-receiver") as HTMLTextAreaElement | null;
  const noteEl = document.getElementById("contragent-note") as HTMLTextAreaElement | null;
  const dateEl = document.getElementById("contragent-date") as HTMLInputElement | null;

  const name = (nameEl?.value ?? "").trim();
  const oderjyvach = (receiverEl?.value ?? "").trim();
  const prumitka = (noteEl?.value ?? "").trim();
  const data = dotsToISO((dateEl?.value ?? "").trim());

  return { name, oderjyvach, prumitka, data };
}

function getModeFromLabel(): "Додати" | "Редагувати" | "Видалити" {
  const modeLabel = document.getElementById("modeToggleLabel");
  const t = modeLabel?.textContent?.trim() ?? "Додати";
  if (t === "Редагувати" || t === "Видалити") return t;
  return "Додати";
}

function toast(msg: string, color: string) {
  const note = document.createElement("div");
  note.textContent = msg;
  Object.assign(note.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: color,
    color: "white",
    padding: "12px 24px",
    borderRadius: "8px",
    zIndex: "10001",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    fontSize: "14px",
    fontWeight: "500",
  } as CSSStyleDeclaration);
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 1800);
}

function getDraftFakturaId(): number | null {
  try {
    const raw = all_bd ?? null; 
    const parsed = raw ? JSON.parse(raw) : null;
    const id = parsed?.faktura_id ?? null;
    if (typeof id === "number") return id;
    if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
    return null;
  } catch {
    return null;
  }
}

export async function tryHandleFakturaCrud(): Promise<boolean> {
  const mode = getModeFromLabel();
  const payload = readFakturaFormPayload();

  try {
    // ========== ДОДАВАННЯ ==========
    if (mode === "Додати") {
      if (!payload.name) {
        toast("Заповніть назву контрагента", "#ff9800");
        return false;
      }
      
      const nextId = await getNextFakturaId();
      if (nextId == null) {
        toast("Помилка отримання наступного ID", "#f44336");
        return false;
      }

      const ins = { faktura_id: nextId, ...payload };
      
      const { error } = await supabase
        .from("faktura")
        .insert(ins)
        .select();
      
      if (error) {
        console.error("❌ Помилка додавання в faktura:", error);
        toast(`Помилка додавання: ${error.message}`, "#f44336");
        return false;
      }
      
      contragentData = await loadContragentData();
      return true;
    }

    // ========== РЕДАГУВАННЯ / ВИДАЛЕННЯ ==========
    const faktura_id = getDraftFakturaId();
    
    if (!faktura_id) {
      console.error("❌ faktura_id відсутній. all_bd:", all_bd);
      toast("Не знайдено faktura_id для операції", "#ff9800");
      return false;
    }

    if (mode === "Редагувати") {
      const { error } = await supabase
        .from("faktura")
        .update(payload)
        .eq("faktura_id", faktura_id) 
        .select();
        
      if (error) {
        console.error("❌ Помилка редагування faktura:", error);
        toast(`Помилка редагування: ${error.message}`, "#f44336");
        return false;
      }
      
      contragentData = await loadContragentData();
      return true;
    }

    if (mode === "Видалити") {
      const { error } = await supabase
        .from("faktura")
        .delete()
        .eq("faktura_id", faktura_id); 
        
      if (error) {
        console.error("❌ Помилка видалення faktura:", error);
        toast(`Помилка видалення: ${error.message}`, "#f44336");
        return false;
      }

      contragentData = await loadContragentData();
      return true;
    }

    toast("Невідомий режим CRUD", "#f44336");
    return false;
    
  } catch (e: any) {
    console.error("❌ Faktura CRUD error:", e);
    toast(e?.message || "Невідома помилка", "#f44336");
    return false;
  }
}