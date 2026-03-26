import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import fs from "fs";

/**
 * Плагін для заміни значень у public/ файлах (sw.js, manifest.json)
 * на значення з .env при білді та dev-сервері
 */
function publicEnvPlugin(env: Record<string, string>) {
  const projectName = env.VITE_PROJECT_NAME || "sto";
  const appName = env.VITE_APP_NAME || projectName;
  const appDescription = env.VITE_APP_DESCRIPTION || "";

  function processSwJs(content: string): string {
    return content
      .replace(
        /const CACHE_NAME = '[^']+';/,
        `const CACHE_NAME = '${projectName}-cache-v5';`,
      )
      .replace(
        /const CACHE_CDN = '[^']+';/,
        `const CACHE_CDN = '${projectName}-cdn-v5';`,
      );
  }

  function processManifest(content: string): string {
    const manifest = JSON.parse(content);
    manifest.name = appName;
    manifest.short_name = appName;
    manifest.description = appDescription;
    return JSON.stringify(manifest, null, 2);
  }

  return {
    name: "public-env-replace",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === "/sw.js") {
          const filePath = resolve("public/sw.js");
          if (fs.existsSync(filePath)) {
            res.setHeader("Content-Type", "application/javascript");
            res.end(processSwJs(fs.readFileSync(filePath, "utf-8")));
            return;
          }
        }
        if (req.url === "/manifest.json") {
          const filePath = resolve("public/manifest.json");
          if (fs.existsSync(filePath)) {
            res.setHeader("Content-Type", "application/json");
            res.end(processManifest(fs.readFileSync(filePath, "utf-8")));
            return;
          }
        }
        next();
      });
    },
    writeBundle(options: any) {
      const outDir = options.dir || "dist";

      const swPath = resolve(outDir, "sw.js");
      if (fs.existsSync(swPath)) {
        fs.writeFileSync(swPath, processSwJs(fs.readFileSync(swPath, "utf-8")));
      }

      const manifestPath = resolve(outDir, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        fs.writeFileSync(
          manifestPath,
          processManifest(fs.readFileSync(manifestPath, "utf-8")),
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const githubRepo = env.VITE_GITHUB_REPO || "";

  return {
    base: process.env.DEPLOY_TARGET === "github" ? `/${githubRepo}/` : "/",
    plugins: [react(), publicEnvPlugin(env)],
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
            if (id.includes("jspdf") || id.includes("html2canvas"))
              return "pdf";

            // React — окремо
            if (id.includes("react-dom") || id.includes("react/"))
              return "react";

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
  };
});
