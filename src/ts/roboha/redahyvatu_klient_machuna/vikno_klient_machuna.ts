// src/ts/roboha/redahyvatu_klient_machuna/vikno_klient_machuna.ts
import { supabase } from "../../vxid/supabaseClient";
import "../../../scss/main.scss";
import { loadActsTable } from "../tablucya/tablucya";
import { saveClientAndCarToDatabase } from "./pidtverdutu_sberihannya_PIB_avto";
import autoData from "./auto.json";

import {
  createSavePromptModal,
  showSavePromptModal,
  savePromptModalId,
} from "./pidtverdutu_sberihannya_PIB_avto";
import { setupEnterNavigation } from "./enter_navigation";
import {
  saveModalIdCreate,
  createSaveModalCreate,
  showSaveModalCreate,
} from "./pidtverdutu_sberihannya_zakaz_naryad";

// Функція для форматування телефонного номера
function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("380")) {
    const number = digits.slice(3);
    if (number.length === 0) return "+380";
    if (number.length <= 2) return `+380(${number}`;
    if (number.length <= 5)
      return `+380(${number.slice(0, 2)})${number.slice(2)}`;
    if (number.length <= 7)
      return `+380(${number.slice(0, 2)})${number.slice(2, 5)}-${number.slice(
        5,
      )}`;
    return `+380(${number.slice(0, 2)})${number.slice(2, 5)}-${number.slice(
      5,
      7,
    )}-${number.slice(7, 9)}`;
  }
  if (digits.length === 0) return "+380";
  if (digits.length <= 2) return `+380(${digits}`;
  if (digits.length <= 5)
    return `+380(${digits.slice(0, 2)})${digits.slice(2)}`;
  if (digits.length <= 7)
    return `+380(${digits.slice(0, 2)})${digits.slice(2, 5)}-${digits.slice(
      5,
    )}`;
  return `+380(${digits.slice(0, 2)})${digits.slice(2, 5)}-${digits.slice(
    5,
    7,
  )}-${digits.slice(7, 9)}`;
}

export function getModalFormValues() {
  // Оновлено: тепер підтримує і Input, і Textarea
  const get = (id: string) =>
    (
      document.getElementById(id) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null
    )?.value || "";
  const phoneValue = get(phoneInputId);
  return {
    client_id: selectedClientId,
    cars_id: selectedCarId,
    fullName: get(clientInputId),
    phone: phoneValue,
    carModel: get(carModelInputId),
    carCode: get(carCodeInputId).toUpperCase(),
    carNumber: get(carNumberInputId).toUpperCase(),
    engine: get(carEngineInputId),
    fuel: get(carFuelInputId),
    vin: get(carVinInputId).toUpperCase(),
    income: get(carIncomeInputId),
    extra: get(extraInputId),
    year: get(carYearInputId),
  };
}

export const modalOverlayId = "custom-modal-create-sakaz_narad";
const modalClass = "modal-content-create-sakaz_narad";
const modalCloseBtnId = "close-create-sakaz_narad";
const btnEditId = "btn-edit-create-sakaz_narad";
const clientInputId = "client-input-create-sakaz_narad";
const clientListId = "client-list-create-sakaz_narad";
const carModelInputId = "car-model-create-sakaz_narad";
const carModelListId = "car-model-list-create-sakaz_narad";
const phoneInputId = "phone-create-sakaz_narad";
const phoneListId = "phone-list-create-sakaz_narad";
const carNumberInputId = "car-number-input-create-sakaz_narad";
const carNumberListId = "car-number-list-create-sakaz_narad";
const carEngineInputId = "car-engine-create-sakaz_narad";
const carEngineListId = "car-engine-list-create-sakaz_narad";
const carFuelInputId = "car-fuel-create-sakaz_narad";
const carVinInputId = "car-vin-create-sakaz_narad";
const carVinListId = "car-vin-list-create-sakaz_narad";
const carIncomeInputId = "car-income-create-sakaz_narad";
const extraInputId = "extra-create-sakaz_narad";
const btnSaveId = "btn-save-create-sakaz_narad";
const carYearInputId = "car-year-create-sakaz_narad";
const carCodeInputId = "car-code-create-sakaz_narad";
const carCodeListId = "car-code-list-create-sakaz_narad";
const btnCreateId = "btn-create-create-sakaz_narad";

let selectedClientId: string | null = null;
let selectedCarId: string | null = null;
export function setSelectedIds(cId: string | null, carId: string | null) {
  selectedClientId = cId;
  selectedCarId = carId;
}

export let transferredActComment: string = "";
export function setTransferredActComment(val: string) {
  transferredActComment = val;
}
let currentAutocompletes: { [key: string]: any } = {};
export let userConfirmation: "no" | "yes" | null = null;

let allUniqueData: {
  carModels: string[];
  carCodes: string[];
  phones: string[];
  carNumbers: string[];
  engines: string[];
  vins: string[];
} = {
  carModels: [],
  carCodes: [],
  phones: [],
  carNumbers: [],
  engines: [],
  vins: [],
};

function isLocked(): boolean {
  const editButton = document.getElementById(btnEditId);
  return editButton?.getAttribute("data-unlocked") !== "true";
}

