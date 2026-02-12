// src\ts\roboha\tablucya\users.ts (ОНОВЛЕНИЙ КОД - ВИПРАВЛЕНО ДУБЛІКАТИ)
import { supabase } from "../../vxid/supabaseClient";
import { redirectToIndex } from "../../utils/gitUtils";

// =============================================================================
// ГЛОБАЛЬНІ ЗМІННІ ТА КОНСТАНТИ
// =============================================================================

export let isAuthenticated = false;
export let userAccessLevel: string | null = null;
export let userName: string | null = null;

const USER_DATA_KEY = "userAuthData";

interface UserData {
  Name: string;
  Доступ: string;
  Пароль: string;
  timestamp: number;
  version: string;
}

// =============================================================================
// LOCAL STORAGE ФУНКЦІЇ
// =============================================================================

function saveUserDataToLocalStorage(
  name: string,
  access: string,
  password: string
): void {
  try {
    const userData: UserData = {
      Name: name,
      Доступ: access,
      Пароль: password,
      timestamp: Date.now(),
      version: "1.0",
    };

    localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
  } catch (error) {
    console.error("❌ Помилка при збереженні в localStorage:", error);
  }
}

function getSavedUserDataFromLocalStorage(): {
  name: string;
  access: string;
  password: string;
} | null {
  try {
    const storedData = localStorage.getItem(USER_DATA_KEY);
    if (!storedData) return null;

    const userData: UserData = JSON.parse(storedData);
    if (!userData.Name || !userData.Доступ || !userData.Пароль) {
      clearSavedUserDataFromLocalStorage();
      return null;
    }

    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - userData.timestamp < thirtyDaysInMs) {
      return {
        name: userData.Name,
        access: userData.Доступ,
        password: userData.Пароль,
      };
    } else {
      clearSavedUserDataFromLocalStorage();
    }
  } catch (error) {
    console.error("❌ Помилка при читанні з localStorage:", error);
    clearSavedUserDataFromLocalStorage();
  }
  return null;
}

function clearSavedUserDataFromLocalStorage(): void {
  try {
    localStorage.removeItem(USER_DATA_KEY);
  } catch (error) {
    console.error("❌ Помилка при видаленні з localStorage:", error);
  }
}

// Експорт необхідних функцій та типів
export {
  saveUserDataToLocalStorage,
  getSavedUserDataFromLocalStorage,
  clearSavedUserDataFromLocalStorage,
  type UserData,
};

// =============================================================================
// СИСТЕМА ПАРОЛІВ ТА АВТЕНТИФІКАЦІЇ
// =============================================================================

function safeParseJSON(data: any): any {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

async function checkPassword(inputPassword: string): Promise<{
  isValid: boolean;
  accessLevel: string | null;
  userName: string | null;
}> {
  try {
    const { data: slyusars, error } = await supabase
      .from("slyusars")
      .select("data");

    // console.log("📦 Supabase response:", { slyusars, error });

    if (error || !slyusars) {
      console.error("❌ Помилка:", error);
      return { isValid: false, accessLevel: null, userName: null };
    }

    // console.log("✅ Отримано записів:", slyusars.length);

    const foundUser = slyusars.find((slyusar) => {
      const slyusarData = safeParseJSON(slyusar.data);
      return slyusarData && String(slyusarData["Пароль"]) === inputPassword;
    });

    if (foundUser) {
      const userData = safeParseJSON(foundUser.data);
      const access = userData?.["Доступ"] || "Адміністратор";
      const name = userData?.["Name"] || userData?.["Ім'я"] || "Користувач";
      return { isValid: true, accessLevel: access, userName: name };
    }

    return { isValid: false, accessLevel: null, userName: null };
  } catch (error) {
    console.error("💥 Критична помилка при перевірці пароля:", error);
    return { isValid: false, accessLevel: null, userName: null };
  }
}

function showError(errorDiv: HTMLElement, message: string): void {
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
}

// =============================================================================
// ДОСТУП ДО НАЛАШТУВАНЬ (GET SETTING VALUE) З КЕШЕМ
// =============================================================================

// Кеш для налаштувань - зберігає результати щоб не робити запити до БД кожен раз
const settingsCache = new Map<string, { value: boolean; timestamp: number }>();
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 хвилин - час життя кешу

/**
 * Очищає кеш налаштувань - потрібно викликати при real-time оновленнях
 */


async function getSettingValue(
  settingId: number,
  roleKey: string
): Promise<boolean> {
  // Перевіряємо кеш
  const cacheKey = `${settingId}:${roleKey}`;
  const cached = settingsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL) {
    return cached.value;
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      .select(roleKey)
      .eq("setting_id", settingId)
      .single();

    if (error) {
      console.error(
        `❌ Помилка при отриманні налаштування (ID:${settingId}, Key:${roleKey}):`,
        error
      );
      return false;
    }

    const value = Boolean((data as { [key: string]: any })?.[roleKey]);
    
    // Зберігаємо в кеш
    settingsCache.set(cacheKey, { value, timestamp: Date.now() });
    
    return value;
  } catch (error) {
    console.error("💥 Критична помилка запиту налаштувань:", error);
    return false;
  }
}

