import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/STO/", // 👈 обов'язково для GitHub Pages!
  plugins: [react()],
});