function createModalElement(): HTMLDivElement {
  const modalOverlay = document.createElement("div");
  modalOverlay.id = modalOverlayId;
  modalOverlay.className = "modal-overlay-create-sakaz_narad";
  const modal = document.createElement("div");
  modal.className = modalClass;
  modal.innerHTML = `
    <button id="${modalCloseBtnId}" class="modal-close-create-sakaz_narad">&times;</button>
    <div class="modal-header-create-sakaz_narad">
      <h2>🔍 Картка клієнта</h2>
    </div>
    ${createInputFields()}
    <div class="buttons-create-sakaz_narad">
      <button id="${btnEditId}" class="btn-action-create-sakaz_narad btn-edit" title="Заблокувати інші поля">🔒</button>
      <button id="${btnSaveId}" class="btn-action-create-sakaz_narad btn-save" title="Зберегти">💾</button>    
      <button id="${btnCreateId}" class="btn-action-create-sakaz_narad btn-create" title="Створити">📝</button>
    </div>
  `;
  modalOverlay.appendChild(modal);
  return modalOverlay;
}

function createInputFields(): string {
  // ЗМІНА ТУТ: Замінили input на textarea для clientInputId
  // Додали стилі resize: none, overflow: hidden, rows=1
  return `
    <div class="field-create-sakaz_narad">
      <label for="${clientInputId}">ПІБ</label>
      <textarea id="${clientInputId}" class="input-create-sakaz_narad" placeholder="Введіть ПІБ" autocomplete="off" rows="1" style="resize: none; overflow-y: hidden; min-height: 38px; padding-top: 8px; line-height: 1.4;"></textarea>
      <ul id="${clientListId}" class="suggestions-list-create-sakaz_narad"></ul>
    </div>
    <div class="field-create-sakaz_narad">
      <label for="${phoneInputId}">Номер телефону</label>
      <div class="phone-field-inline">
        <input type="text" id="${phoneInputId}" class="input-create-sakaz_narad" placeholder="+380(XX)XXX-XX-XX" autocomplete="off" />
        <div id="car-confirm-icons" class="car-confirm-icons">
          <button id="confirm-toggle" class="confirm-button yes" title="Підтвердження">✔️</button>
        </div>
      </div>
      <ul id="${phoneListId}" class="suggestions-list-create-sakaz_narad"></ul>
    </div>
    <div class="car-field-inline">
      <div class="field-create-sakaz_narad car-input-group">
        <label for="${carModelInputId}">Автомобіль</label>
        <input type="text" id="${carModelInputId}" class="input-create-sakaz_narad" placeholder="Автомобіль" autocomplete="off" />
        <ul id="${carModelListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad car-code-input-group">
        <label for="${carNumberInputId}">Номер авто</label>
        <input type="text" id="${carNumberInputId}" class="input-create-sakaz_narad" placeholder="Номер авто" autocomplete="off" style="text-transform: uppercase;" />
        <ul id="${carNumberListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad year-input-group">
        <label for="${carYearInputId}">Рік</label>
        <input type="text" id="${carYearInputId}" class="input-create-sakaz_narad" readonly autocomplete="off" />
      </div>
    </div>
    <div class="field-row-create-sakaz_narad">
      <div class="field-create-sakaz_narad">
        <label for="${carEngineInputId}">Обʼєм</label>
        <input type="text" id="${carEngineInputId}" class="input-create-sakaz_narad" readonly autocomplete="off" />
        <ul id="${carEngineListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad car-code-input-group">
        <label for="${carCodeInputId}">Код ДВЗ</label>
        <input type="text" id="${carCodeInputId}" class="input-create-sakaz_narad" readonly style="text-transform: uppercase;" autocomplete="off" />
        <ul id="${carCodeListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad">
        <label for="${carFuelInputId}">Пальне</label>
        <input type="text" id="${carFuelInputId}" class="input-create-sakaz_narad" readonly autocomplete="off" />
      </div>
    </div>
    <div class="field-row-create-sakaz_narad">
      <div class="field-create-sakaz_narad">
        <label for="${carVinInputId}">VIN-код</label>
        <input type="text" id="${carVinInputId}" class="input-create-sakaz_narad" readonly style="text-transform: uppercase;" autocomplete="off" />
        <ul id="${carVinListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad">
        <label for="${carIncomeInputId}">Джерело</label>
        <input type="text" id="${carIncomeInputId}" class="input-create-sakaz_narad" readonly autocomplete="off" />
      </div>
    </div>
    <div class="field-create-sakaz_narad">
      <label for="${extraInputId}">Додатково</label>
      <input type="text" id="${extraInputId}" class="input-create-sakaz_narad" readonly autocomplete="off" />
    </div>
  `;
}

function setupPhoneFormatting(phoneInput: HTMLInputElement) {
  if (!phoneInput.value) {
    phoneInput.value = "+380";
  }
  phoneInput.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    const cursorPosition = target.selectionStart || 0;
    const oldValue = target.value;
    const newValue = formatPhoneNumber(target.value);
    target.value = newValue;
    const lengthDiff = newValue.length - oldValue.length;
    const newCursorPosition = cursorPosition + lengthDiff;
    setTimeout(() => {
      target.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
  });
  phoneInput.addEventListener("focus", () => {
    if (phoneInput.value === "+380") {
      setTimeout(() => {
        phoneInput.setSelectionRange(
          phoneInput.value.length,
          phoneInput.value.length,
        );
      }, 0);
    }
  });
  phoneInput.addEventListener("keydown", (e) => {
    const target = e.target as HTMLInputElement;
    const cursorPosition = target.selectionStart || 0;
    if ((e.key === "Backspace" || e.key === "Delete") && cursorPosition <= 4) {
      e.preventDefault();
      return;
    }
  });
}