/**
 * Очищує кеш налаштувань (викликати після зміни налаштувань в адмінці)
 */
export function clearSettingsCache(): void {
  settingsCache.clear();
}

// =============================================================================
// НОВІ ФУНКЦІЇ: ПЕРЕВІРКА ДОСТУПУ ДЛЯ ЗАПЧАСТИСТА ТА СКЛАДОВЩИКА
// =============================================================================

/**
 * Перевірка чи може Запчастист бачити всі акти
 * setting_id 12, колонка "Запчастист"
 */
export async function canZapchastystViewAllActs(): Promise<boolean> {
  if (userAccessLevel !== "Запчастист") return true;
  return await getSettingValue(12, "Запчастист");
}

/**
 * Перевірка чи може Складовщик бачити всі акти
 * setting_id 9, колонка "Складовщик"
 */
export async function canSkladovschykViewAllActs(): Promise<boolean> {
  if (userAccessLevel !== "Складовщик") return true;
  return await getSettingValue(9, "Складовщик");
}

/**
 * Перевірка чи може Запчастист відкривати акти для перегляду
 * setting_id 13, колонка "Запчастист"
 */
export async function canZapchastystOpenActs(): Promise<boolean> {
  if (userAccessLevel !== "Запчастист") return true;
  return await getSettingValue(13, "Запчастист");
}

/**
 * Перевірка чи може Складовщик відкривати акти для перегляду
 * setting_id 10, колонка "Складовщик"
 */
export async function canSkladovschykOpenActs(): Promise<boolean> {
  if (userAccessLevel !== "Складовщик") return true;
  return await getSettingValue(10, "Складовщик");
}

/**
 * Універсальна перевірка чи може користувач бачити акти
 */
export async function canUserViewActs(): Promise<boolean> {
  if (userAccessLevel === "Запчастист") {
    return await canZapchastystViewAllActs();
  }
  if (userAccessLevel === "Складовщик") {
    return await canSkladovschykViewAllActs();
  }
  return true; // Інші ролі мають доступ
}

/**
 * Універсальна перевірка чи може користувач відкривати акти
 */
export async function canUserOpenActs(): Promise<boolean> {
  if (userAccessLevel === "Запчастист") {
    return await canZapchastystOpenActs();
  }
  if (userAccessLevel === "Складовщик") {
    return await canSkladovschykOpenActs();
  }
  return true; // Інші ролі мають доступ
}

// =============================================================================
// ОНОВЛЕННЯ ІНТЕРФЕЙСУ (ГОЛОВНА ЛОГІКА)
// =============================================================================

/**
 * Динамічне оновлення інтерфейсу на основі рівня доступу та налаштувань БД
 * Ця функція викликається ТІЛЬКИ ПІСЛЯ успішного входу з main.html
 */
