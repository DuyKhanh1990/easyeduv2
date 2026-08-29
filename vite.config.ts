import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
    dedupe: ["react", "react-dom", "wouter"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "wouter",
      "emoji-mart",
      "@emoji-mart/react",
      "@tiptap/core",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-image",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-youtube",
    ],
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    hmr: process.env.REPLIT_DEV_DOMAIN
      ? {
          protocol: "wss",
          host: process.env.REPLIT_DEV_DOMAIN,
          clientPort: 443,
        }
      : true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
