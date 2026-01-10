// src/ts/utils/gitUtils.ts
// 🔧 УТИЛІТИ для роботи з гітом

import { supabase } from "../vxid/supabaseClient";

const CACHE_KEY = "gitName_cache";

/**
 * Визначення gitName з кешу або URL (fallback коли база недоступна)
 * @returns string - назва гіта з кешу/URL
 */
function getGitNameFallback(): string {
  try {
    // Спочатку перевіряємо кеш
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return cached;
    }
    
    // Якщо кешу немає - беремо з URL
    const hostname = window.location.hostname; // наприклад: "
    if (hostname.endsWith('.github.io')) {
      return hostname.replace('.github.io', ''); // ""
    }
    
    // Для localhost - повертаємо з кешу або пустий рядок
    return cached || "";
  } catch {
    return "";
  }
}

/**
 * Отримання назви гіта з бази даних (setting_id: 1, стовпець infaGit)
 * @returns Promise<string> - назва гіта (наприклад, ")
 */
export async function getGitName(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("infaGit")
      .eq("setting_id", 1)
      .single();
    
    if (error) {
      console.error("❌ Помилка отримання назви гіта:", error);
      return getGitNameFallback();
    }
    
    const gitName = data?.infaGit;
    if (gitName) {
      // Кешуємо успішний результат
      localStorage.setItem(CACHE_KEY, gitName);
      return gitName;
    }
    
    return getGitNameFallback();
  } catch (err) {
    console.error("❌ Виняток отримання назви гіта:", err);
    return getGitNameFallback();
  }
}

/**
 * Формування повного гіт URL
 * @param gitName - назва гіта
 * @param path - додатковий шлях (опціонально)
 * @returns string - повний URL (наприклад, )
 */
export function buildGitUrl(gitName: string, path: string = ""): string {
  const baseUrl = `https://${gitName}.github.io/STO`;
  return path ? `${baseUrl}/${path}` : `${baseUrl}/`;
}

/**
 * Отримання повного гіт URL з бази даних
 * @param path - додатковий шлях (опціонально)
 * @returns Promise<string> - повний URL
 */
export async function getGitUrl(path: string = ""): Promise<string> {
  const gitName = await getGitName();
  return buildGitUrl(gitName, path);
}

/**
 * Отримання fallback URL (з обробкою помилок)
 * @param path - додатковий шлях (опціонально)
 * @returns Promise<string> - повний URL або fallback
 */
export async function getFallbackUrl(path: string = ""): Promise<string> {
  try {
    return await getGitUrl(path);
  } catch (error) {
    console.error("❌ Помилка отримання URL, використовую fallback:", error);
    return buildGitUrl(getGitNameFallback(), path);
  }
}