// --- ДОПОМІЖНА ФУНКЦІЯ ДЛЯ АВТО-РОЗШИРЕННЯ ---
function autoResizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = element.scrollHeight + "px";
}

// ЗМІНА ТУТ: Додали HTMLTextAreaElement до типу input
function setupAutocomplete(
  input: HTMLInputElement | HTMLTextAreaElement,
  list: HTMLUListElement,
  items: any[],
  labelFn: (i: any) => string,
  onSelect: (i: any) => void,
  showOnFocus: boolean = false,
  key?: string,
  minLength: number = 0,
  customFilter?: (item: any, searchValue: string) => boolean,
) {
  if (key && currentAutocompletes[key]) {
    const oldData = currentAutocompletes[key];
    input.removeEventListener("input", oldData.inputHandler);
    input.removeEventListener("focus", oldData.focusHandler);
    input.removeEventListener("blur", oldData.blurHandler);
  }

  const inputHandler = () => {
    render();
    // Якщо це textarea, викликаємо авто-розширення
    if (input instanceof HTMLTextAreaElement) {
      autoResizeTextarea(input);
    }
  };

  const focusHandler = () => {
    if (showOnFocus) {
      renderAll();
    } else {
      render();
    }
  };
  const blurHandler = () => setTimeout(() => (list.innerHTML = ""), 150);
  input.addEventListener("input", inputHandler);
  input.addEventListener("focus", focusHandler);
  input.addEventListener("blur", blurHandler);
  if (key) {
    currentAutocompletes[key] = {
      inputHandler,
      focusHandler,
      blurHandler,
    };
  }
  function render() {
    list.innerHTML = "";
    const val = input.value.toLowerCase();
    if (val.length < minLength && !showOnFocus) return;

    const filtered = customFilter
      ? items.filter((i) => customFilter(i, val))
      : items.filter((i) => labelFn(i).toLowerCase().includes(val));

    filtered.forEach((i) => {
      const li = document.createElement("li");
      li.textContent = labelFn(i);
      const onSelectHandler = (e: Event) => {
        if (e.type === "mousedown") e.preventDefault();
        input.value = labelFn(i);
        list.innerHTML = "";
        onSelect(i);
        // Якщо вибрали зі списку, оновлюємо висоту
        if (input instanceof HTMLTextAreaElement) {
          autoResizeTextarea(input);
        }
      };
      li.addEventListener("mousedown", onSelectHandler);
      li.addEventListener("click", onSelectHandler);
      list.appendChild(li);
    });
  }
  function renderAll() {
    list.innerHTML = "";
    items.forEach((i) => {
      const li = document.createElement("li");
      li.textContent = labelFn(i);
      const onSelectHandler = (e: Event) => {
        if (e.type === "mousedown") e.preventDefault();
        input.value = labelFn(i);
        list.innerHTML = "";
        onSelect(i);
        // Якщо вибрали зі списку, оновлюємо висоту
        if (input instanceof HTMLTextAreaElement) {
          autoResizeTextarea(input);
        }
      };
      li.addEventListener("mousedown", onSelectHandler);
      li.addEventListener("click", onSelectHandler);
      list.appendChild(li);
    });
  }
}

function setupSimpleAutocomplete(
  input: HTMLInputElement,
  list: HTMLUListElement,
  items: string[],
  onSelect?: (item: string) => void,
  key?: string,
  minLength: number = 0,
) {
  setupAutocomplete(
    input,
    list,
    items,
    (item) => item,
    (item) => {
      if (onSelect) onSelect(item);
    },
    true,
    key,
    minLength,
  );
}

export function fillCarFields(car: any) {
  const carEngine = document.getElementById(
    carEngineInputId,
  ) as HTMLInputElement | null;
  const carFuel = document.getElementById(
    carFuelInputId,
  ) as HTMLInputElement | null;
  const carVin = document.getElementById(
    carVinInputId,
  ) as HTMLInputElement | null;
  const carNumber = document.getElementById(
    carNumberInputId,
  ) as HTMLInputElement | null;
  const carModel = document.getElementById(
    carModelInputId,
  ) as HTMLInputElement | null;
  const carYear = document.getElementById(
    carYearInputId,
  ) as HTMLInputElement | null;
  const carCode = document.getElementById(
    carCodeInputId,
  ) as HTMLInputElement | null;

  if (carEngine) carEngine.value = car["Обʼєм"] || "";
  if (carFuel) carFuel.value = car["Пальне"] || "";
  if (carVin) carVin.value = car["Vincode"] || "";
  if (carNumber) carNumber.value = car["Номер авто"] || "";
  if (carModel) carModel.value = car["Авто"] || "";
  if (carYear) carYear.value = car["Рік"] || "";
  if (carCode) carCode.value = car["КодДВЗ"] || car["Код ДВЗ"] || "";
}

async function fetchClientData(clientId: string) {
  const { data: clientData } = await supabase
    .from("clients")
    .select("data")
    .eq("client_id", clientId)
    .single();
  return clientData?.data || null;
}

