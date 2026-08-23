import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, join, normalize } from "node:path";
import { existsSync, readFileSync, cpSync, statSync } from "node:fs";

const dataDir = resolve(__dirname, "../data");

// Serves ../data at /data during dev; copies it into dist/data on build.
function dataPlugin(): Plugin {
  return {
    name: "portfolio-data",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith("/data/")) return next();
        const file = normalize(join(dataDir, url.slice("/data/".length)));
        if (!file.startsWith(dataDir) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          return res.end("not found");
        }
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (existsSync(dataDir)) {
        cpSync(dataDir, resolve(__dirname, "dist/data"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: "/firstcloudrepo/",
  plugins: [react(), dataPlugin()],
});
