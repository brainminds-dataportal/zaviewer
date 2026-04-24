import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    global: "globalThis",
    "process.env": "{}",
  },
  build: {
    outDir: "dist",
  },
});
