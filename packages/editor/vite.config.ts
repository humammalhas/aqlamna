import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow imports from sibling packages (runtime dist, etc.)
      allow: [".."],
    },
  },
  resolve: {
    alias: {
      // In dev, point @aqlamna/runtime at its source TS so HMR works
      "@aqlamna/runtime": resolve(__dirname, "../runtime/src/index.ts"),
    },
  },
});
