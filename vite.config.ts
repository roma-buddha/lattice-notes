import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  optimizeDeps: { entries: ["index.html"] },
  server: { watch: { ignored: ["**/src-tauri/target/**", "**/release/**"] } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/@uiw/react-codemirror") ||
            id.includes("node_modules/@codemirror/") ||
            id.includes("node_modules/@lezer/")
          )
            return "editor";
          if (
            id.includes("node_modules/mermaid") ||
            id.includes("node_modules/katex") ||
            id.includes("node_modules/react-markdown") ||
            id.includes("node_modules/remark-") ||
            id.includes("node_modules/rehype-")
          )
            return "markdown";
        },
      },
    },
  },
});
