// src/ts/vxid/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// Vite автоматично завантажує змінні, що починаються з VITE_
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("❌ Відсутні ключі Supabase у файлі .env");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Ліміт подій на секунду
    },
  },
});
