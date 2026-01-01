// src\ts\roboha\dodatu_inchi_bazu\vikno_pidtverdchennay_inchi_bazu.ts
import { supabase } from "../../vxid/supabaseClient";
import { showNotification } from "../zakaz_naraudy/inhi/vspluvauhe_povidomlenna";
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

const clearInputAndReloadData = async () => {
  const searchInput = document.getElementById(
    "search-input-all_other_bases"
  ) as HTMLInputElement;
  if (searchInput) searchInput.value = "";

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

// Перевірка дублів для різних таблиць
async function checkDuplicateExists(
  tableName: string,
  value: string,
  idField?: string,
  currentId?: any
): Promise<boolean> {
  try {
    const { data: rows, error } = await supabase.from(tableName).select("*");
    if (error) {
      console.error(`Помилка перевірки дублів у ${tableName}:`, error);
      return false;
    }

    const needle = normalizeName(value);

    for (const row of rows ?? []) {
      // Якщо це редагування, пропускаємо поточний запис
      if (idField && currentId && row[idField] === currentId) {
        continue;
      }

      // Різна логіка для різних таблиць
      try {
        let nameToCheck = "";

        if (tableName === "shops" || tableName === "faktura") {
          const data =
            typeof row.data === "string" ? JSON.parse(row.data) : row.data;
          nameToCheck = normalizeName(data?.Name ?? "");
        } else if (tableName === "details") {
          nameToCheck = normalizeName(row?.data ?? "");
        } else if (tableName === "slyusars") {
          const data =
            typeof row.data === "string" ? JSON.parse(row.data) : row.data;
          nameToCheck = normalizeName(data?.Name ?? "");
        } else if (tableName === "robota" || tableName === "dherelo") {
          nameToCheck = normalizeName(row?.data ?? "");
        }

        if (nameToCheck && nameToCheck === needle) {
          return true;
        }
      } catch {}
    }
    return false;
  } catch (error) {
    console.error(`Помилка при перевірці дублів у ${tableName}:`, error);
    return false;
  }
}

async function shopExistsByName(name: string): Promise<boolean> {
  return checkDuplicateExists("shops", name);
}

async function detailExistsByName(name: string): Promise<boolean> {
  return checkDuplicateExists("details", name);
}

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
      const additionalData = getSlusarAdditionalData();

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
        ПроцентЗапчастин: additionalData.percentParts,
        Пароль: additionalData.password,
        Доступ: additionalData.access,
      };
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
      return true;
    }

    const next = await getNextId(tableName, idField);
    if (next == null) return false;

    let insertData: any = { [idField]: next };

    if (tableName === "slyusars") {
      const additionalData = getSlusarAdditionalData();

      insertData.data = {
        Name: (newValue || "").trim(),
        Опис: {},
        Історія: {},
        ПроцентРоботи: additionalData.percent,
        ПроцентЗапчастин: additionalData.percentParts,
        Пароль: additionalData.password,
        Доступ: additionalData.access,
      };
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

    const closeAllModals = () => {
      document
        .querySelectorAll(".modal-overlay-all_other_bases")
        .forEach((m) => m.classList.add("hidden-all_other_bases"));
    };

    const onConfirm = async () => {
      if (!CRUD) {
        cleanup();
        showNotification("Помилка: відсутня змінна CRUD", "error");
        resolve(false);
        return;
      }

      console.log("Starting CRUD operations...");
      let success = false;
      let errorMessage = "";

      try {
        // ✅ КРОК 1: Визначаємо таблицю
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

        // ✅ ПЕРЕВІРКА НА ДУБЛІ СПІВРОБІТНИКІВ при додаванні
        if (CRUD === "Додати" && tableFromDraft === "slyusars") {
          const searchInput = document.getElementById(
            "search-input-all_other_bases"
          ) as HTMLInputElement;
          const name = searchInput?.value?.trim();

          if (name) {
            const { checkEmployeeExists } = await import("./inhi/slusar");
            const exists = await checkEmployeeExists(name);
            if (exists) {
              showNotification(
                `Співробітник "${name}" вже існує в базі даних`,
                "warning"
              );
              // Не закриваємо модальне вікно
              return;
            }
          }
        }

        // ✅ КРОК 2: Якщо таблиця невідома, намагаємося визначити з форми
        if (!tableFromDraft) {
          const contragentForm = document.getElementById("contragent-form");
          if (contragentForm) {
            console.log(
              "🔵 Detected contragent form - setting table to 'faktura'"
            );
            tableFromDraft = "faktura";
          }
        }

        const results: boolean[] = [];

        // ==========================================================
        // ✅ ОБРОБКА "FAKTURA" (КОНТРАГЕНТИ) - ПРІОРИТЕТ #1
        // ==========================================================
        if (tableFromDraft === "faktura") {
          const { tryHandleFakturaCrud } = await import("./inhi/contragent");
          const ok = await tryHandleFakturaCrud();
          results.push(ok);

          success = results.every(Boolean);
          cleanup();

          if (success) {
            resetShopState();
            resetDetailState();
            await clearInputAndReloadData();
            document.dispatchEvent(new CustomEvent("other-base-data-updated"));
          } else {
            closeAllModals();
            showNotification("Помилка при збереженні (faktura)", "error");
          }
          resolve(success);
          return;
        }
        // ==========================================================

        const catalogInput = document.getElementById(
          "sclad_detail_catno"
        ) as HTMLInputElement;
        const catalogNumber = catalogInput?.value?.trim() || "";
        console.log("Catalog number:", catalogNumber);

        if (CRUD === "Редагувати") {
          console.log("Edit mode: processing operations...");

          if (catalogNumber && tableFromDraft === "sclad") {
            console.log(
              "Catalog number present: processing only sclad operations..."
            );
            const scladOk = await handleScladCrud();
            results.push(scladOk);
          } else if (!catalogNumber) {
            console.log(
              "Catalog number empty: processing ONLY shops and details..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) results.push(shopsHandled);
            if (detailsHandled !== null) results.push(detailsHandled);

            console.log("Skipping sclad operations - catalog number is empty");
          } else {
            console.log("Unknown edit scenario, using fallback...");
            success = await performCrudOperation();
            cleanup();
            if (success) {
              showNotification("Операцію виконано успішно", "success");
              resetShopState();
              resetDetailState();
              await clearInputAndReloadData();
              document.dispatchEvent(
                new CustomEvent("other-base-data-updated")
              );
            } else {
              closeAllModals();
              showNotification("Помилка при збереженні", "error");
            }
            resolve(success);
            return;
          }
        } else if (CRUD === "Видалити") {
          console.log("Delete mode: checking catalog number...");

          if (!catalogNumber) {
            console.log(
              "Catalog number empty: deleting ONLY from shops and details..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) results.push(shopsHandled);
            if (detailsHandled !== null) results.push(detailsHandled);

            console.log("Skipping sclad deletion - catalog number is empty");
          } else if (catalogNumber && tableFromDraft === "sclad") {
            console.log("Catalog number present: deleting only from sclad...");
            const scladOk = await handleScladCrud();
            results.push(scladOk);
          } else {
            console.log("Unknown delete scenario, using fallback...");
            success = await performCrudOperation();
            cleanup();
            if (success) {
              showNotification("Операцію виконано успішно", "success");
              resetShopState();
              resetDetailState();
              await clearInputAndReloadData();
              document.dispatchEvent(
                new CustomEvent("other-base-data-updated")
              );
            } else {
              closeAllModals();
              showNotification("Помилка при збереженні", "error");
            }
            resolve(success);
            return;
          }
        } else if (CRUD === "Додати") {
          console.log("Add mode: processing operations...");

          if (!catalogNumber) {
            console.log(
              "Catalog number empty: adding to shops and details only..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) results.push(shopsHandled);
            if (detailsHandled !== null) results.push(detailsHandled);

            console.log("Skipping sclad addition - catalog number is empty");
          } else if (catalogNumber && tableFromDraft === "sclad") {
            console.log(
              "Catalog number present: adding to all relevant databases..."
            );

            const shopsHandled = await tryHandleShopsCrud();
            const detailsHandled = await tryHandleDetailsCrud();

            if (shopsHandled !== null) results.push(shopsHandled);
            if (detailsHandled !== null) results.push(detailsHandled);

            console.log("Also handling sclad operations...");
            const scladOk = await handleScladCrud();
            results.push(scladOk);
          } else {
            console.log("Unknown add scenario, using fallback...");
            success = await performCrudOperation();
            cleanup();
            if (success) {
              showNotification("Операцію виконано успішно", "success");
              resetShopState();
              resetDetailState();
              await clearInputAndReloadData();
              document.dispatchEvent(
                new CustomEvent("other-base-data-updated")
              );
            } else {
              closeAllModals();
              showNotification("Помилка при збереженні", "error");
            }
            resolve(success);
            return;
          }
        }

        if (results.length === 0) {
          console.log("No specific handlers matched, using fallback...");
          success = await performCrudOperation();
        } else {
          success = results.every(Boolean);
          console.log("CRUD results summary:", results, "success:", success);

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
        showNotification("Операцію виконано успішно", "success");
        resetShopState();
        resetDetailState();
        await clearInputAndReloadData();
        document.dispatchEvent(new CustomEvent("other-base-data-updated"));

        console.log(
          "CRUD operation completed successfully, keeping main modal open"
        );
        resolve(true);
      } else {
        closeAllModals();
        const message = errorMessage
          ? `Помилка: ${errorMessage}`
          : "Помилка при збереженні";
        showNotification(message, "error");
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