export async function fillClientInfo(clientId: string) {
  const clientData = await fetchClientData(clientId);
  if (clientData) {
    // ЗМІНА ТУТ: Приводимо до HTMLTextAreaElement
    const clientInput = document.getElementById(
      clientInputId,
    ) as HTMLTextAreaElement | null;
    if (clientInput) {
      clientInput.value = clientData["ПІБ"] || "";
      // Оновлюємо висоту після завантаження даних
      autoResizeTextarea(clientInput);
    }

    const phoneInput = document.getElementById(
      phoneInputId,
    ) as HTMLInputElement | null;
    const phoneData = clientData["Телефон"] || "";
    if (phoneInput && phoneData) {
      phoneInput.value = formatPhoneNumber(phoneData);
    }

    const extraInput = document.getElementById(
      extraInputId,
    ) as HTMLInputElement | null;
    if (extraInput) extraInput.value = clientData["Додаткові"] || "";

    const carIncomeInput = document.getElementById(
      carIncomeInputId,
    ) as HTMLInputElement | null;
    if (carIncomeInput)
      carIncomeInput.value = clientData["Джерело"] || "Не вказано";

    return clientData;
  }
  return null;
}

async function loadUniqueData() {
  const { data: allCars } = await supabase.from("cars").select("data");
  const { data: allClients } = await supabase.from("clients").select("data");
  if (allCars) {
    const carModels = [
      ...new Set(
        allCars
          .map((car) => car.data?.["Авто"])
          .filter((model) => model && typeof model === "string" && model.trim())
          .map((model) => model.toString().trim()),
      ),
    ].sort();
    const carCodes = [
      ...new Set(
        allCars
          .map((car) => car.data?.["КодДВЗ"])
          .filter((code) => code && typeof code === "string" && code.trim())
          .map((code) => code.toString().trim()),
      ),
    ].sort();
    const carNumbers = [
      ...new Set(
        allCars
          .map((car) => car.data?.["Номер авто"])
          .filter((num) => num && typeof num === "string" && num.trim())
          .map((num) => num.toString().trim()),
      ),
    ].sort();
    const engines = [
      ...new Set(
        allCars
          .map((car) => car.data?.["Обʼєм"])
          .filter((eng) => eng && typeof eng === "string" && eng.trim())
          .map((eng) => eng.toString().trim()),
      ),
    ].sort();
    const vins = [
      ...new Set(
        allCars
          .map((car) => car.data?.["Vincode"])
          .filter((vin) => vin && typeof vin === "string" && vin.trim())
          .map((vin) => vin.toString().trim()),
      ),
    ].sort();
    allUniqueData.carModels = carModels;
    allUniqueData.carCodes = carCodes;
    allUniqueData.carNumbers = carNumbers;
    allUniqueData.engines = engines;
    allUniqueData.vins = vins;
  }
  if (allClients) {
    const phones = [
      ...new Set(
        allClients
          .map((client) => client.data?.["Телефон"])
          .filter(
            (phone): phone is string => typeof phone === "string" && !!phone,
          )
          .flatMap((phone: string) =>
            phone
              .split(/[,;]/)
              .map((p: string) => p.trim())
              .filter((p: string) => p.length > 0),
          )
          .map((phone) => formatPhoneNumber(phone)),
      ),
    ].sort();
    allUniqueData.phones = phones;
  }
}

function formatDisplayText(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function setupEditingAutocompletes() {
  const carModelInput = document.getElementById(
    carModelInputId,
  ) as HTMLInputElement;
  const carModelList = document.getElementById(
    carModelListId,
  ) as HTMLUListElement;
  const carCodeInput = document.getElementById(
    carCodeInputId,
  ) as HTMLInputElement;
  const carCodeList = document.getElementById(
    carCodeListId,
  ) as HTMLUListElement;
  const phoneInput = document.getElementById(phoneInputId) as HTMLInputElement;
  const phoneList = document.getElementById(phoneListId) as HTMLUListElement;
  const carNumberInput = document.getElementById(
    carNumberInputId,
  ) as HTMLInputElement;
  const carNumberList = document.getElementById(
    carNumberListId,
  ) as HTMLUListElement;
  const carEngineInput = document.getElementById(
    carEngineInputId,
  ) as HTMLInputElement;
  const carEngineList = document.getElementById(
    carEngineListId,
  ) as HTMLUListElement;
  const carVinInput = document.getElementById(
    carVinInputId,
  ) as HTMLInputElement;
  const carVinList = document.getElementById(carVinListId) as HTMLUListElement;

  // Дані з auto.json
  const carSuggestionsFromFile = autoData.data.flatMap((mark) =>
    mark.models.map((model) => ({
      mark_id: formatDisplayText(mark.id),
      mark_cyrillic: mark.cyrillic_name || "",
      name: formatDisplayText(model.name),
      model_cyrillic: model.cyrillic_name || "",
      display: `${formatDisplayText(mark.id)} ${formatDisplayText(model.name)}`,
      source: "file", // Позначка що це з файлу
    })),
  );

  // Дані з бази даних cars
  const carSuggestionsFromDB = allUniqueData.carModels.map((model) => ({
    mark_id: "",
    mark_cyrillic: "",
    name: model,
    model_cyrillic: "",
    display: model,
    source: "database", // Позначка що це з БД
  }));

  // Комбінуємо обидва джерела і видаляємо дублі
  const uniqueMap = new Map<string, any>();

  // Спочатку додаємо дані з файлу (вони мають пріоритет)
  carSuggestionsFromFile.forEach((item) => {
    const key = item.display.toLowerCase().trim();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  });

  // Потім додаємо дані з БД (тільки якщо їх ще немає)
  carSuggestionsFromDB.forEach((item) => {
    const key = item.display.toLowerCase().trim();
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, item);
    }
  });

  const combinedCarSuggestions = Array.from(uniqueMap.values());

  const matchesSearch = (item: any, searchValue: string): boolean => {
    const search = searchValue.toLowerCase();
    const englishMatch =
      item.mark_id.toLowerCase().includes(search) ||
      item.name.toLowerCase().includes(search) ||
      item.display.toLowerCase().includes(search);
    const cyrillicMatch =
      item.mark_cyrillic.toLowerCase().includes(search) ||
      item.model_cyrillic.toLowerCase().includes(search);
    return englishMatch || cyrillicMatch;
  };

  setupAutocomplete(
    carModelInput,
    carModelList,
    combinedCarSuggestions,
    (item) => item.display,
    (item) => {
      carModelInput.value = item.display;
    },
    false,
    "carModelEdit",
    2,
    matchesSearch,
  );

  setupSimpleAutocomplete(
    carCodeInput,
    carCodeList,
    allUniqueData.carCodes,
    undefined,
    "carCodeEdit",
  );
  setupSimpleAutocomplete(
    phoneInput,
    phoneList,
    allUniqueData.phones,
    undefined,
    "phoneEdit",
  );
  setupSimpleAutocomplete(
    carNumberInput,
    carNumberList,
    allUniqueData.carNumbers,
    undefined,
    "carNumberEdit",
  );
  setupSimpleAutocomplete(
    carEngineInput,
    carEngineList,
    allUniqueData.engines,
    undefined,
    "carEngineEdit",
  );
  setupSimpleAutocomplete(
    carVinInput,
    carVinList,
    allUniqueData.vins,
    undefined,
    "carVinEdit",
  );

  document.getElementById("car-confirm-icons")!.style.display = "flex";
}

