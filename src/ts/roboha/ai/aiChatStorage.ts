// src/ts/roboha/ai/aiChatStorage.ts
// 💾 Зберігання чатів Атлас: ai_chats + ai_messages + Storage (ai-photos)

import { supabase } from "../../vxid/supabaseClient";

// ============================================================
// ТИПИ
// ============================================================

export interface AiChat {
  chat_id: number;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  favorites: boolean | null;
}

export interface AiMessage {
  message_id: number;
  chat_id: number;
  role: "user" | "assistant";
  text: string;
  images: string[]; // масив публічних URL з Storage
  created_at: string;
}

// ============================================================
// ЧАТИ — CRUD
// ============================================================

/** Завантажити всі чати користувача (останні 50, сортуємо по updated_at) */
export async function loadChats(userId: string): Promise<AiChat[]> {
  const { data, error } = await supabase
    .from("ai_chats")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("loadChats error:", error.message);
    return [];
  }
  return (data as AiChat[]) || [];
}

/** Завантажити ВСІ чати (для адміністратора) */
export async function loadAllChats(): Promise<AiChat[]> {
  const { data, error } = await supabase
    .from("ai_chats")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    return [];
  }
  return (data as AiChat[]) || [];
}

/** Створити новий чат */
export async function createChat(
  userId: string,
  title = "Новий чат",
): Promise<AiChat | null> {
  const { data, error } = await supabase
    .from("ai_chats")
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) {
    console.error("createChat error:", error.message);
    return null;
  }
  return data as AiChat;
}

/** Перейменувати чат */
export async function renameChat(
  chatId: number,
  title: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("ai_chats")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("chat_id", chatId);
  if (error) {
    console.error("renameChat error:", error.message);
    return false;
  }
  return true;
}

/** Перемкнути favorites для чату */
export async function toggleFavorite(
  chatId: number,
  value: boolean,
): Promise<boolean> {
  const { error } = await supabase
    .from("ai_chats")
    .update({ favorites: value })
    .eq("chat_id", chatId);
  if (error) {
    console.error("toggleFavorite error:", error.message);
    return false;
  }
  return true;
}