export async function updateUIBasedOnAccess(
  accessLevel: string | null
): Promise<void> {

  const settingsMenuItem = document
    .querySelector('[data-action="openSettings"]')
    ?.closest("li") as HTMLElement | null;
  const addClientMenuItem = document
    .querySelector('[data-action="openClient"]')
    ?.closest("li") as HTMLElement | null;
  const homeMenuItem = document
    .querySelector('[data-action="openHome"]')
    ?.closest("li") as HTMLElement | null;
  const buhhalteriyaMenuItem = document
    .querySelector('[data-action="openBukhhalteriya"]')
    ?.closest("li") as HTMLElement | null;
  // Додано для Планування
  const planuvanyaMenuItem = document
    .querySelector('[data-action="openPlanyvannya"]')
    ?.closest("li") as HTMLElement | null;

  const setVisibility = (element: HTMLElement | null, isVisible: boolean) => {
    if (element) {
      element.style.display = isVisible ? "" : "none";
    }
  };

  if (!accessLevel) {
    setVisibility(settingsMenuItem, false);
    setVisibility(addClientMenuItem, false);
    setVisibility(homeMenuItem, false);
    setVisibility(buhhalteriyaMenuItem, false);
    setVisibility(planuvanyaMenuItem, false);
    return;
  }

  let shouldRenderSettings = true;
  let shouldRenderAdd = true;
  let shouldRenderHome = true;
  let shouldRenderBuhhalteriya = true;
  let shouldRenderPlanuvannya = true;

  // --- Логіка приховування для Слюсар, Запчастист, Складовщик ---
  if (
    accessLevel === "Слюсар" ||
    accessLevel === "Запчастист" ||
    accessLevel === "Складовщик"
  ) {
    shouldRenderSettings = false;
    shouldRenderHome = false;
    shouldRenderPlanuvannya = false; // За замовчуванням приховано
  }

  // --- Перевірки для Приймальника ---
  if (accessLevel === "Приймальник") {
    shouldRenderSettings = await getSettingValue(1, "Приймальник");
    shouldRenderAdd = await getSettingValue(2, "Приймальник");
    shouldRenderBuhhalteriya = await getSettingValue(4, "Приймальник");
    shouldRenderPlanuvannya = await getSettingValue(21, "Приймальник");
  }

  // --- Перевірки для Слюсаря ---
  if (accessLevel === "Слюсар") {
    shouldRenderAdd = false;
    shouldRenderBuhhalteriya = false;
    shouldRenderPlanuvannya = await getSettingValue(6, "Слюсар");
  }

  // --- Перевірки для Запчастиста ---
  if (accessLevel === "Запчастист") {
    shouldRenderAdd = await getSettingValue(1, "Запчастист");
    shouldRenderBuhhalteriya = await getSettingValue(2, "Запчастист");
    shouldRenderPlanuvannya = await getSettingValue(23, "Запчастист");
  }

  // --- Перевірки для Складовщика ---
  if (accessLevel === "Складовщик") {
    shouldRenderAdd = await getSettingValue(1, "Складовщик");
    shouldRenderPlanuvannya = await getSettingValue(20, "Складовщик");
  }

  setVisibility(settingsMenuItem, shouldRenderSettings);
  setVisibility(addClientMenuItem, shouldRenderAdd);
  setVisibility(homeMenuItem, shouldRenderHome);
  setVisibility(buhhalteriyaMenuItem, shouldRenderBuhhalteriya);
  setVisibility(planuvanyaMenuItem, shouldRenderPlanuvannya);
}

// =============================================================================
// ФУНКЦІЇ АВТОВХОДУ ТА ПОКАЗУ МОДАЛЬНОГО ВІКНА
// =============================================================================

export async function attemptAutoLogin(): Promise<{
  accessLevel: string | null;
  userName: string | null;
}> {
  const savedData = getSavedUserDataFromLocalStorage();
  if (!savedData) {
    return { accessLevel: null, userName: null };
  }

  try {
    const {
      isValid,
      accessLevel,
      userName: fetchedUserName,
    } = await checkPassword(savedData.password);

    if (isValid) {
      isAuthenticated = true;
      userAccessLevel = accessLevel;
      userName = fetchedUserName || savedData.name;
      return { accessLevel: userAccessLevel, userName: userName };
    } else {
      clearSavedUserDataFromLocalStorage();
      return { accessLevel: null, userName: null };
    }
  } catch (error) {
    console.error("💥 Помилка при автоматичному вході:", error);
    return { accessLevel: null, userName: null };
  }
}