export async function showModalCreateSakazNarad() {
  if (!document.getElementById(savePromptModalId)) {
    document.body.appendChild(createSavePromptModal());
  }
  if (document.getElementById(modalOverlayId)) return;
  const modal = createModalElement();
  document.body.appendChild(modal);
  userConfirmation = "yes";
  const confirmToggle = document.getElementById(
    "confirm-toggle",
  ) as HTMLButtonElement;
  document.getElementById("car-confirm-icons")!.style.display = "none";
  userConfirmation = null;
  if (confirmToggle) {
    const states = [
      { value: null, icon: "🔁", class: "", title: "Очікування підтвердження" },
      { value: "yes", icon: "➕", class: "yes", title: "Підтвердити" },
      { value: "no", icon: "❌", class: "no", title: "Відхилити" },
    ];
    let currentStateIndex = 0;
    const applyState = (index: number) => {
      const state = states[index];
      userConfirmation = state.value as any;
      confirmToggle.textContent = state.icon;
      confirmToggle.className = `confirm-button ${state.class}`;
      confirmToggle.title = state.title;
      if (userConfirmation === null) {
        selectedClientId = null;
        selectedCarId = null;
      }
    };
    applyState(currentStateIndex);
    confirmToggle.addEventListener("click", () => {
      currentStateIndex = (currentStateIndex + 1) % states.length;
      applyState(currentStateIndex);
    });
  }
  await loadUniqueData();
  const btnSave = document.getElementById(btnSaveId)!;
  const modalElement = document.getElementById(modalOverlayId)!;
  const closeBtn = document.getElementById(modalCloseBtnId)!;
  const btnEdit = document.getElementById(btnEditId)!;

  // ЗМІНА ТУТ: Приводимо до HTMLTextAreaElement
  const clientInput = document.getElementById(
    clientInputId,
  ) as HTMLTextAreaElement;

  const clientList = document.getElementById(clientListId) as HTMLUListElement;
  const carNumberInput = document.getElementById(
    carNumberInputId,
  ) as HTMLInputElement;
  const carNumberList = document.getElementById(
    carNumberListId,
  ) as HTMLUListElement;
  const carModelInput = document.getElementById(
    carModelInputId,
  ) as HTMLInputElement;
  const carModelList = document.getElementById(
    carModelListId,
  ) as HTMLUListElement;
  const carIncomeInput = document.getElementById(
    carIncomeInputId,
  ) as HTMLInputElement;
  const phoneInput = document.getElementById(phoneInputId) as HTMLInputElement;
  const phoneList = document.getElementById(phoneListId) as HTMLUListElement;
  const extraInput = document.getElementById(extraInputId) as HTMLInputElement;
  setupPhoneFormatting(phoneInput);

  // Додаємо слухач для clientInput, щоб він розширювався під час ручного введення
  // (хоча setupAutocomplete це теж робить, але для безпеки)
  clientInput.addEventListener("input", () => autoResizeTextarea(clientInput));

  const forceUppercase = (id: string) => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) {
      el.addEventListener("input", () => {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = el.value.toUpperCase();
        if (start !== null && end !== null) {
          el.setSelectionRange(start, end);
        }
      });
    }
  };
  forceUppercase(carNumberInputId);
  forceUppercase(carVinInputId);
  forceUppercase(carCodeInputId);

  // --- НАЛАШТУВАННЯ НАВІГАЦІЇ ENTER-ОМ ---
  const navigationFieldIds = [
    clientInputId, // ПІБ
    phoneInputId, // Номер телефону
    carModelInputId, // Автомобіль
    carNumberInputId, // Номер авто
    carYearInputId, // Рік
    carEngineInputId, // Обʼєм
    carCodeInputId, // Код ДВЗ
    carFuelInputId, // Пальне
    carVinInputId, // VIN-код
    carIncomeInputId, // Джерело
    extraInputId, // Додатково
  ];
  setupEnterNavigation(navigationFieldIds);

  const editableFieldsInitially = [
    clientInput,
    carModelInput,
    carNumberInput,
    phoneInput,
  ];
  editableFieldsInitially.forEach((el) => el.removeAttribute("readonly"));
  btnEdit.addEventListener("click", async () => {
    const isUnlocked = btnEdit.dataset.unlocked === "true";
    btnEdit.dataset.unlocked = (!isUnlocked).toString();
    btnEdit.textContent = isUnlocked ? "🔒" : "🔓";
    btnEdit.title = isUnlocked ? "Розблокувати поля?" : "Заблокувати поля?";
    if (!isUnlocked) {
      btnEdit.style.backgroundColor = "red";
      btnEdit.style.color = "white";
      document.getElementById(carEngineInputId)?.removeAttribute("readonly");
      document.getElementById(carVinInputId)?.removeAttribute("readonly");
      document.getElementById(extraInputId)?.removeAttribute("readonly");
      document.getElementById(carYearInputId)?.removeAttribute("readonly");
      document.getElementById(carCodeInputId)?.removeAttribute("readonly");
      setupEditingAutocompletes();
      const fuelContainer =
        document.getElementById(carFuelInputId)?.parentElement;
      const fuelInput = document.getElementById(carFuelInputId);
      const incomeContainer =
        document.getElementById(carIncomeInputId)?.parentElement;
      const incomeInput = document.getElementById(carIncomeInputId);
      if (!fuelContainer || !fuelInput || !incomeContainer || !incomeInput)
        return;
      if (!(fuelInput instanceof HTMLSelectElement)) {
        const currentFuel = (fuelInput as HTMLInputElement).value;
        const fuelOptions = ["Бензин", "Дизель", "Газ", "Гібрид", "Електро"];
        const fuelSelect = document.createElement("select");
        const defaultOption = document.createElement("option");
        defaultOption.value = "Невказано";
        defaultOption.textContent = "Невказано";
        fuelSelect.id = carFuelInputId;
        fuelSelect.className = "input-create-sakaz_narad";
        fuelOptions.forEach((fuel) => {
          const option = document.createElement("option");
          option.value = fuel;
          option.textContent = fuel;
          fuelSelect.appendChild(option);
        });
        fuelSelect.value = currentFuel;
        fuelContainer.replaceChild(fuelSelect, fuelInput);
      }
      if (!(incomeInput instanceof HTMLSelectElement)) {
        try {
          const { data: incomeRows, error } = await supabase
            .from("incomes")
            .select("data");
          if (error) {
            console.error("❌ Помилка при запиті до income:", error.message);
            return;
          }
          const sources = [
            ...new Set(
              incomeRows
                .map((row: any) => row?.data?.Name)
                .filter(
                  (name: any) => typeof name === "string" && name.trim() !== "",
                ),
            ),
          ];
          const incomeSelect = document.createElement("select");
          incomeSelect.id = carIncomeInputId;
          incomeSelect.className = "input-create-sakaz_narad";
          const defaultOption = document.createElement("option");
          defaultOption.value = "Невказано";
          defaultOption.textContent = "Невказано";
          incomeSelect.appendChild(defaultOption);
          sources.forEach((src) => {
            const option = document.createElement("option");
            option.value = src;
            option.textContent = src;
            incomeSelect.appendChild(option);
          });
          const currentValue = (incomeInput as HTMLInputElement).value.trim();
          if (sources.includes(currentValue)) {
            incomeSelect.value = currentValue;
          }
          incomeContainer.replaceChild(incomeSelect, incomeInput);
        } catch (e) {
          console.error("💥 Виняток при завантаженні джерел:", e);
        }
      }
    } else {
      // Закриваємо замок - повертаємо оригінальний колір
      btnEdit.style.backgroundColor = "";
      btnEdit.style.color = "";
      const confirmIcons = document.getElementById("car-confirm-icons");
      if (confirmIcons) confirmIcons.style.display = "none";
      document
        .getElementById(carEngineInputId)
        ?.setAttribute("readonly", "true");
      document.getElementById(carVinInputId)?.setAttribute("readonly", "true");
      document.getElementById(extraInputId)?.setAttribute("readonly", "true");
      document.getElementById(carYearInputId)?.setAttribute("readonly", "true");
      document.getElementById(carCodeInputId)?.setAttribute("readonly", "true");
      const editKeys = [
        "carModelEdit",
        "phoneEdit",
        "carNumberEdit",
        "carEngineEdit",
        "carVinEdit",
        "carCodeEdit",
      ];
      editKeys.forEach((key) => {
        if (currentAutocompletes[key]) {
          const data = currentAutocompletes[key];
          let inputEl: HTMLInputElement | null = null;
          if (key.includes("carModel")) {
            inputEl = carModelInput;
          } else if (key.includes("phone")) {
            inputEl = phoneInput;
          } else if (key.includes("carNumber")) {
            inputEl = carNumberInput;
          } else if (key.includes("carEngine")) {
            inputEl = document.getElementById(
              carEngineInputId,
            ) as HTMLInputElement;
          } else if (key.includes("carVin")) {
            inputEl = document.getElementById(
              carVinInputId,
            ) as HTMLInputElement;
          } else if (key.includes("carCode")) {
            inputEl = document.getElementById(
              carCodeInputId,
            ) as HTMLInputElement;
          }
          if (inputEl && data) {
            inputEl.removeEventListener("input", data.inputHandler);
            inputEl.removeEventListener("focus", data.focusHandler);
            inputEl.removeEventListener("blur", data.blurHandler);
          }
        }
      });
      currentAutocompletes = {};
      const fuelContainer =
        document.getElementById(carFuelInputId)?.parentElement;
      const fuelInput = document.getElementById(carFuelInputId);
      const incomeContainer =
        document.getElementById(carIncomeInputId)?.parentElement;
      const incomeInput = document.getElementById(carIncomeInputId);
      if (fuelContainer && fuelInput instanceof HTMLSelectElement) {
        const selectedValue = fuelInput.value;
        const newInput = document.createElement("input");
        newInput.id = carFuelInputId;
        newInput.className = "input-create-sakaz_narad";
        newInput.type = "text";
        newInput.readOnly = true;
        newInput.value = selectedValue;
        fuelContainer.replaceChild(newInput, fuelInput);
      }
      if (incomeContainer && incomeInput instanceof HTMLSelectElement) {
        const selectedValue = incomeInput.value;
        const newInput = document.createElement("input");
        newInput.id = carIncomeInputId;
        newInput.className = "input-create-sakaz_narad";
        newInput.type = "text";
        newInput.readOnly = true;
        newInput.value = selectedValue;
        incomeContainer.replaceChild(newInput, incomeInput);
      }
      selectedClientId = null;
      selectedCarId = null;
      userConfirmation = null;
      setupNormalAutocompletes();
    }
  });
  closeBtn.addEventListener("click", () => {
    modalElement.remove();
    setTransferredActComment("");
  });
  let clientOptions: any[] = [];
  let allCarItems: any[] = [];

  const fetchData = async () => {
    await loadUniqueData();
    const { data: allClients } = await supabase
      .from("clients")
      .select("client_id, data");
    clientOptions =
      allClients
        ?.map((c) => ({
          id: c.client_id,
          fullName: c.data?.["ПІБ"] || "",
          phone: c.data?.["Телефон"] || "",
          data: c.data || {},
        }))
        .filter((c) => c.fullName)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)) || [];

    const { data: allCars } = await supabase
      .from("cars")
      .select("cars_id, client_id, data");
    allCarItems =
      allCars
        ?.map((c) => ({
          ...(c.data || {}),
          id: c.cars_id,
          client_id: c.client_id,
        }))
        .filter((c) => c["Номер авто"] || c["Авто"])
        .sort((a, b) =>
          (a["Авто"] || "")
            .toString()
            .localeCompare((b["Авто"] || "").toString()),
        ) || [];
  };

  await fetchData();
  const getCarsForClient = (clientId: string) => {
    return allCarItems.filter((cars) => cars.client_id === clientId);
  };
  const getPhonesForClient = (clientId: string) => {
    const client = clientOptions.find((c) => c.id === clientId);
    if (!client || !client.data || !client.data["Телефон"]) return [];
    const phoneData = client.data["Телефон"];
    if (typeof phoneData !== "string") return [];
    const phones = phoneData
      .split(/[,;]/)
      .map((phone) => phone.trim())
      .filter((phone) => phone);
    return phones.map((phone) => ({
      ...client,
      phone: phone,
      displayPhone: phone,
    }));
  };
  function validateRequiredFields(): boolean {
    const clientName = clientInput.value.trim();
    const carModel = carModelInput.value.trim();
    if (clientName === "" || carModel === "") {
      const missing = [];
      if (clientName === "") missing.push("ПІБ");
      if (carModel === "") missing.push("Автомобіль");
      showLockToggleMessage(
        false,
        `❌ Заповніть поле: ${missing.join(" та ")}`,
      );
      return false;
    }
    return true;
  }
  btnSave.addEventListener("click", async () => {
    const isEditUnlocked = btnEdit.dataset.unlocked === "true";
    if (!isEditUnlocked) {
      showLockToggleMessage(
        false,
        "🔓 Спочатку розблокуйте форму для редагування",
      );
      return;
    }
    if (!validateRequiredFields()) {
      return;
    }
    const confirmed = await showSavePromptModal();
    if (!confirmed) return;
    const result = await saveClientAndCarToDatabase();
    if (result && typeof result === "object") {
      if (result.client_id) selectedClientId = result.client_id;
      if (result.cars_id) selectedCarId = result.cars_id;
    }
    await loadActsTable();
    await fetchData();
    setupNormalAutocompletes();
  });
  const btnCreate = document.getElementById(btnCreateId);
  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      if (!document.getElementById(saveModalIdCreate)) {
        document.body.appendChild(createSaveModalCreate());
      }
      const confirmedCreate = await showSaveModalCreate();
      if (!confirmedCreate) {
      }
    });
  }
  const setupCarAutocompletes = (carItems: any[], selectedCar?: any) => {
    const carNumberItems = selectedCar ? [selectedCar] : carItems;
    setupAutocomplete(
      carNumberInput,
      carNumberList,
      carNumberItems,
      (c) => c["Номер авто"] || "",
      handleCarSelection,
      true,
      "carNumber",
    );
    setupAutocomplete(
      carModelInput,
      carModelList,
      carItems,
      (c) => (c["Авто"] || "").toString().trim(),
      (selectedCarFromModel) => {
        handleCarSelection(selectedCarFromModel);
        setupAutocomplete(
          carNumberInput,
          carNumberList,
          [selectedCarFromModel],
          (c) => c["Номер авто"] || "",
          handleCarSelection,
          true,
          "carNumber",
        );
      },
      true,
      "carModel",
    );
  };
  const setupPhoneAutocomplete = (phoneItems: any[]) => {
    setupAutocomplete(
      phoneInput,
      phoneList,
      phoneItems,
      (c) => c.displayPhone || c.phone || "",
      async (selectedClient) => {
        await fillClientInfo(selectedClient.id);
        selectedClientId = selectedClient.id;
        const clientCars = getCarsForClient(selectedClient.id);
        let selectedCar = null;
        if (clientCars.length > 0) {
          selectedCar = clientCars[0];
          fillCarFields(selectedCar);
          selectedCarId = selectedCar.id;
        }
        setupCarAutocompletes(clientCars, selectedCar);
      },
      true,
      "phone",
    );
  };
  const handleCarSelection = async (car: any) => {
    fillCarFields(car);
    const ownerData = await fetchClientData(car.client_id);
    if (ownerData) {
      clientInput.value = ownerData["ПІБ"] || "";
      autoResizeTextarea(clientInput); // Оновлюємо висоту після вибору авто

      phoneInput.value = ownerData["Телефон"] || "";
      extraInput.value = ownerData["Додаткові"] || "";
      carIncomeInput.value = ownerData["Джерело"] || "";
      if (isLocked()) {
        if (car.id) selectedCarId = car.id;
        if (car.client_id) selectedClientId = car.client_id;
      } else {
      }
      const clientCars = getCarsForClient(car.client_id);
      const clientPhones = getPhonesForClient(car.client_id);
      setupCarAutocompletes(clientCars, car);
      setupPhoneAutocomplete(clientPhones);
    }
  };
  selectedClientId = null;
  selectedCarId = null;
  userConfirmation = null;
  const setupNormalAutocompletes = () => {
    setupAutocomplete(
      clientInput,
      clientList,
      clientOptions,
      (c) => c.fullName || "",
      async (selectedClient) => {
        clearCarAndContactFields();
        const isEditUnlocked = btnEdit.dataset.unlocked === "true";
        if (isEditUnlocked) {
          clientInput.value = selectedClient.fullName;
          autoResizeTextarea(clientInput); // Оновлюємо висоту при виборі клієнта
          return;
        }
        await fillClientInfo(selectedClient.id);
        selectedClientId = selectedClient.id;
        const clientCars = getCarsForClient(selectedClient.id);
        let selectedCar = null;
        if (clientCars.length > 0) {
          selectedCar = clientCars[0];
          fillCarFields(selectedCar);
          if (selectedCar?.id && selectedCar?.client_id) {
            selectedCarId = selectedCar.id;
            selectedClientId = selectedCar.client_id;
          }
        }
        const clientPhones = getPhonesForClient(selectedClient.id);
        setupCarAutocompletes(clientCars, selectedCar);
        setupPhoneAutocomplete(clientPhones);
      },
      true,
      "client",
    );
    setupCarAutocompletes(allCarItems);
    setupPhoneAutocomplete(clientOptions);
  };
  setupNormalAutocompletes();
}

