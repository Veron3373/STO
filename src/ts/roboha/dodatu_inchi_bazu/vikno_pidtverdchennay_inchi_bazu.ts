//src\ts\roboha\dodatu_inchi_bazu\vikno_pidtverdchennay_inchi_bazu.ts
import { supabase } from "../../vxid/supabaseClient";
import { all_bd, CRUD } from "./dodatu_inchi_bazu_danux";
import { resetShopState, resetDetailState } from "./inhi/scladMagasunDetal";
import { tryHandleShopsCrud } from "./db_shops_details";
import { tryHandleDetailsCrud } from "./db_shops_details";
import { handleScladCrud } from "./db_sclad";
import { getSlusarAdditionalData } from "./inhi/slusar";

export const savePromptModalId = "save-prompt-modal";

export function createSavePromptModal(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = savePromptModalId;
  overlay.className = "modal-overlay-save";
  overlay.style.display = "none";

  const modal = document.createElement("div");
  modal.className = "modal-content-save";

  modal.innerHTML = `<p>Підтвердіть!!!</p>
    <div class="save-buttons">
      <button id="save-confirm" class="btn-save-confirm">Так</button>
      <button id="save-cancel" class="btn-save-cancel">Ні</button>
    </div>`;

  overlay.appendChild(modal);
  return overlay;
}

export let currentTableName: string = "";

// Очистити інпут і перезавантажити дані
const clearInputAndReloadData = async () => {
  // Очищаємо інпут для пошуку
  const searchInput = document.getElementById(
    "search-input-all_other_bases"
  ) as HTMLInputElement;
  if (searchInput) searchInput.value = "";

  // Очищаємо інпут для пароля слюсаря (якщо існує)
  const passwordInput = document.getElementById(
    "slusar-password"
  ) as HTMLInputElement;
  if (passwordInput) passwordInput.value = "";

  const dropdown = document.getElementById(
    "custom-dropdown-all_other_bases"
  ) as HTMLDivElement;
  if (dropdown) {
    dropdown.innerHTML = "";
    dropdown.classList.add("hidden-all_other_bases");
  }

  if (currentTableName) await loadDatabaseData(currentTableName);
};

export const loadDatabaseData = async (buttonText: string) => {
  currentTableName = buttonText;
};

function getInputValue(): string {
  const inputElement = document.getElementById(
    "search-input-all_other_bases"
  ) as HTMLInputElement;
  return inputElement ? inputElement.value.trim() : "";
}

/* ===================== HELPERS: GENERAL ===================== */

async function getNextId(
  tableName: string,
  idField: string
): Promise<number | null> {
  const { data: rows, error } = await supabase
    .from(tableName)
    .select(idField)
    .order(idField, { ascending: false })
    .limit(1);
  if (error) {
    console.error("Помилка при отриманні максимального ID:", error);
    return null;
  }
  const first = rows?.[0] as Record<string, any>;
  return (first?.[idField] ?? 0) + 1;
}

function normalizeName(s: string) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function shopExistsByName(name: string): Promise<boolean> {
  const { data: rows, error } = await supabase.from("shops").select("data");
  if (error) {
    console.error("Помилка перевірки існування магазину:", error);
    return false;
  }
  const needle = normalizeName(name);
  for (const r of rows ?? []) {
    try {
      const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      const nm = normalizeName(d?.Name ?? "");
      if (nm && nm === needle) return true;
    } catch {}
  }
  return false;
}

async function detailExistsByName(name: string): Promise<boolean> {
  const { data: rows, error } = await supabase.from("details").select("data");
  if (error) {
    console.error("Помилка перевірки існування деталі:", error);
    return false;
  }
  const needle = normalizeName(name);
  for (const r of rows ?? []) {
    const nm = normalizeName(r?.data ?? "");
    if (nm && nm === needle) return true;
  }
  return false;
}

/* ===================== FALLBACK: універсальний CRUD ===================== */
async function performCrudOperation(): Promise<boolean> {
  if (!CRUD) {
    console.error("Відсутня змінна CRUD");
    return false;
  }
  if (!all_bd) {
    console.error("Відсутні дані all_bd");
    return false;
  }

  const inputValue = getInputValue();
  if ((CRUD === "Редагувати" || CRUD === "Додати") && !inputValue) {
    console.error("Відсутнє значення в інпуті для операції:", CRUD);
    return false;
  }

  try {
    const data = JSON.parse(all_bd);
    const tableName = data.table;
    if (!tableName) {
      console.error("Відсутня назва таблиці в all_bd");
      return false;
    }

    if (CRUD === "Редагувати" || CRUD === "Видалити") {
      data.record = { ...data };
    }

    switch (CRUD) {
      case "Редагувати":
        return await handleEdit(tableName, data, inputValue);
      case "Видалити":
        return await handleDelete(tableName, data);
      case "Додати":
        return await handleAdd(tableName, inputValue);
      default:
        console.error("Невідомий CRUD режим:", CRUD);
        return false;
    }
  } catch (error) {
    console.error("Помилка при обробці CRUD операції:", error);
    return false;
  }
}

