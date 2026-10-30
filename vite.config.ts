// The game page: a Vite app in web/, its data (the maps, the rounds, the
// pictures) written into web/public/ by scripts/site.ts. Local only.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  server: { port: 4195, strictPort: true, host: "127.0.0.1" },
  preview: { port: 4195, strictPort: true, host: "127.0.0.1" },
  build: { outDir: "../dist", emptyOutDir: true },
});
