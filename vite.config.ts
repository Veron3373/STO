import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  base: process.env.DEPLOY_TARGET === "github" ? "/STO/" : "/",
  plugins: [react()],
  build: {
    modulePreload: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        main: resolve(__dirname, "main.html"),
        bukhhalteriya: resolve(__dirname, "bukhhalteriya.html"),
        planyvannya: resolve(__dirname, "planyvannya.html"),
      },
      output: {
        manualChunks(id) {
          // Vite preload helper — в окремий chunk для уникнення кругових залежностей
          if (
            id.includes("modulepreload-polyfill") ||
            id.includes("preload-helper")
          )
            return "vendor";

          // Supabase — окремий chunk (великий, рідко змінюється)
          if (id.includes("@supabase")) return "supabase";

          // PDF генерація — завантажується тільки при друку
          if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf";

          // React — окремо
          if (id.includes("react-dom") || id.includes("react/")) return "react";

          // ШІ-модулі — великі, завантажуємо разом але окремо від решти
          if (id.includes("/ai/aiChat") || id.includes("/ai/aiPlanner"))
            return "ai-chat";
          if (id.includes("/ai/aiReminder")) return "ai-reminders";

          // Бухгалтерія — окремий chunk (тільки для бухгалтерської сторінки)
          if (id.includes("/bukhhalteriya/")) return "bukhhalteriya";

          // Планування — окремий chunk
          if (id.includes("/planyvannya/")) return "planyvannya";

          // Модальне вікно акту — великий модуль
          if (
            id.includes("/zakaz_naraudy/modalMain") ||
            id.includes("/zakaz_naraudy/modalUI")
          )
            return "modal-act";
        },
      },
    },
  },
});
