// src\ts\roboha\dodatu_inchi_bazu\db_shops_details.ts
import { supabase } from "../../vxid/supabaseClient";
import { CRUD } from "./dodatu_inchi_bazu_danux";
import { shopEditState, detailEditState } from "./inhi/scladMagasunDetal";

/* ===================== HELPERS: GENERAL ===================== */

// Простий toast
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
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 2000);
}

// YYYY-MM-DD у часовому поясі Києва
function todayKyivYYYYMMDD(): string {
  const nowKyiv = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv" })
  );
  const yyyy = nowKyiv.getFullYear();
  const mm = String(nowKyiv.getMonth() + 1).padStart(2, "0");
  const dd = String(nowKyiv.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

/* ===================== SHOPS ===================== */

// Перевірка дубліката магазину за назвою
async function shopExistsByName(name: string): Promise<boolean> {
  // Спроба серверного фільтра по jsonb ->> 'Name' (працює у Supabase)
  // Якщо ваш ранній PostgREST не підтримує такий синтаксис — нижче є fallback.
  try {
    const { data, error } = await supabase
      .from("shops")
      .select("shop_id")
      .ilike("data->>Name", normalizeName(name)); // порівняння без регістру

    if (!error && (data?.length ?? 0) > 0) return true;
  } catch {
    // ігноруємо, впадемо на клієнтський fallback
  }

  // Fallback: тягнемо data і порівнюємо локально
  const { data: rows, error } = await supabase.from("shops").select("data");
  if (error) {
    console.error("Помилка перевірки існування магазину:", error);
    return false;
  }
  const needle = normalizeName(name);
  for (const r of rows ?? []) {
    try {
      const d =
        typeof (r as any).data === "string"
          ? JSON.parse((r as any).data)
          : (r as any).data;
      const nm = normalizeName(d?.Name ?? "");
      if (nm && nm === needle) return true;
    } catch {
      // пропускаємо биті JSON
    }
  }
  return false;
}

// Оновлення лише імені, не ламаємо структуру і не перетворюємо на рядок
async function updateShopNameById(
  shop_id: number,
  newName: string
): Promise<boolean> {
  try {
    console.log(`Оновлення магазину ID=${shop_id}, нове ім'я="${newName}"`);

    const { data: rec, error: fe } = await supabase
      .from("shops")
      .select("data")
      .eq("shop_id", shop_id)
      .single();

    if (fe || !rec) {
      console.error("Не вдалося отримати запис магазину:", fe);
      return false;
    }

    let json: any;
    try {
      json =
        typeof (rec as any).data === "string"
          ? JSON.parse((rec as any).data)
          : (rec as any).data;
    } catch {
      json = {};
    }

    const out = {
      ...json,
      Name: newName,
      Склад: json?.["Склад"] ?? {},
      Історія: json?.["Історія"] ?? {},
      "Про магазин": json?.["Про магазин"] ?? "",
    };

    const { error: ue } = await supabase
      .from("shops")
      .update({ data: out }) // ВАЖЛИВО: об'єкт, не рядок
      .eq("shop_id", shop_id);

    if (ue) {
      console.error("Помилка при оновленні магазину:", ue);
      return false;
    }

    console.log("Магазин успішно оновлено");
    showToast("✅ Магазин успішно відредаговано", "#4caf50");
    return true;
  } catch (error) {
    console.error("Помилка в updateShopNameById:", error);
    return false;
  }
}

async function deleteShopById(shop_id: number): Promise<boolean> {
  try {
    console.log(`Видалення магазину ID=${shop_id}`);

    const { error } = await supabase
      .from("shops")
      .delete()
      .eq("shop_id", shop_id);

    if (error) {
      console.error("Помилка при видаленні магазину:", error);
      return false;
    }

    console.log("Магазин успішно видалено");
    showToast("✅ Магазин успішно видалено", "#4caf50");
    return true;
  } catch (error) {
    console.error("Помилка в deleteShopById:", error);
    return false;
  }
}

// Додавання магазину — формуємо правильний JSON-об’єкт
async function addShopWithName(newName: string): Promise<boolean> {
  try {
    console.log(`Додавання нового магазину: "${newName}"`);

    if (await shopExistsByName(newName)) {
      console.log("Магазин уже існує. Пропускаємо створення.");
      showToast("ℹ️ Магазин уже існує", "#2196F3");
      return true;
    }

    const idField = "shop_id";
    const next = await getNextId("shops", idField);
    if (next == null) return false;

    const today = todayKyivYYYYMMDD();

    const payload = {
      [idField]: next,
      // ПИШЕМО У json/jsonb КОЛОНКУ ЯК ОБ'ЄКТ — НЕ stringify!
      data: {
        Name: newName,
        Склад: {},
        Історія: { [today]: [] },
        "Про магазин": "",
      },
    };

    const { error } = await supabase.from("shops").insert(payload).select();
    if (error) {
      console.error("Помилка при додаванні магазину:", error);
      return false;
    }

    console.log("Магазин успішно додано");
    showToast("✅ Магазин успішно додано", "#4caf50");
    return true;
  } catch (error) {
    console.error("Помилка в addShopWithName:", error);
    return false;
  }
}

/**
 * Обробка CRUD операцій для магазинів
 */
export async function tryHandleShopsCrud(): Promise<boolean | null> {
  if (!shopEditState.touched) {
    console.log("Shop state not touched, skipping");
    return null;
  }

  console.log("Handling shops CRUD:", {
    mode: CRUD,
    shopEditState,
  });

  const mode = CRUD;
  const currentName = (shopEditState.currentName ?? "").trim();
  const originalName = (shopEditState.originalName ?? "").trim();
  const baseShopId = shopEditState.baseShopId;

  if (mode === "Редагувати") {
    if (!baseShopId) {
      console.error("Відсутній baseShopId для редагування магазину");
      return false;
    }
    if (!currentName) {
      console.error("Відсутнє нове ім'я магазину");
      return false;
    }
    if (originalName && originalName === currentName) {
      console.log("Ім'я магазину не змінилось");
      showToast("ℹ️ Ім'я магазину не змінилось", "#2196F3");
      return true;
    }
    return await updateShopNameById(baseShopId, currentName);
  }

  if (mode === "Видалити") {
    if (!baseShopId) {
      console.error("Відсутній baseShopId для видалення магазину");
      return false;
    }
    return await deleteShopById(baseShopId);
  }

  if (mode === "Додати") {
    if (!currentName) {
      console.error("Відсутнє ім'я для нового магазину");
      return false;
    }
    return await addShopWithName(currentName);
  }

  console.error("Невідомий CRUD режим для магазинів:", mode);
  return false;
}

/* ===================== DETAILS ===================== */

async function updateDetailById(
  detail_id: number,
  newName: string
): Promise<boolean> {
  try {
    console.log(`Оновлення деталі ID=${detail_id}, нове ім'я="${newName}"`);

    const { error } = await supabase
      .from("details")
      .update({ data: newName }) // у вас details.data — plain text
      .eq("detail_id", detail_id);

    if (error) {
      console.error("Помилка при оновленні деталі:", error);
      return false;
    }

    console.log("Деталь успішно оновлено");
    showToast("✅ Деталь успішно відредаговано", "#4caf50");
    return true;
  } catch (error) {
    console.error("Помилка в updateDetailById:", error);
    return false;
  }
}

async function deleteDetailById(detail_id: number): Promise<boolean> {
  try {
    console.log(`Видалення деталі ID=${detail_id}`);

    const { error } = await supabase
      .from("details")
      .delete()
      .eq("detail_id", detail_id);

    if (error) {
      console.error("Помилка при видаленні деталі:", error);
      return false;
    }

    console.log("Деталь успішно видалено");
    showToast("✅ Деталь успішно видалено", "#4caf50");
    return true;
  } catch (error) {
    console.error("Помилка в deleteDetailById:", error);
    return false;
  }
}

async function detailExistsByName(name: string): Promise<boolean> {
  const { data: rows, error } = await supabase.from("details").select("data");
  if (error) {
    console.error("Помилка перевірки існування деталі:", error);
    return false;
  }
  const needle = normalizeName(name);
  for (const r of rows ?? []) {
    const nm = normalizeName((r as any)?.data ?? "");
    if (nm && nm === needle) return true;
  }
  return false;
}

async function addDetailWithName(newName: string): Promise<boolean> {
  try {
    console.log(`Додавання нової деталі: "${newName}"`);

    if (await detailExistsByName(newName)) {
      console.log("Деталь уже існує. Пропускаємо створення.");
      showToast("ℹ️ Деталь уже існує", "#2196F3");
      return true;
    }

    const idField = "detail_id";
    const next = await getNextId("details", idField);
    if (next == null) return false;

    const payload = {
      [idField]: next,
      data: newName, // plain text, не JSON
    };

    const { error } = await supabase.from("details").insert(payload).select();

    if (error) {
      console.error("Помилка при додаванні деталі:", error);
      return false;
    }

    console.log("Деталь успішно додано");
    showToast("✅ Деталь успішно додано", "#4caf50");
    return true;
  } catch (error) {
    console.error("Помилка в addDetailWithName:", error);
    return false;
  }
}

/**
 * Обробка CRUD операцій для деталей
 */
export async function tryHandleDetailsCrud(): Promise<boolean | null> {
  if (!detailEditState.touched) {
    console.log("Detail state not touched, skipping");
    return null;
  }

  console.log("Handling details CRUD:", {
    mode: CRUD,
    detailEditState,
  });

  const mode = CRUD;
  const currentName = (detailEditState.currentName ?? "").trim();
  const originalName = (detailEditState.originalName ?? "").trim();
  const baseDetailId = detailEditState.baseDetailId;

  if (mode === "Редагувати") {
    if (!baseDetailId) {
      console.error("Відсутній baseDetailId для редагування деталі");
      return false;
    }
    if (!currentName) {
      console.error("Відсутнє нове ім'я деталі");
      return false;
    }
    if (originalName && originalName === currentName) {
      console.log("Ім'я деталі не змінилось");
      showToast("ℹ️ Ім'я деталі не змінилось", "#2196F3");
      return true;
    }
    return await updateDetailById(baseDetailId, currentName);
  }

  if (mode === "Видалити") {
    if (!baseDetailId) {
      console.error("Відсутній baseDetailId для видалення деталі");
      return false;
    }
    return await deleteDetailById(baseDetailId);
  }

  if (mode === "Додати") {
    if (!currentName) {
      console.error("Відсутнє ім'я для нової деталі");
      return false;
    }
    return await addDetailWithName(currentName);
  }

  console.error("Невідомий CRUD режим для деталей:", mode);
  return false;
}