async function handleEdit(
  tableName: string,
  data: any,
  newValue: string
): Promise<boolean> {
  try {
    if (!data.record) {
      console.error("Немає знайденого запису для редагування");
      return false;
    }

    const idField = Object.keys(data.record).find(
      (key) => key.includes("_id") || key === "id"
    );
    if (!idField) {
      console.error("Не знайдено ID поле для редагування");
      return false;
    }

    const idValue = data.record[idField];
    const { data: currentRecord, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq(idField, idValue)
      .single();

    if (fetchError || !currentRecord) {
      console.error("Помилка при отриманні запису:", fetchError);
      return false;
    }

    let updateData: any = {};

    if (tableName === "slyusars") {
      // Отримуємо додаткові дані для слюсаря
      const additionalData = getSlusarAdditionalData();
      
      console.log("Редагування слюсаря - додаткові дані:", additionalData);

      // Оновлюємо Name, Пароль, Доступ та ПроцентРоботи, зберігаємо решту структури
      let currentData: any;
      try {
        currentData =
          typeof currentRecord.data === "string"
            ? JSON.parse(currentRecord.data)
            : currentRecord.data;
      } catch {
        currentData = {};
      }

      updateData.data = {
        Name: (newValue || "").trim(),
        Опис:
          currentData?.Опис && typeof currentData.Опис === "object"
            ? currentData.Опис
            : {},
        Історія:
          currentData?.Історія && typeof currentData.Історія === "object"
            ? currentData.Історія
            : {},
        ПроцентРоботи: additionalData.percent,
        Пароль: additionalData.password,
        Доступ: additionalData.access,
      };
      
      console.log("Дані для оновлення слюсаря:", updateData.data);
    } else if (
      tableName === "incomes" ||
      tableName === "receivers" ||
      tableName === "shops"
    ) {
      updateData.data = { Name: newValue };
    } else if (["works", "details"].includes(tableName)) {
      updateData.data = newValue;
    } else {
      console.error("Невідома таблиця для редагування:", tableName);
      return false;
    }

    const { error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq(idField, idValue);
    if (error) {
      console.error("Помилка при редагуванні:", error);
      return false;
    }

    console.log(
      `Успішно відредаговано: ${tableName}, ID: ${idValue}, нове значення: "${newValue}"`
    );
    return true;
  } catch (error) {
    console.error("Помилка при редагуванні:", error);
    return false;
  }
}


async function handleDelete(tableName: string, data: any): Promise<boolean> {
  try {
    if (!data.record) {
      console.error("Немає знайденого запису для видалення");
      return false;
    }

    const idField = Object.keys(data.record).find(
      (key) => key.includes("_id") || key === "id"
    );
    if (!idField) {
      console.error("Не знайдено ID поле для видалення");
      return false;
    }

    const idValue = data.record[idField];
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq(idField, idValue);
    if (error) {
      console.error("Помилка при видаленні:", error);
      return false;
    }

    console.log(`Успішно видалено: ${tableName}, ID: ${idValue}`);
    return true;
  } catch (error) {
    console.error("Помилка при видаленні:", error);
    return false;
  }
}

async function slusarExistsByName(name: string): Promise<boolean> {
  const { data: rows, error } = await supabase.from("slyusars").select("data");
  if (error) {
    console.error("Помилка перевірки існування слюсаря:", error);
    return false;
  }
  const needle = normalizeName(name);
  for (const r of rows ?? []) {
    try {
      const d = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      const nm = normalizeName(d?.Name ?? "");
      if (nm && nm === needle) return true;
    } catch {}
  }
  return false;
}

// Змініть функцію handleAdd - додайте перевірку для slyusars:

async function handleAdd(
  tableName: string,
  newValue: string
): Promise<boolean> {
  try {
    const idFieldMap = {
      incomes: "income_id",
      receivers: "receiver_id",
      shops: "shop_id",
      slyusars: "slyusar_id",
      works: "work_id",
      details: "detail_id",
    } as const;

    type TableName = keyof typeof idFieldMap;
    const idField = idFieldMap[tableName as TableName];
    if (!idField) {
      console.error("Невідома таблиця для отримання ID:", tableName);
      return false;
    }

    // Перевірки на дублікати для shops/details/slyusars
    if (tableName === "shops" && (await shopExistsByName(newValue))) {
      console.log("Магазин уже існує (fallback). Пропускаємо створення.");
      return true;
    }
    if (tableName === "details" && (await detailExistsByName(newValue))) {
      console.log("Деталь уже існує (fallback). Пропускаємо створення.");
      return true;
    }
    if (tableName === "slyusars" && (await slusarExistsByName(newValue))) {
      console.log("Слюсар з таким іменем уже існує. Пропускаємо створення.");

      const toast = (message: string, color: string) => {
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
        document.body.appendChild(note);
        setTimeout(() => note.remove(), 3000);
      };

      toast(`⚠️ Слюсар "${newValue}" вже присутній в базі даних`, "#ff9800");
      return true;
    }

    const next = await getNextId(tableName, idField);
    if (next == null) return false;

    let insertData: any = { [idField]: next };

    if (tableName === "slyusars") {
      // Отримуємо додаткові дані для слюсаря
      const additionalData = getSlusarAdditionalData();
      
      console.log("Додавання нового слюсаря - додаткові дані:", additionalData);

      // Створюємо повну структуру для слюсаря
      insertData.data = {
        Name: (newValue || "").trim(),
        Опис: {},
        Історія: {},
        ПроцентРоботи: additionalData.percent,
        Пароль: additionalData.password,
        Доступ: additionalData.access,
      };
      
      console.log("Дані для вставки нового слюсаря:", insertData.data);
    } else if (["incomes", "receivers", "shops"].includes(tableName)) {
      insertData.data = { Name: newValue };
    } else if (["works", "details"].includes(tableName)) {
      insertData.data = newValue;
    } else {
      console.error("Невідома таблиця для додавання:", tableName);
      return false;
    }

    const { error } = await supabase
      .from(tableName)
      .insert(insertData)
      .select();
    if (error) {
      console.error("Помилка при додаванні:", error);
      return false;
    }

    console.log(`✅ Успішно додано: ${tableName}, значення: "${newValue}"`);
    return true;
  } catch (error) {
    console.error("❌ Помилка при додаванні:", error);
    return false;
  }
}

/* ===================== МОДАЛКА ПІДТВЕРДЖЕННЯ ===================== */
export function showSavePromptModal(): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById(savePromptModalId);
    if (!modal) return resolve(false);

    modal.style.display = "flex";

    const confirmBtn = document.getElementById("save-confirm")!;
    const cancelBtn = document.getElementById("save-cancel")!;

    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
    };

    const toast = (message: string, color: string) => {
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
      document.body.appendChild(note);
      setTimeout(() => note.remove(), 1500);
    };

    const closeAllModals = () => {
      document
        .querySelectorAll(".modal-overlay-all_other_bases")
        .forEach((m) => m.classList.add("hidden-all_other_bases"));
    };

    const onConfirm = async () => {
      if (!CRUD) {
        cleanup();
        toast("❌ Помилка: відсутня змінна CRUD", "#f44336");
        resolve(false);
        return;
      }

      console.log("Starting CRUD operations...");
      let success = false;
      let errorMessage = "";

      try {
        // 1) Витягуємо table з чернетки, якщо є
        let tableFromDraft = "";
        try {
          if (all_bd) {
            const parsed = JSON.parse(all_bd);
            tableFromDraft = parsed?.table ?? "";
            console.log("Table from draft:", tableFromDraft);
          }
        } catch (err) {
          console.error("Error parsing all_bd:", err);
        }

        // 2) Отримуємо значення каталожного номера
        const catalogInput = document.getElementById(
          "sclad_detail_catno"
        ) as HTMLInputElement;
        const catalogNumber = catalogInput?.value?.trim() || "";
        console.log("Catalog number:", catalogNumber);

        const results: boolean[] = [];

        // 3) ВИПРАВЛЕНА ЛОГІКА:
        if (CRUD === "Редагувати") {
          console.log("Edit mode: processing operations...");

          if (catalogNumber && tableFromDraft === "sclad") {
            // Каталожний номер заповнений - працюємо ТІЛЬКИ з базою sclad
            console.log(
              "Catalog number present: processing only sclad operations..."
            );
            const scladOk = await handleScladCrud();
            results.push(scladOk);
            console.log("Sclad operation result:", scladOk);
          } else if (!catalogNumber) {
            // Каталожний номер пустий - обробляємо shops та details ТІЛЬКИ
            console.log(
              "Catalog number empty: processing ONLY shops and details..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) {
              results.push(shopsHandled);
              console.log("Shops operation result:", shopsHandled);
            }
            if (detailsHandled !== null) {
              results.push(detailsHandled);
              console.log("Details operation result:", detailsHandled);
            }

            // ❌ НЕ обробляємо sclad якщо каталожний номер пустий
            console.log("Skipping sclad operations - catalog number is empty");
          } else {
            console.log("Unknown edit scenario, using fallback...");
            success = await performCrudOperation();
            cleanup();
            if (success) {
              toast("✅ Операцію виконано успішно", "#4caf50");
              resetShopState();
              resetDetailState();
              await clearInputAndReloadData();
              document.dispatchEvent(
                new CustomEvent("other-base-data-updated")
              );
            } else {
              closeAllModals();
              toast("❌ Помилка при збереженні", "#f44336");
            }
            resolve(success);
            return;
          }
        } else if (CRUD === "Видалити") {
          console.log("Delete mode: checking catalog number...");

          if (!catalogNumber) {
            // Каталожний номер пустий - видаляємо з shops та details ТІЛЬКИ
            console.log(
              "Catalog number empty: deleting ONLY from shops and details..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) results.push(shopsHandled);
            if (detailsHandled !== null) results.push(detailsHandled);

            // ❌ НЕ видаляємо з sclad якщо каталожний номер пустий
            console.log("Skipping sclad deletion - catalog number is empty");
          } else if (catalogNumber && tableFromDraft === "sclad") {
            // Каталожний номер не пустий - видаляємо лише з sclad
            console.log("Catalog number present: deleting only from sclad...");
            const scladOk = await handleScladCrud();
            results.push(scladOk);
          } else {
            console.log("Unknown delete scenario, using fallback...");
            success = await performCrudOperation();
            cleanup();
            if (success) {
              toast("✅ Операцію виконано успішно", "#4caf50");
              resetShopState();
              resetDetailState();
              await clearInputAndReloadData();
              document.dispatchEvent(
                new CustomEvent("other-base-data-updated")
              );
            } else {
              closeAllModals();
              toast("❌ Помилка при збереженні", "#f44336");
            }
            resolve(success);
            return;
          }
        } else if (CRUD === "Додати") {
          console.log("Add mode: processing operations...");

          if (!catalogNumber) {
            // Каталожний номер пустий - обробляємо shops та details ТІЛЬКИ
            console.log(
              "Catalog number empty: adding to shops and details only..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) results.push(shopsHandled);
            if (detailsHandled !== null) results.push(detailsHandled);

            // ❌ НЕ додаємо в sclad якщо каталожний номер пустий
            console.log("Skipping sclad addition - catalog number is empty");
          } else if (catalogNumber && tableFromDraft === "sclad") {
            // Каталожний номер заповнений - працюємо з усіма базами включаючи sclad
            console.log(
              "Catalog number present: adding to all relevant databases..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) results.push(shopsHandled);
            if (detailsHandled !== null) results.push(detailsHandled);

            // Також обробляємо sclad
            console.log("Also handling sclad operations...");
            const scladOk = await handleScladCrud();
            results.push(scladOk);
          } else {
            console.log("Unknown add scenario, using fallback...");
            success = await performCrudOperation();
            cleanup();
            if (success) {
              toast("✅ Операцію виконано успішно", "#4caf50");
              resetShopState();
              resetDetailState();
              await clearInputAndReloadData();
              document.dispatchEvent(
                new CustomEvent("other-base-data-updated")
              );
            } else {
              closeAllModals();
              toast("❌ Помилка при збереженні", "#f44336");
            }
            resolve(success);
            return;
          }
        }

        // 4) Якщо взагалі нічого не робили — fallback
        if (results.length === 0) {
          console.log("No specific handlers matched, using fallback...");
          success = await performCrudOperation();
        } else {
          // Успіх тільки якщо ВСІ операції пройшли успішно
          success = results.every(Boolean);
          console.log("CRUD results summary:", results, "success:", success);

          // Якщо хоча б одна операція провалилась, показуємо детальну інформацію
          if (!success) {
            const failedOps = results
              .map((r, i) => (r ? null : i))
              .filter((i) => i !== null);
            console.warn("Failed operations at indices:", failedOps);
          }
        }
      } catch (err: any) {
        console.error("CRUD operation error:", err);
        errorMessage = err.message || String(err);
        success = false;
      }

      cleanup();

      if (success) {
        toast("✅ Операцію виконано успішно", "#4caf50");
        resetShopState();
        resetDetailState();
        await clearInputAndReloadData();
        document.dispatchEvent(new CustomEvent("other-base-data-updated"));

        // НЕ закриваємо головне модальне вікно - залишаємо його відкритим
        console.log(
          "CRUD operation completed successfully, keeping main modal open"
        );
        resolve(true);
      } else {
        // Закриваємо модальні вікна тільки при помилці
        closeAllModals();
        const message = errorMessage
          ? `❌ Помилка: ${errorMessage}`
          : "❌ Помилка при збереженні";
        toast(message, "#f44336");
        resolve(false);
      }
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

export { clearInputAndReloadData };
