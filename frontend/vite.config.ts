import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

const backendDirectory = fileURLToPath(new URL("../backend", import.meta.url));

export default defineConfig(({ command, mode }) => {
  const isLocalDevelopmentServer = command === "serve" && mode !== "test";
  const localApiKey = isLocalDevelopmentServer
    ? process.env.LOCAL_API_KEY || loadEnv(mode, backendDirectory, "").LOCAL_API_KEY
    : undefined;

  if (isLocalDevelopmentServer && !localApiKey?.trim()) {
    throw new Error(
      "LOCAL_API_KEY is required to run the local Vite development server. Set it in backend/.env or the Vite server process environment.",
    );
  }

  return {
    plugins: [react()],
    ...(isLocalDevelopmentServer
      ? {
        server: {
          host: "127.0.0.1",
          proxy: {
            "/api": {
              target: "http://127.0.0.1:8000",
              changeOrigin: true,
              configure(proxy) {
                proxy.on("proxyReq", (proxyRequest) => {
                  proxyRequest.setHeader("X-API-Key", localApiKey!);
                  proxyRequest.setHeader("X_API_KEY", localApiKey!);
                });
              },
            },
          },
        },
      }
      : {}),
    test: {
      environment: "jsdom",
      globals: false,
      env: {
        VITE_APP_MODE: "local",
      },
    },
  };
});