export function createLoginModal(): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "login-modal_users";
    modal.className = "login-modal";
    modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center;
            align-items: center; z-index: 10000;
        `;

    const modalContent = document.createElement("div");
    modalContent.className = "login-modal-content";
    modalContent.style.cssText = `
            background: white; padding: 40px; border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); text-align: center;
            min-width: 350px; max-width: 90vw;
        `;

    const title = document.createElement("h3");
    title.textContent = "🔐 Вхід в систему";
    title.className = "login-modal-title";
    title.style.cssText = `margin: 0 0 25px 0; color: #333; font-size: 24px;`;

    const input = document.createElement("input");
    input.type = "password";
    input.id = "login-input_users";
    input.placeholder = "Введіть пароль...";
    input.className = "login-input";
    input.style.cssText = `
            width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;
            margin: 15px 0; font-size: 16px; box-sizing: border-box; transition: border-color 0.3s ease;
        `;

    const errorDiv = document.createElement("div");
    errorDiv.id = "login-error";
    errorDiv.style.cssText = `color: #f44336; margin: 10px 0; display: none; font-size: 14px;`;

    const button = document.createElement("button");
    button.id = "login-button_users";
    button.textContent = "Увійти";
    button.className = "login-button";
    button.style.cssText = `
            background: #4CAF50; color: white; border: none; padding: 12px 30px;
            border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 20px;
            transition: background-color 0.3s ease; width: 100%;
        `;

    button.addEventListener(
      "mouseenter",
      () => (button.style.background = "#45a049")
    );
    button.addEventListener(
      "mouseleave",
      () => (button.style.background = "#4CAF50")
    );
    input.addEventListener(
      "focus",
      () => (input.style.borderColor = "#4CAF50")
    );
    input.addEventListener("blur", () => (input.style.borderColor = "#ddd"));

    button.addEventListener("click", async () => {
      const loginValue = input.value.trim();
      if (!loginValue) {
        showError(errorDiv, "❌ Введіть пароль");
        return;
      }

      button.textContent = "Перевірка...";
      button.setAttribute("disabled", "true");
      button.style.background = "#ccc";
      errorDiv.style.display = "none";

      try {
        const {
          isValid,
          accessLevel,
          userName: fetchedUserName,
        } = await checkPassword(loginValue);

        if (isValid) {
          isAuthenticated = true;
          userAccessLevel = accessLevel;
          userName = fetchedUserName;

          if (userName && accessLevel) {
            saveUserDataToLocalStorage(userName, accessLevel, loginValue);
          }

          modal.remove();
          resolve(userAccessLevel);
        } else {
          showError(errorDiv, "❌ Невірний пароль");
          button.textContent = "Увійти";
          button.removeAttribute("disabled");
          button.style.background = "#4CAF50";
          input.focus();
          input.select();
        }
      } catch (error) {
        console.error("💥 Помилка при перевірці пароля:", error);
        showError(errorDiv, "❌ Помилка перевірки пароля");
        button.textContent = "Увійти";
        button.removeAttribute("disabled");
        button.style.background = "#4CAF50";
        resolve(null);
      }
    });

    input.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        button.click();
      }
    });

    const preventEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", preventEscape);

    const originalRemove = modal.remove;
    modal.remove = function () {
      document.removeEventListener("keydown", preventEscape);
      originalRemove.call(this);
    };

    modalContent.appendChild(title);
    modalContent.appendChild(input);
    modalContent.appendChild(errorDiv);
    modalContent.appendChild(button);
    modal.appendChild(modalContent);

    setTimeout(() => input.focus(), 100);
    document.body.appendChild(modal);
  });
}

export async function showLoginModalBeforeTable(): Promise<string | null> {
  // 1. 🔥 ПЕРЕВІРКА ГЛОБАЛЬНОЇ СЕСІЇ (Google)
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.warn("⛔ Немає авторизації Google. Модальне вікно пароля приховано.");
    redirectToIndex();
    return null;
  }

  // 2. Якщо Google-сесія є, перевіряємо чи збережений внутрішній пароль
  const { accessLevel: autoAccessLevel } = await attemptAutoLogin();

  if (autoAccessLevel) {
    return autoAccessLevel;
  }

  // 3. Якщо збереженого пароля немає - ТІЛЬКИ ТОДІ показуємо модалку
  return await createLoginModal();
}

// =============================================================================
// ІНШІ ЕКСПОРТОВАНІ ФУНКЦІЇ
// =============================================================================

export function isUserAuthenticated(): boolean {
  return isAuthenticated;
}

