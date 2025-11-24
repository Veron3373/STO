// src\ts\roboha\dodatu_inchi_bazu\inhi\contragent.ts
import { supabase } from "../../../vxid/supabaseClient";
import { updateAllBd, all_bd, CRUD } from "../dodatu_inchi_bazu_danux";

export interface ContragentRecord {
  faktura_id: number;
  name: string;
  oderjyvach: string;
  prumitka: string;
  data: string | null;
}

export let contragentData: ContragentRecord[] = [];

const MAX_TEXTAREA_HEIGHT = 150;
const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

// ====== UTILITIES ======================================

function isoToDots(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  }
  const parts = iso.split("T")[0]?.split("-");
  if (parts?.length === 3) {
    return `${parts[2].padStart(2, "0")}.${parts[1].padStart(2, "0")}.${parts[0]}`;
  }
  return iso;
}

function dotsToISO(dots: string | null): string | null {
  if (!dots) return null;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dots.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function autoResizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  if (element.scrollHeight > MAX_TEXTAREA_HEIGHT) {
    element.style.height = `${MAX_TEXTAREA_HEIGHT}px`;
    element.style.overflowY = "auto";
  } else {
    element.style.height = `${element.scrollHeight}px`;
    element.style.overflowY = "hidden";
  }
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
  });
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 1800);
}

function getDraftFakturaId(): number | null {
  try {
    const parsed = all_bd ? JSON.parse(all_bd) : null;
    const id = parsed?.faktura_id ?? null;
    if (typeof id === "number") return id;
    if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
    return null;
  } catch {
    return null;
  }
}

// ====== DATA LOADING ===================================

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

// ====== ACT NUMBER MODAL ===============================

async function showActNumberModal() {
  const existingModal = document.getElementById("act-number-modal");
  if (existingModal) existingModal.remove();

  const overlay = document.createElement("div");
  overlay.id = "act-number-modal";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
    justify-content: center; z-index: 10001;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: white; border-radius: 12px; padding: 25px; width: 400px;
    max-width: 90%; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  `;

  modal.innerHTML = `
    <h3 style="margin: 0 0 20px 0; text-align: center; color: #333; font-size: 20px;">Запис номера акту</h3>
    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #555;">Пароль:</label>
    <input type="password" id="act-password" placeholder="Введіть пароль..." style="
      width: 100%; padding: 10px; margin-bottom: 15px; border: 2px solid #ddd;
      border-radius: 6px; font-size: 14px; box-sizing: border-box;
    ">
    <div id="act-error" style="
      display: none; background: #f44336; color: white; padding: 10px;
      border-radius: 6px; margin-bottom: 15px; font-size: 14px; text-align: center;
    "></div>
    <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #555;">Номер акту:</label>
    <input type="text" id="act-number" placeholder="Завантаження..." disabled style="
      width: 100%; padding: 10px; margin-bottom: 20px; border: 2px solid #ddd;
      border-radius: 6px; font-size: 14px; box-sizing: border-box; background: #f5f5f5;
    ">
    <button id="act-ok-btn" style="
      width: 100%; padding: 12px; background: linear-gradient(135deg, #4caf50, #45a049);
      color: white; border: none; border-radius: 6px; font-size: 16px;
      font-weight: bold; cursor: pointer; transition: all 0.3s;
    ">OK</button>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const passwordInput = modal.querySelector("#act-password") as HTMLInputElement;
  const actNumberInput = modal.querySelector("#act-number") as HTMLInputElement;
  const errorDiv = modal.querySelector("#act-error") as HTMLDivElement;
  const okButton = modal.querySelector("#act-ok-btn") as HTMLButtonElement;

  // Завантаження поточного номера акту
  try {
    const { data, error } = await supabase
      .from("acts")
      .select("contrAgent_raxunok")
      .eq("act_id", 1)
      .single();

    if (error) {
      console.error("❌ Помилка завантаження номера акту:", error);
      actNumberInput.placeholder = "Помилка завантаження";
    } else {
      actNumberInput.value = data?.contrAgent_raxunok != null ? String(data.contrAgent_raxunok) : "";
      actNumberInput.placeholder = "Введіть номер акту...";
    }
    actNumberInput.disabled = false;
    actNumberInput.style.background = "white";
    setTimeout(() => passwordInput.focus(), 100);
  } catch (err) {
    console.error("❌ Критична помилка завантаження:", err);
    actNumberInput.placeholder = "Помилка завантаження";
    actNumberInput.disabled = false;
    actNumberInput.style.background = "white";
  }

  // Фільтр тільки цифр
  actNumberInput.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    target.value = target.value.replace(/[^0-9]/g, "");
  });

  // Hover ефект для кнопки
  okButton.addEventListener("mouseenter", () => {
    okButton.style.background = "linear-gradient(135deg, #45a049, #4caf50)";
    okButton.style.transform = "translateY(-2px)";
    okButton.style.boxShadow = "0 4px 12px rgba(76, 175, 80, 0.4)";
  });
  okButton.addEventListener("mouseleave", () => {
    okButton.style.background = "linear-gradient(135deg, #4caf50, #45a049)";
    okButton.style.transform = "translateY(0)";
    okButton.style.boxShadow = "none";
  });

  // Обробка натискання OK
  const handleSubmit = async () => {
    const password = passwordInput.value.trim();
    const actNumber = actNumberInput.value.trim();

    errorDiv.style.display = "none";

    let storedPassword = "";
    try {
      const authData = localStorage.getItem("userAuthData");
      if (authData) {
        storedPassword = JSON.parse(authData)?.["Пароль"] || "";
      }
    } catch (err) {
      console.error("Помилка читання localStorage:", err);
    }

    if (password !== storedPassword) {
      errorDiv.textContent = "✖ Пароль невірний. № акту не записаний";
      errorDiv.style.display = "block";
      passwordInput.style.borderColor = "#f44336";
      passwordInput.focus();
      return;
    }

    if (!actNumber) {
      errorDiv.textContent = "⚠ Введіть номер акту";
      errorDiv.style.display = "block";
      errorDiv.style.backgroundColor = "#ff9800";
      actNumberInput.style.borderColor = "#ff9800";
      actNumberInput.focus();
      return;
    }

    try {
      const { error } = await supabase
        .from("acts")
        .update({ contrAgent_raxunok: parseInt(actNumber) })
        .eq("act_id", 1);

      if (error) {
        console.error("❌ Помилка запису:", error);
        errorDiv.textContent = `✖ Помилка запису: ${error.message}`;
        errorDiv.style.display = "block";
        return;
      }

      toast(`✅ Номер акту ${actNumber} успішно записано`, "#4caf50");
      overlay.remove();
    } catch (err) {
      console.error("❌ Критична помилка:", err);
      errorDiv.textContent = "✖ Критична помилка запису";
      errorDiv.style.display = "block";
    }
  };

  okButton.addEventListener("click", handleSubmit);

  const handleEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };
  passwordInput.addEventListener("keypress", handleEnter);
  actNumberInput.addEventListener("keypress", handleEnter);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ====== DATE PICKER ====================================

