//src\ts\roboha\redahyvatu_klient_machuna\vikno_klient_machuna.ts
import { supabase } from "../../vxid/supabaseClient";
import "../../../scss/main.scss";
import { loadActsTable } from "../tablucya/tablucya";
import { saveClientAndCarToDatabase } from "./pidtverdutu_sberihannya_PIB_avto";
import autoData from "../zakaz_naraudy/auto.json";

import {
  createSavePromptModal,
  showSavePromptModal,
  savePromptModalId,
} from "./pidtverdutu_sberihannya_PIB_avto";

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
        5
      )}`;
    return `+380(${number.slice(0, 2)})${number.slice(2, 5)}-${number.slice(
      5,
      7
    )}-${number.slice(7, 9)}`;
  }
  if (digits.length === 0) return "+380";
  if (digits.length <= 2) return `+380(${digits}`;
  if (digits.length <= 5)
    return `+380(${digits.slice(0, 2)})${digits.slice(2)}`;
  if (digits.length <= 7)
    return `+380(${digits.slice(0, 2)})${digits.slice(2, 5)}-${digits.slice(
      5
    )}`;
  return `+380(${digits.slice(0, 2)})${digits.slice(2, 5)}-${digits.slice(
    5,
    7
  )}-${digits.slice(7, 9)}`;
}

export function getModalFormValues() {
  const get = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | null)?.value || "";
  const phoneValue = get(phoneInputId);
  return {
    client_id: selectedClientId,
    cars_id: selectedCarId,
    fullName: get(clientInputId),
    phone: phoneValue,
    carModel: get(carModelInputId),
    carCode: get(carCodeInputId),
    carNumber: get(carNumberInputId),
    engine: get(carEngineInputId),
    fuel: get(carFuelInputId),
    vin: get(carVinInputId),
    income: get(carIncomeInputId),
    extra: get(extraInputId),
    year: get(carYearInputId),
  };
}

function resetFormState() {
  selectedClientId = null;
  selectedCarId = null;
  userConfirmation = null;
  const confirmOverlay = document.getElementById(savePromptModalId);
  if (confirmOverlay) confirmOverlay.classList.remove("active");
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
  return `
    <div class="field-create-sakaz_narad">
      <label for="${clientInputId}">ПІБ</label>
      <input type="text" id="${clientInputId}" class="input-create-sakaz_narad" placeholder="Введіть ПІБ" autocomplete="off" />
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
        <input type="text" id="${carModelInputId}" class="input-create-sakaz_narad" placeholder="Автомобіль" />
        <ul id="${carModelListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad car-code-input-group">
        <label for="${carNumberInputId}">Номер авто</label>
        <input type="text" id="${carNumberInputId}" class="input-create-sakaz_narad" placeholder="Номер авто" autocomplete="off" />
        <ul id="${carNumberListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad year-input-group">
        <label for="${carYearInputId}">Рік</label>
        <input type="text" id="${carYearInputId}" class="input-create-sakaz_narad" readonly />
      </div>
    </div>
    <div class="field-row-create-sakaz_narad">
      <div class="field-create-sakaz_narad">
        <label for="${carEngineInputId}">Обʼєм</label>
        <input type="text" id="${carEngineInputId}" class="input-create-sakaz_narad" readonly />
        <ul id="${carEngineListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad car-code-input-group">
        <label for="${carCodeInputId}">Код ДВЗ</label>
        <input type="text" id="${carCodeInputId}" class="input-create-sakaz_narad" readonly />
        <ul id="${carCodeListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad">
        <label for="${carFuelInputId}">Пальне</label>
        <input type="text" id="${carFuelInputId}" class="input-create-sakaz_narad" readonly />
      </div>
    </div>
    <div class="field-row-create-sakaz_narad">
      <div class="field-create-sakaz_narad">
        <label for="${carVinInputId}">VIN-код</label>
        <input type="text" id="${carVinInputId}" class="input-create-sakaz_narad" readonly />
        <ul id="${carVinListId}" class="suggestions-list-create-sakaz_narad"></ul>
      </div>
      <div class="field-create-sakaz_narad">
        <label for="${carIncomeInputId}">Джерело</label>
        <input type="text" id="${carIncomeInputId}" class="input-create-sakaz_narad" readonly />
      </div>
    </div>
    <div class="field-create-sakaz_narad">
      <label for="${extraInputId}">Додатково</label>
      <input type="text" id="${extraInputId}" class="input-create-sakaz_narad" readonly />
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
          phoneInput.value.length
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

function setupAutocomplete(
  input: HTMLInputElement,
  list: HTMLUListElement,
  items: any[],
  labelFn: (i: any) => string,
  onSelect: (i: any) => void,
  showOnFocus: boolean = false,
  key?: string,
  minLength: number = 0
) {
  if (key && currentAutocompletes[key]) {
    const oldData = currentAutocompletes[key];
    input.removeEventListener("input", oldData.inputHandler);
    input.removeEventListener("focus", oldData.focusHandler);
    input.removeEventListener("blur", oldData.blurHandler);
  }
  const inputHandler = () => render();
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
    const filtered = items.filter((i) =>
      labelFn(i).toLowerCase().includes(val)
    );
    filtered.forEach((i) => {
      const li = document.createElement("li");
      li.textContent = labelFn(i);
      li.addEventListener("click", () => {
        input.value = labelFn(i);
        list.innerHTML = "";
        onSelect(i);
      });
      list.appendChild(li);
    });
  }
  function renderAll() {
    list.innerHTML = "";
    items.forEach((i) => {
      const li = document.createElement("li");
      li.textContent = labelFn(i);
      li.addEventListener("click", () => {
        input.value = labelFn(i);
        list.innerHTML = "";
        onSelect(i);
      });
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
  minLength: number = 0
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
    minLength
  );
}

function fillCarFields(car: any) {
  (document.getElementById(carEngineInputId) as HTMLInputElement).value =
    car["Обʼєм"] || "";
  (document.getElementById(carFuelInputId) as HTMLInputElement).value =
    car["Пальне"] || "";
  (document.getElementById(carVinInputId) as HTMLInputElement).value =
    car["Vincode"] || "";
  (document.getElementById(carNumberInputId) as HTMLInputElement).value =
    car["Номер авто"] || "";
  (document.getElementById(carModelInputId) as HTMLInputElement).value =
    car["Авто"] || "";
  (document.getElementById(carYearInputId) as HTMLInputElement).value =
    car["Рік"] || "";
  (document.getElementById(carCodeInputId) as HTMLInputElement).value =
    car["КодДВЗ"] || car["Код ДВЗ"] || "";
}

async function fetchClientData(clientId: string) {
  const { data: clientData } = await supabase
    .from("clients")
    .select("data")
    .eq("client_id", clientId)
    .single();
  return clientData?.data || null;
}

async function fillClientInfo(clientId: string) {
  const clientData = await fetchClientData(clientId);
  if (clientData) {
    (document.getElementById(clientInputId) as HTMLInputElement).value =
      clientData["ПІБ"] || "";
    const phoneInput = document.getElementById(
      phoneInputId
    ) as HTMLInputElement;
    const phoneData = clientData["Телефон"] || "";
    if (phoneData) {
      phoneInput.value = formatPhoneNumber(phoneData);
    }
    (document.getElementById(extraInputId) as HTMLInputElement).value =
      clientData["Додаткові"] || "";
    (document.getElementById(carIncomeInputId) as HTMLInputElement).value =
      clientData["Джерело"] || "Не вказано";
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
          .map((model) => model.toString().trim())
      ),
    ].sort();
    const carCodes = [
      ...new Set(
        allCars
          .map((car) => car.data?.["КодДВЗ"])
          .filter((code) => code && typeof code === "string" && code.trim())
          .map((code) => code.toString().trim())
      ),
    ].sort();
    const carNumbers = [
      ...new Set(
        allCars
          .map((car) => car.data?.["Номер авто"])
          .filter((num) => num && typeof num === "string" && num.trim())
          .map((num) => num.toString().trim())
      ),
    ].sort();
    const engines = [
      ...new Set(
        allCars
          .map((car) => car.data?.["Обʼєм"])
          .filter((eng) => eng && typeof eng === "string" && eng.trim())
          .map((eng) => eng.toString().trim())
      ),
    ].sort();
    const vins = [
      ...new Set(
        allCars
          .map((car) => car.data?.["Vincode"])
          .filter((vin) => vin && typeof vin === "string" && vin.trim())
          .map((vin) => vin.toString().trim())
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
            (phone): phone is string => typeof phone === "string" && !!phone
          )
          .flatMap((phone: string) =>
            phone
              .split(/[,;]/)
              .map((p: string) => p.trim())
              .filter((p: string) => p.length > 0)
          )
          .map((phone) => formatPhoneNumber(phone))
      ),
    ].sort();
    allUniqueData.phones = phones;
  }
}

