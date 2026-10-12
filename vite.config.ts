import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./"),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      // Only with `npm run dev:proxy`: forwards /api calls to the live site so features that need the
      // server can be tried locally. It talks to the real Firebase project, so use disposable accounts.
      ...(mode === "apiproxy" ? { proxy: { "/api": { target: "https://techsavvytechs.com", changeOrigin: true, secure: true } } } : {}),
    },
  };
});