export function logoutFromSystemAndRedirect(): void {
  // Очищаємо всі дані користувача з localStorage
  clearSavedUserDataFromLocalStorage();
  
  // Очищаємо додаткові ключі localStorage
  try {
    localStorage.removeItem("sto_general_settings"); // Загальні налаштування СТО
    localStorage.removeItem("current_act_pruimalnyk"); // Тимчасові дані акту
  } catch (e) {
    console.warn("⚠️ Помилка при очищенні додаткових даних localStorage:", e);
  }
  
  // Очищаємо sessionStorage (прапори сесії)
  try {
    sessionStorage.clear();
  } catch (e) {
    console.warn("⚠️ Помилка при очищенні sessionStorage:", e);
  }
  
  isAuthenticated = false;
  userAccessLevel = null;
  userName = null;
  redirectToIndex();
}

export async function initializeAuthSystem(): Promise<void> {
  // Функція більше не використовується для головної ініціалізації
}

export async function canUserSeeZarplataColumn(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role || role === "Адміністратор") {
    return true;
  }

  switch (role) {
    case "Приймальник":
      return await getSettingValue(14, "Приймальник");
    case "Слюсар":
      return await getSettingValue(1, "Слюсар");
    case "Запчастист":
      return await getSettingValue(14, "Запчастист");
    case "Складовщик":
      return await getSettingValue(11, "Складовщик");
    default:
      return true;
  }
}

async function getSettingBoolFromSettings(
  settingId: number,
  columnName: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select(columnName)
      .eq("setting_id", settingId)
      .single();

    if (error) {
      console.error("Помилка читання settings:", error);
      return true;
    }

    const safeData = data as unknown as Record<string, unknown>;
    const value = safeData?.[columnName];

    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      return v === "true" || v === "1" || v === "yes" || v === "y";
    }

    return true;
  } catch (e) {
    console.error("Виняток при читанні settings:", e);
    return true;
  }
}

/**
 * Чи може поточний користувач бачити колонки "Ціна" та "Сума".
 */
export async function canUserSeePriceColumns(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, показуємо Ціна/Сума по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 15;
      columnName = "Приймальник";
      break;
    case "Слюсар":
      settingId = 2;
      columnName = "Слюсар";
      break;
    case "Запчастист":
      settingId = 15;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 12;
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не обмежуємо Ціна/Сума.`);
      return true;
  }

  if (settingId === null || columnName === null) {
    return true;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може поточний користувач закривати акти (без зауважень).
 * Перевіряє налаштування "📋 Акт Закриття акту 🗝️"
 */
export async function canUserCloseActsNormal(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, не обмежуємо закриття акту.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      // Приймальник завжди може закривати акти без зауважень (немає окремого налаштування)
      return true;
    case "Слюсар":
      // Слюсар не може закривати акти, тільки завершувати роботи
      return false;
    case "Запчастист":
      settingId = 16; // "📋 Акт Зариття акту 🗝️"
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 13; // "📋 Акт Закриття акту 🗝️"
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не обмежуємо закриття акту.`);
      return true;
  }

  if (settingId === null || columnName === null) {
    return true;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може поточний користувач закривати акти ІЗ ЗАУВАЖЕННЯМИ.
 * Перевіряє налаштування "📋 Акт Закриття акту із зауваженнями ⚠️"
 */
export async function canUserCloseActsWithWarnings(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, не обмежуємо закриття акту.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 16; // "📋 Акт Закриття акту із зауваженнями ⚠️"
      columnName = "Приймальник";
      break;
    case "Слюсар":
      // Слюсар не може закривати акти із зауваженнями
      return false;
    case "Запчастист":
      settingId = 17; // "📋 Акт Закриття акту із зауваженнями ⚠️"
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 14; // "📋 Акт Закриття акту із зауваженнями ⚠️"
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не обмежуємо закриття акту.`);
      return true;
  }

  if (settingId === null || columnName === null) {
    return true;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може поточний користувач відкривати закриті акти.
 */
export async function canUserOpenClosedActs(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, показуємо доступ до відкриття актів по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 17;
      columnName = "Приймальник";
      break;
    case "Слюсар":
      settingId = 5;
      columnName = "Слюсар";
      break;
    case "Запчастист":
      settingId = 18;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 15;
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не обмежуємо відкриття актів.`);
      return true;
  }

  if (settingId === null || columnName === null) {
    return true;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може поточний користувач додавати рядки до акту.
 */
export async function canUserAddRowToAct(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, дозволяємо додавання рядків по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор" || role === "Приймальник" || role === "Слюсар") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Запчастист":
      settingId = 22;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 19;
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", дозволяємо додавання рядків.`);
      return true;
  }

  if (settingId === null || columnName === null) {
    return true;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може поточний користувач бачити кнопку "Співробітники".
 */
export async function canUserSeeEmployeeButton(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, показуємо кнопку Співробітники по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 3;
      columnName = "Приймальник";
      break;
    case "Складовщик":
      settingId = 2;
      columnName = "Складовщик";
      break;
    default:
      return true;
  }

  if (settingId === null || columnName === null) {
    return true;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може користувач бачити кнопку "Склад" (Магазин).
 */
export async function canUserSeeSkladButton(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) return false;

  if (role === "Адміністратор" || role === "Складовщик") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 5;
      columnName = "Приймальник";
      break;
    case "Запчастист":
      settingId = 6;
      columnName = "Запчастист";
      break;
    default:
      return false;
  }

  if (settingId !== null && columnName !== null) {
    return await getSettingBoolFromSettings(settingId, columnName);
  }

  return false;
}

/**
 * Перевірка чи може користувач бачити кнопку "Деталі".
 */
export async function canUserSeeDetailsButton(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) return false;

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 13;
      columnName = "Приймальник";
      break;
    case "Запчастист":
      settingId = 11;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 8;
      columnName = "Складовщик";
      break;
    default:
      return false;
  }

  if (settingId !== null && columnName !== null) {
    return await getSettingBoolFromSettings(settingId, columnName);
  }

  return false;
}