// Функція для форматування тексту: перша літера велика, решта малі
function formatDisplayText(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function setupEditingAutocompletes() {
  const carModelInput = document.getElementById(
    carModelInputId
  ) as HTMLInputElement;
  const carModelList = document.getElementById(
    carModelListId
  ) as HTMLUListElement;
  const carCodeInput = document.getElementById(
    carCodeInputId
  ) as HTMLInputElement;
  const carCodeList = document.getElementById(
    carCodeListId
  ) as HTMLUListElement;
  const phoneInput = document.getElementById(phoneInputId) as HTMLInputElement;
  const phoneList = document.getElementById(phoneListId) as HTMLUListElement;
  const carNumberInput = document.getElementById(
    carNumberInputId
  ) as HTMLInputElement;
  const carNumberList = document.getElementById(
    carNumberListId
  ) as HTMLUListElement;
  const carEngineInput = document.getElementById(
    carEngineInputId
  ) as HTMLInputElement;
  const carEngineList = document.getElementById(
    carEngineListId
  ) as HTMLUListElement;
  const carVinInput = document.getElementById(
    carVinInputId
  ) as HTMLInputElement;
  const carVinList = document.getElementById(carVinListId) as HTMLUListElement;

  // Підготовка даних з auto.json
  const carSuggestions = autoData.data.flatMap((mark) =>
    mark.models.map((model) => ({
      mark_id: formatDisplayText(mark.id),
      name: formatDisplayText(model.name),
      display: `${formatDisplayText(mark.id)} ${formatDisplayText(model.name)}`,
    }))
  );

  // Налаштування автозаповнення для поля моделі авто з auto.json при розблокованому замку
  setupAutocomplete(
    carModelInput,
    carModelList,
    carSuggestions,
    (item) => item.display,
    (item) => {
      carModelInput.value = item.display;
    },
    false,
    "carModelEdit",
    2 // Показувати після введення 2 символів
  );

  setupSimpleAutocomplete(
    carCodeInput,
    carCodeList,
    allUniqueData.carCodes,
    undefined,
    "carCodeEdit"
  );
  setupSimpleAutocomplete(
    phoneInput,
    phoneList,
    allUniqueData.phones,
    undefined,
    "phoneEdit"
  );
  setupSimpleAutocomplete(
    carNumberInput,
    carNumberList,
    allUniqueData.carNumbers,
    undefined,
    "carNumberEdit"
  );
  setupSimpleAutocomplete(
    carEngineInput,
    carEngineList,
    allUniqueData.engines,
    undefined,
    "carEngineEdit"
  );
  setupSimpleAutocomplete(
    carVinInput,
    carVinList,
    allUniqueData.vins,
    undefined,
    "carVinEdit"
  );

  document.getElementById("car-confirm-icons")!.style.display = "flex";
}

async function showModalCreateSakazNarad() {
  if (!document.getElementById(savePromptModalId)) {
    document.body.appendChild(createSavePromptModal());
  }
  if (document.getElementById(modalOverlayId)) return;
  const modal = createModalElement();
  document.body.appendChild(modal);
  userConfirmation = "yes";
  const confirmToggle = document.getElementById(
    "confirm-toggle"
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
  const clientInput = document.getElementById(
    clientInputId
  ) as HTMLInputElement;
  const clientList = document.getElementById(clientListId) as HTMLUListElement;
  const carNumberInput = document.getElementById(
    carNumberInputId
  ) as HTMLInputElement;
  const carNumberList = document.getElementById(
    carNumberListId
  ) as HTMLUListElement;
  const carModelInput = document.getElementById(
    carModelInputId
  ) as HTMLInputElement;
  const carModelList = document.getElementById(
    carModelListId
  ) as HTMLUListElement;
  const carIncomeInput = document.getElementById(
    carIncomeInputId
  ) as HTMLInputElement;
  const phoneInput = document.getElementById(phoneInputId) as HTMLInputElement;
  const phoneList = document.getElementById(phoneListId) as HTMLUListElement;
  const extraInput = document.getElementById(extraInputId) as HTMLInputElement;
  setupPhoneFormatting(phoneInput);
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
                  (name: any) => typeof name === "string" && name.trim() !== ""
                )
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
              carEngineInputId
            ) as HTMLInputElement;
          } else if (key.includes("carVin")) {
            inputEl = document.getElementById(
              carVinInputId
            ) as HTMLInputElement;
          } else if (key.includes("carCode")) {
            inputEl = document.getElementById(
              carCodeInputId
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
  closeBtn.addEventListener("click", () => modalElement.remove());
  const { data: allClients } = await supabase
    .from("clients")
    .select("client_id, data");
  const clientOptions =
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
  const allCarItems =
    allCars
      ?.map((c) => ({
        ...(c.data || {}),
        id: c.cars_id,
        client_id: c.client_id,
      }))
      .filter((c) => c["Номер авто"] || c["Авто"])
      .sort((a, b) =>
        (a["Авто"] || "").toString().localeCompare((b["Авто"] || "").toString())
      ) || [];
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
      showLockToggleMessage(false, `❌ Заповніть поле: ${missing.join(" та ")}`);
      return false;
    }
    return true;
  }
  btnSave.addEventListener("click", async () => {
    const isEditUnlocked = btnEdit.dataset.unlocked === "true";
    if (!isEditUnlocked) {
      showLockToggleMessage(
        false,
        "🔓 Спочатку розблокуйте форму для редагування"
      );
      return;
    }
    if (!validateRequiredFields()) {
      return;
    }
    const confirmed = await showSavePromptModal();
    if (!confirmed) return;
    await saveClientAndCarToDatabase();
    await loadActsTable();
    document.getElementById(modalOverlayId)?.remove();
    resetFormState();
  });
  const btnCreate = document.getElementById(btnCreateId);
  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      const module = await import("./pidtverdutu_sberihannya_zakaz_naryad");
      const { saveModalIdCreate, createSaveModalCreate, showSaveModalCreate } =
        module;
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
      "carNumber"
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
          "carNumber"
        );
      },
      true,
      "carModel"
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
      "phone"
    );
  };
  const handleCarSelection = async (car: any) => {
    fillCarFields(car);
    const ownerData = await fetchClientData(car.client_id);
    if (ownerData) {
      clientInput.value = ownerData["ПІБ"] || "";
      phoneInput.value = ownerData["Телефон"] || "";
      extraInput.value = ownerData["Додаткові"] || "";
      carIncomeInput.value = ownerData["Джерело"] || "";
      if (isLocked()) {
        if (car.id) selectedCarId = car.id;
        if (car.client_id) selectedClientId = car.client_id;
      } else {
        console.log("🔓 Замок відкритий — ID не збережено");
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
          console.log("🔓 Відкрито: дані не підтягуються автоматично");
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
      "client"
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
      | null;
    if (input instanceof HTMLInputElement) {
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
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      showModalCreateSakazNarad();
    });
});

export function showLockToggleMessage(
  isUnlocked: boolean,
  customText?: string
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