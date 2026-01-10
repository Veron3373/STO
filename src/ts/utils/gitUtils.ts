// src/ts/utils/gitUtils.ts
// 🔧 УТИЛІТИ для роботи з гітом

import { supabase } from "../vxid/supabaseClient";

/**
 * Отримання назви гіта з бази даних
 * @returns Promise<string> - назва гіта (наприклад, "veron3373")
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
      return "veron3373"; // fallback значення
    }
    
    return data?.infaGit || "veron3373";
  } catch (err) {
    console.error("❌ Виняток отримання назви гіта:", err);
    return "veron3373"; // fallback значення
  }
}

/**
 * Формування повного гіт URL
 * @param gitName - назва гіта
 * @param path - додатковий шлях (опціонально)
 * @returns string - повний URL (наприклад, "https://veron3373.github.io/STO/")
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
    return buildGitUrl("veron3373", path);
  }
}