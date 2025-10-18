import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/STO/",
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        main: resolve(__dirname, "main.html"),
        bukhhalteriya: resolve(__dirname, "bukhhalteriya.html"),
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