function clearCarAndContactFields() {
  const idsToClear = [
    phoneInputId,
    carNumberInputId,
    carModelInputId,
    carEngineInputId,
    carFuelInputId,
    carVinInputId,
    carIncomeInputId,
    extraInputId,
    carYearInputId,
    carCodeInputId,
  ];
  idsToClear.forEach((id) => {
    const input = document.getElementById(id) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement // Додано
      | null;
    if (
      input instanceof HTMLInputElement ||
      input instanceof HTMLTextAreaElement
    ) {
      input.value = "";
    } else if (input instanceof HTMLSelectElement) {
      input.selectedIndex = 0;
    }
  });
  selectedCarId = null;
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelector('[data-action="openHome"]')
    ?.addEventListener("click", async (e) => {
      // 1. Додано async
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // 2. ДОДАНО ПЕРЕВІРКУ АВТОРИЗАЦІЇ
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        console.warn(
          "⛔ Користувач не авторизований. Модальне вікно 'Наряд' не відкривається.",
        );
        // Тут можна викликати вашу функцію показу помилки, якщо вона не викликається автоматично глобально
        // Але головне - ми не йдемо далі:
        return;
      }

      showModalCreateSakazNarad();
    });
});

export function showLockToggleMessage(
  isUnlocked: boolean,
  customText?: string,
) {
  const note = document.createElement("div");
  note.textContent =
    customText ||
    (isUnlocked
      ? "🔓 Розблоковано для редагування"
      : "🔒 Заблоковано редагування");
  note.style.position = "fixed";
  note.style.left = "50%";
  note.style.bottom = "50%";
  note.style.transform = "translateX(-50%)";
  note.style.backgroundColor = isUnlocked ? "#4caf50" : "#f44336";
  note.style.color = "white";
  note.style.padding = "12px 24px";
  note.style.borderRadius = "8px";
  note.style.zIndex = "10001";
  note.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  note.style.fontSize = "16px";
  document.body.appendChild(note);
  setTimeout(() => {
    note.remove();
  }, 1500);
}