// =============================================================================
// ПЕРЕВІРКА ПРАВ ДОСТУПУ ДЛЯ КНОПОК СКЛАДУ (МАГАЗИНУ)
// =============================================================================

/**
 * Перевірка чи може користувач розраховувати товари в складі/магазині.
 */
export async function canUserPayMagazine(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, дозволяємо розрахунок по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 6;
      columnName = "Приймальник";
      break;
    case "Запчастист":
      settingId = 7;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 4;
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не дозволяємо розрахунок.`);
      return false;
  }

  if (settingId === null || columnName === null) {
    return false;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може користувач відміняти розрахунок товарів в складі/магазині.
 */
export async function canUserUnpayMagazine(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, дозволяємо відміну розрахунку по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 7;
      columnName = "Приймальник";
      break;
    case "Запчастист":
      settingId = 8;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 5;
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не дозволяємо відміну розрахунку.`);
      return false;
  }

  if (settingId === null || columnName === null) {
    return false;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може користувач повертати товари в магазин.
 */
export async function canUserReturnMagazine(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, дозволяємо повернення по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 8;
      columnName = "Приймальник";
      break;
    case "Запчастист":
      settingId = 9;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 6;
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не дозволяємо повернення.`);
      return false;
  }

  if (settingId === null || columnName === null) {
    return false;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}

/**
 * Перевірка чи може користувач відміняти повернення товарів в магазин.
 */
export async function canUserCancelReturnMagazine(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, дозволяємо відміну повернення по замовчуванню.");
    return true;
  }

  if (role === "Адміністратор") {
    return true;
  }

  let settingId: number | null = null;
  let columnName: string | null = null;

  switch (role) {
    case "Приймальник":
      settingId = 9;
      columnName = "Приймальник";
      break;
    case "Запчастист":
      settingId = 10;
      columnName = "Запчастист";
      break;
    case "Складовщик":
      settingId = 7;
      columnName = "Складовщик";
      break;
    default:
      console.warn(`Невідома роль "${role}", не дозволяємо відміну повернення.`);
      return false;
  }

  if (settingId === null || columnName === null) {
    return false;
  }

  return await getSettingBoolFromSettings(settingId, columnName);
}
/**
 * Перевірка чи може Слюсар завершувати роботи (встановлювати slusarsOn).
 * setting_id = 3, колонка "Слюсар"
 */
export async function canSlusarCompleteTasks(): Promise<boolean> {
  const role = userAccessLevel;

  if (!role) {
    console.warn("userAccessLevel порожній, блокуємо завершення робіт.");
    return false;
  }

  if (role !== "Слюсар") {
    return false; // Тільки для Слюсаря
  }

  return await getSettingBoolFromSettings(3, "Слюсар");
}
