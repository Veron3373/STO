import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  base: "/STO/", // бо GitHub Pages публікує з підкаталогу
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800, // ⬅ підняли ліміт з 500 до 600
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        main: resolve(__dirname, "main.html"),
        bukhhalteriya: resolve(__dirname, 'bukhhalteriya.html'),
      },
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          pdf: ['jspdf', 'html2canvas'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