function createDatePicker(input: HTMLInputElement) {
  const calendar = document.createElement("div");
  calendar.className = "contragent-calendar";
  calendar.style.cssText = `
    position: absolute; background: white; border: 1px solid #ccc;
    border-radius: 6px; padding: 8px 8px 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000; display: none; width: 200px;
  `;

  const today = new Date();
  let currentYear = today.getFullYear();
  let currentMonth = today.getMonth();

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 4px; font-weight: bold; font-size: 12px;
  `;
  header.innerHTML = `
    <button type="button" class="cal-prev" style="border:none;background:none;cursor:pointer;font-size:11px;padding:1px 2px;">◀</button>
    <span class="cal-title" style="font-size:10px;">${MONTH_NAMES[currentMonth]} ${currentYear}</span>
    <button type="button" class="cal-next" style="border:none;background:none;cursor:pointer;font-size:11px;padding:1px 2px;">▶</button>
  `;

  const daysHeader = document.createElement("div");
  daysHeader.style.cssText = `
    display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
    text-align: center; font-weight: bold; margin-bottom: 6px; font-size: 10px;
  `;
  daysHeader.innerHTML = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"]
    .map(d => `<div style="padding:1px;">${d}</div>`).join("");

  calendar.appendChild(header);
  calendar.appendChild(daysHeader);

  const renderDays = (year: number, month: number) => {
    const existingGrid = calendar.querySelector(".days-grid");
    if (existingGrid) existingGrid.remove();

    const grid = document.createElement("div");
    grid.className = "days-grid";
    grid.style.cssText = `display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; text-align: center;`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < offset; i++) {
      grid.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.textContent = String(day);
      dayBtn.style.cssText = `
        min-height: 22px; padding: 4px 0; border: 1px solid #ddd;
        border-radius: 4px; background: white; cursor: pointer;
        transition: all 0.2s; font-size: 12px; line-height: 1.1;
      `;

      const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
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
        input.value = `${String(day).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}.${year}`;
        calendar.style.display = "none";
      });

      grid.appendChild(dayBtn);
    }

    calendar.appendChild(grid);
  };

  renderDays(currentYear, currentMonth);

  const titleSpan = header.querySelector(".cal-title") as HTMLSpanElement;
  const prevBtn = header.querySelector(".cal-prev");
  const nextBtn = header.querySelector(".cal-next");

  prevBtn?.addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    titleSpan.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    renderDays(currentYear, currentMonth);
  });

  nextBtn?.addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    titleSpan.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    renderDays(currentYear, currentMonth);
  });

  return calendar;
}

// ====== FORM MANAGEMENT ================================

export function clearFormFields() {
  const nameInput = document.getElementById("contragent-name") as HTMLTextAreaElement;
  const receiverInput = document.getElementById("contragent-receiver") as HTMLTextAreaElement;
  const noteInput = document.getElementById("contragent-note") as HTMLTextAreaElement;
  const dateInput = document.getElementById("contragent-date") as HTMLInputElement;

  if (nameInput) {
    nameInput.value = "";
    autoResizeTextarea(nameInput);
  }
  if (receiverInput) {
    receiverInput.value = "";
    autoResizeTextarea(receiverInput);
  }
  if (noteInput) {
    noteInput.value = "";
    autoResizeTextarea(noteInput);
  }
  if (dateInput) dateInput.value = "";
  updateAllBd(null);
}

// ✅ ФУНКЦІЯ ДЛЯ ВИДАЛЕННЯ КНОПКИ "ЗАПИС АКТУ"
function removeActButton() {
  const actButton = document.querySelector(".contragent-act-record-button");
  if (actButton) {
    actButton.remove();
    console.log("✅ Act button removed");
    
    // ✅ ВИПРАВЛЕННЯ: Повертаємо стандартне вирівнювання для кнопки "Ok"
    const buttonsDiv = document.querySelector(".yes-no-buttons-all_other_bases") as HTMLElement;
    if (buttonsDiv) {
      buttonsDiv.style.justifyContent = "flex-end"; // Вирівнюємо справа
    }
  }
}

// ✅ НАЛАШТУВАННЯ АВТОМАТИЧНОГО ПРИХОВУВАННЯ КНОПКИ
function setupActButtonAutoHide() {
  const otherButtons = document.querySelectorAll('.toggle-button-all_other_bases');
  
  otherButtons.forEach((btn) => {
    const buttonText = btn.textContent?.trim();
    // Приховуємо кнопку при переключенні на будь-який інший розділ
    if (buttonText !== "Контрагент") {
      btn.addEventListener("click", removeActButton);
    }
  });
}

export async function handleDhereloContragent() {
  removeActButton(); // Видаляємо стару кнопку перед створенням форми

  contragentData = await loadContragentData();

  const rightPanel = document.querySelector(".modal-right-all_other_bases") as HTMLDivElement;
  if (!rightPanel) {
    console.error("❌ Не знайдено правої панелі модального вікна");
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
  formContainer.style.cssText = "display: flex; flex-direction: column; gap: 5px; padding: 0;";

  // Створення елементів форми
  const createTextarea = (id: string, label: string, placeholder: string) => {
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.cssText = "font-weight: 500; margin-bottom: 5px; display: block;";

    const textarea = document.createElement("textarea");
    textarea.id = id;
    textarea.className = "textarea-all_other_bases";
    textarea.placeholder = placeholder;
    textarea.autocomplete = "off";
    textarea.rows = 1;
    textarea.style.cssText = `
      resize: none; overflow-y: hidden; min-height: 38px;
      padding-top: 8px; line-height: 1.4; width: 100%; box-sizing: border-box;
    `;
    textarea.addEventListener("input", () => autoResizeTextarea(textarea));

    wrapper.appendChild(labelEl);
    wrapper.appendChild(textarea);
    return { wrapper, textarea };
  };

  // Одержувач (з dropdown)
  const receiverWrapper = document.createElement("div");
  receiverWrapper.style.position = "relative";

  const receiverLabel = document.createElement("label");
  receiverLabel.textContent = "Рахунок Одержувач:";
  receiverLabel.style.cssText = "font-weight: 500; margin-bottom: 5px; display: block;";

  const receiverInput = document.createElement("textarea");
  receiverInput.id = "contragent-receiver";
  receiverInput.className = "textarea-all_other_bases";
  receiverInput.placeholder = "Введіть одержувача...";
  receiverInput.autocomplete = "off";
  receiverInput.rows = 1;
  receiverInput.style.cssText = `
    resize: none; overflow-y: hidden; min-height: 38px;
    padding-top: 8px; line-height: 1.4; width: 100%; box-sizing: border-box;
  `;

  const receiverDropdown = document.createElement("div");
  receiverDropdown.className = "contragent-dropdown hidden-all_other_bases";
  receiverDropdown.style.cssText = `
    position: absolute; top: 100%; left: 0; right: 0; background: white;
    border: 1px solid #ccc; border-radius: 4px; max-height: 200px;
    overflow-y: auto; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;

  receiverWrapper.appendChild(receiverLabel);
  receiverWrapper.appendChild(receiverInput);
  receiverWrapper.appendChild(receiverDropdown);

  // ЗАТВЕРДЖУЮ
  const { wrapper: nameWrapper, textarea: nameInput } = createTextarea(
    "contragent-name",
    "Акт ЗАТВЕРДЖУЮ:",
    "Введіть назву контрагента..."
  );

  // Від Замовника
  const { wrapper: noteWrapper, textarea: noteInput } = createTextarea(
    "contragent-note",
    "Акт Від Замовника:",
    "Введіть примітку..."
  );

  // Дата і кнопка
  const dateAndButtonWrapper = document.createElement("div");
  dateAndButtonWrapper.className = "contragent-date-act-wrapper";

  const dateWrapper = document.createElement("div");
  dateWrapper.className = "contragent-date-wrapper";

  const dateLabel = document.createElement("label");
  dateLabel.textContent = "Дата:";
  dateLabel.className = "contragent-date-label";

  const dateInput = document.createElement("input");
  dateInput.type = "text";
  dateInput.id = "contragent-date";
  dateInput.className = "input-all_other_bases contragent-date-input";
  dateInput.placeholder = "Оберіть дату...";
  dateInput.readOnly = true;

  const calendar = createDatePicker(dateInput);
  dateWrapper.appendChild(dateLabel);
  dateWrapper.appendChild(dateInput);
  dateWrapper.appendChild(calendar);

  // Кнопка запису акту
  const actRecordButton = document.createElement("button");
  actRecordButton.textContent = "🗄️ Запис Акту";
  actRecordButton.className = "contragent-act-record-button";
  actRecordButton.type = "button";
  actRecordButton.addEventListener("click", showActNumberModal);

  dateAndButtonWrapper.appendChild(dateWrapper);

  // Функція заповнення форми
  const fillFormWithContragent = (item: ContragentRecord) => {
    receiverInput.value = item.oderjyvach || "";
    autoResizeTextarea(receiverInput);

    nameInput.value = item.name;
    autoResizeTextarea(nameInput);

    noteInput.value = item.prumitka || "";
    autoResizeTextarea(noteInput);

    dateInput.value = isoToDots(item.data);

    receiverDropdown.classList.add("hidden-all_other_bases");

    updateAllBd(JSON.stringify({
      table: "faktura",
      faktura_id: item.faktura_id,
      name: item.name,
      oderjyvach: item.oderjyvach,
      prumitka: item.prumitka,
      data: item.data,
    }));
  };

  // Оновлення dropdown
  const updateReceiverDropdown = (query: string) => {
    receiverDropdown.innerHTML = "";
    const filtered = contragentData
      .filter(item => item.oderjyvach?.toLowerCase().includes(query))
      .slice(0, 50);

    if (!filtered.length) {
      receiverDropdown.classList.add("hidden-all_other_bases");
      return;
    }

    filtered.forEach(item => {
      const option = document.createElement("div");
      option.className = "contragent-dropdown-item";
      option.style.cssText = `
        padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;
      `;
      option.textContent = item.oderjyvach;
      option.addEventListener("mouseenter", () => option.style.background = "#f0f0f0");
      option.addEventListener("mouseleave", () => option.style.background = "white");
      option.addEventListener("click", () => fillFormWithContragent(item));
      receiverDropdown.appendChild(option);
    });
    receiverDropdown.classList.remove("hidden-all_other_bases");
  };

  // Обробники подій
  receiverInput.addEventListener("input", () => {
    const query = receiverInput.value.toLowerCase().trim();
    autoResizeTextarea(receiverInput);
    updateReceiverDropdown(query);
    if (!query) {
      nameInput.value = "";
      autoResizeTextarea(nameInput);
      noteInput.value = "";
      autoResizeTextarea(noteInput);
      dateInput.value = "";
      updateAllBd(null);
    }
  });

  receiverInput.addEventListener("click", (e) => {
    e.stopPropagation();
    updateReceiverDropdown(receiverInput.value.toLowerCase().trim());
  });

  document.addEventListener("click", (e) => {
    if (!receiverWrapper.contains(e.target as Node)) {
      receiverDropdown.classList.add("hidden-all_other_bases");
    }
  });

  dateInput.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".contragent-calendar").forEach(cal => {
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

  document.addEventListener("click", (e) => {
    if (!dateWrapper.contains(e.target as Node)) {
      calendar.style.display = "none";
    }
  });

  // Додаємо елементи до форми
  formContainer.appendChild(receiverWrapper);
  formContainer.appendChild(nameWrapper);
  formContainer.appendChild(noteWrapper);
  formContainer.appendChild(dateAndButtonWrapper);

  // Додаємо кнопку до контейнера кнопок
  const buttonsDiv = rightPanel.querySelector(".yes-no-buttons-all_other_bases");
  if (buttonsDiv) {
    (buttonsDiv as HTMLElement).style.display = "flex";
    (buttonsDiv as HTMLElement).style.justifyContent = "space-between";
    (buttonsDiv as HTMLElement).style.width = "100%";

    const oldButton = buttonsDiv.querySelector(".contragent-act-record-button");
    if (oldButton) oldButton.remove();

    // Додаємо кнопку "Запис Акту" НА ПОЧАТОК (зліва)
    buttonsDiv.insertBefore(actRecordButton, buttonsDiv.firstChild);
    rightPanel.insertBefore(formContainer, buttonsDiv);
  } else {
    rightPanel.appendChild(formContainer);
  }

  // ✅ Налаштовуємо автоматичне приховування кнопки
  setupActButtonAutoHide();
}

export function clearContragentForm() {
  const form = document.getElementById("contragent-form");
  if (form) form.remove();

  removeActButton();

  document.querySelectorAll(".contragent-calendar").forEach(cal => {
    (cal as HTMLElement).style.display = "none";
  });

  contragentData = [];
  updateAllBd(null);
}

// ====== CRUD ===========================================

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

export async function tryHandleFakturaCrud(): Promise<boolean> {
  const mode = CRUD;
  const payload = readFakturaFormPayload();

  console.log("🔵 tryHandleFakturaCrud called:", { mode, payload });

  try {
    // ========== ДОДАВАННЯ ==========
    if (mode === "Додати") {
      console.log("➕ Processing ADD operation...");

      if (!payload.name) {
        toast("⚠️ Заповніть назву контрагента", "#ff9800");
        return false;
      }

      const nextId = await getNextFakturaId();
      if (nextId == null) {
        toast("❌ Помилка отримання наступного ID", "#f44336");
        return false;
      }

      const ins = { faktura_id: nextId, ...payload };
      console.log("Inserting into faktura:", ins);

      const { error } = await supabase.from("faktura").insert(ins).select();

      if (error) {
        console.error("❌ Помилка додавання в faktura:", error);
        toast(`❌ Помилка додавання: ${error.message}`, "#f44336");
        return false;
      }

      console.log("✅ Successfully added to faktura");
      toast("✅ Контрагента успішно додано", "#4caf50");
      contragentData = await loadContragentData();
      return true;
    }

    // ========== РЕДАГУВАННЯ / ВИДАЛЕННЯ ==========
    const faktura_id = getDraftFakturaId();

    if (!faktura_id) {
      console.error("❌ faktura_id відсутній. all_bd:", all_bd);
      toast("⚠️ Не знайдено faktura_id для операції", "#ff9800");
      return false;
    }

    if (mode === "Редагувати") {
      console.log("✏️ Processing EDIT operation for ID:", faktura_id);

      const { error } = await supabase
        .from("faktura")
        .update(payload)
        .eq("faktura_id", faktura_id)
        .select();

      if (error) {
        console.error("❌ Помилка редагування faktura:", error);
        toast(`❌ Помилка редагування: ${error.message}`, "#f44336");
        return false;
      }

      console.log("✅ Successfully edited faktura");
      toast("✅ Контрагента успішно відредаговано", "#4caf50");
      contragentData = await loadContragentData();
      return true;
    }

    if (mode === "Видалити") {
      console.log("🗑️ Processing DELETE operation for ID:", faktura_id);

      const { error } = await supabase
        .from("faktura")
        .delete()
        .eq("faktura_id", faktura_id);

      if (error) {
        console.error("❌ Помилка видалення faktura:", error);
        toast(`❌ Помилка видалення: ${error.message}`, "#f44336");
        return false;
      }

      console.log("✅ Successfully deleted from faktura");
      toast("✅ Контрагента успішно видалено", "#4caf50");
      contragentData = await loadContragentData();
      return true;
    }

    toast("❌ Невідомий режим CRUD", "#f44336");
    return false;
  } catch (e: any) {
    console.error("❌ Faktura CRUD error:", e);
    toast(e?.message || "❌ Невідома помилка", "#f44336");
    return false;
  }
}