/** Оновити updated_at чату (викликати при кожному новому повідомленні) */
export async function touchChat(chatId: number): Promise<void> {
  await supabase
    .from("ai_chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("chat_id", chatId);
}

/**
 * Видалити чат разом із повідомленнями і фото зі Storage.
 * Порядок: 1) видалити фото зі Storage, 2) видалити запис (CASCADE видалить messages)
 */
export async function deleteChat(chatId: number): Promise<boolean> {
  try {
    // 1. Отримуємо всі URL фото у повідомленнях цього чату
    const { data: msgs } = await supabase
      .from("ai_messages")
      .select("images")
      .eq("chat_id", chatId);

    const allUrls: string[] = [];
    for (const msg of msgs || []) {
      if (Array.isArray(msg.images)) allUrls.push(...msg.images);
    }

    // 2. Видаляємо файли зі Storage (якщо є)
    if (allUrls.length > 0) {
      const paths = allUrls
        .map((url) => {
          // URL вигляду: .../storage/v1/object/public/ai-photos/123/456_1.jpg
          const match = url.match(/ai-photos\/(.+)$/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];

      if (paths.length > 0) {
        const { error: storageErr } = await supabase.storage
          .from("ai-photos")
          .remove(paths);
        if (storageErr) {
          console.warn("deleteChat storage warn:", storageErr.message);
        }
      }
    }

    // 2b. Додатково: видаляємо ВСЮ папку chatId/ в бакеті (на випадок сирітських файлів)
    try {
      const { data: folderFiles } = await supabase.storage
        .from("ai-photos")
        .list(String(chatId), { limit: 1000 });
      if (folderFiles && folderFiles.length > 0) {
        const folderPaths = folderFiles.map((f) => `${chatId}/${f.name}`);
        await supabase.storage.from("ai-photos").remove(folderPaths);
      }
    } catch {
      // Не критично — основні файли вже видалені вище
    }

    // 3. Видаляємо чат (CASCADE видалить ai_messages автоматично)
    const { error } = await supabase
      .from("ai_chats")
      .delete()
      .eq("chat_id", chatId);
    if (error) {
      console.error("deleteChat error:", error.message);
      return false;
    }
    return true;
  } catch (err: unknown) {
    console.error(
      "deleteChat exception:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// ============================================================
// ПОВІДОМЛЕННЯ
// ============================================================

/** Завантажити всі повідомлення чату (хронологічно) */
export async function loadMessages(chatId: number): Promise<AiMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("loadMessages error:", error.message);
    return [];
  }
  return (data as AiMessage[]) || [];
}

/** Зберегти повідомлення в БД */
export async function saveMessage(
  chatId: number,
  role: "user" | "assistant",
  text: string,
  imageUrls: string[] = [],
): Promise<AiMessage | null> {
  const { data, error } = await supabase
    .from("ai_messages")
    .insert({ chat_id: chatId, role, text, images: imageUrls })
    .select()
    .single();
  if (error) {
    console.error("saveMessage error:", error.message);
    return null;
  }
  // Оновлюємо updated_at чату
  await touchChat(chatId);
  return data as AiMessage;
}

// ============================================================
// STORAGE — ФОТО
// ============================================================

/**
 * Завантажити фото в Supabase Storage.
 * Повертає публічний URL або null при помилці.
 * Шлях: ai-photos/{chatId}/{timestamp}_{rand}_{index}.ext
 */
export async function uploadPhoto(
  chatId: number,
  base64: string,
  mimeType: string,
  index = 0,
): Promise<string | null> {
  try {
    // base64 → Blob
    const byteStr = atob(base64);
    const arr = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/webp": "webp",
    };
    const ext = extMap[mimeType] || "jpg";
    const rand = Math.random().toString(36).slice(2, 8);
    const fileName = `${chatId}/${Date.now()}_${rand}_${index}.${ext}`;
    const blob = new Blob([arr], { type: mimeType });

    const { error } = await supabase.storage
      .from("ai-photos")
      .upload(fileName, blob, { upsert: false, contentType: mimeType });

    if (error) {
      console.error("uploadPhoto error:", error.message);
      return null;
    }

    // Отримуємо публічний URL
    const { data: urlData } = supabase.storage
      .from("ai-photos")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err: unknown) {
    console.error(
      "uploadPhoto exception:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Завантажити масив фото паралельно і повернути масив публічних URL.
 * Передається інтерфейс з base64 + mimeType.
 */
export async function uploadPhotos(
  chatId: number,
  images: Array<{ base64: string; mimeType: string }>,
): Promise<string[]> {
  const results = await Promise.allSettled(
    images.map((img, i) => uploadPhoto(chatId, img.base64, img.mimeType, i)),
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<string | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((url): url is string => url !== null);
}

// ============================================================
// АВТО-ВИДАЛЕННЯ СТАРИХ ЧАТІВ (> 90 днів)
// ============================================================

/**
 * Видалити всі чати старші за 90 днів для конкретного user_id.
 * Включно з фото в Storage.
 */
export async function deleteOldChats(userId: string, days = 90): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { data: oldChats } = await supabase
      .from("ai_chats")
      .select("chat_id")
      .eq("user_id", userId)
      .lt("updated_at", cutoff.toISOString());

    for (const chat of oldChats || []) {
      await deleteChat(chat.chat_id);
    }
  } catch (err: unknown) {
    console.warn(
      "deleteOldChats warn:",
      err instanceof Error ? err.message : err,
    );
  }
}

// ============================================================
// МОНІТОРИНГ DATABASE
// ============================================================

/**
 * Отримати розмір бази даних через RPC-функцію get_db_size.
 * ⚠️ Потрібно створити функцію в Supabase SQL Editor:
 *
 * CREATE OR REPLACE FUNCTION get_db_size()
 * RETURNS bigint
 * LANGUAGE sql
 * SECURITY DEFINER
 * AS $$
 *   SELECT pg_database_size(current_database());
 * $$;
 * GRANT EXECUTE ON FUNCTION get_db_size() TO anon, authenticated;
 *
 * Повертає розмір у МБ.
 */
export async function getDatabaseStats(): Promise<{ sizeMb: number }> {
  try {
    const { data, error } = await supabase.rpc("get_db_size");
    if (error || data === null || data === undefined) {
      console.warn("getDatabaseStats: RPC error or no data", error);
      return { sizeMb: -1 }; // -1 = функція не створена
    }
    // data — bigint (байти)
    const bytes = typeof data === "number" ? data : Number(data);
    return { sizeMb: Math.round((bytes / 1024 / 1024) * 100) / 100 };
  } catch {
    return { sizeMb: -1 };
  }
}

// ============================================================
// МОНІТОРИНГ STORAGE
// ============================================================

/**
 * Підрахувати приблизний розмір всіх файлів у bucket ai-photos.
 * Рекурсивно обходить папки (кожна папка = chatId).
 * Повертає: { totalFiles, totalSizeMb }
 */
export async function getStorageStats(): Promise<{
  totalFiles: number;
  totalSizeMb: number;
}> {
  try {
    // 1. Отримуємо папки (chatId) на верхньому рівні
    const { data: folders } = await supabase.storage
      .from("ai-photos")
      .list("", {
        limit: 1000,
        offset: 0,
      });
    if (!folders || folders.length === 0)
      return { totalFiles: 0, totalSizeMb: 0 };

    let totalFiles = 0;
    let totalBytes = 0;

    // 2. Обходимо кожну папку і рахуємо файли
    const folderNames = folders
      .filter((f) => f.id === null) // папки не мають id
      .map((f) => f.name);

    const fileListResults = await Promise.allSettled(
      folderNames.map((folder) =>
        supabase.storage.from("ai-photos").list(folder, { limit: 1000 }),
      ),
    );

    for (const result of fileListResults) {
      if (result.status === "fulfilled" && result.value.data) {
        for (const file of result.value.data) {
          totalFiles++;
          totalBytes += file.metadata?.size || 0;
        }
      }
    }

    return {
      totalFiles,
      totalSizeMb: Math.round((totalBytes / 1024 / 1024) * 100) / 100,
    };
  } catch {
    return { totalFiles: 0, totalSizeMb: 0 };
  }
}
