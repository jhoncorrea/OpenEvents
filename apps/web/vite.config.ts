import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (normalizedId.includes("/node_modules/@azure/msal-")) {
            return "authentication";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
