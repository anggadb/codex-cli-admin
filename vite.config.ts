import vinext from "vinext";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

async function readJsonBody(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 10 * 1024 * 1024) throw new Error("Export data exceeds the 10 MB limit.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function exportWithPython(pythonBin: string, payload: unknown): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [path.resolve("scripts/export_logs.py")], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk) => output.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(Buffer.concat(output))
      : reject(new Error(Buffer.concat(errors).toString("utf8") || `Python exited with code ${code}`)));
    child.stdin.end(JSON.stringify(payload));
  });
}

function localAdminApi(source: string | undefined, pythonBin: string | undefined): Plugin {
  return {
    name: "local-admin-api",
    configureServer(server) {
      server.middlewares.use("/api/logs", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("Method not allowed");
          return;
        }

        response.setHeader("Content-Type", "application/json");
        try {
          if (!source) {
            throw new Error("CODEX_LOG_DIR is required. Add it to .env.local before syncing logs.");
          }
          const files = (await readdir(source)).filter((name) => name.endsWith(".json"));
          const logs = [];
          const skipped = [];

          for (const file of files) {
            try {
              logs.push(JSON.parse(await readFile(path.join(source, file), "utf8")));
            } catch {
              skipped.push(file);
            }
          }

          response.end(JSON.stringify({ logs, skipped, syncedAt: new Date().toISOString() }));
        } catch (error) {
          response.statusCode = 500;
          response.end(JSON.stringify({
            error: error instanceof Error ? error.message : "Unable to read the log directory.",
          }));
        }
      });

      server.middlewares.use("/api/export", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("Method not allowed");
          return;
        }

        try {
          if (!pythonBin) throw new Error("PYTHON_BIN is required. Add it to .env.local before exporting.");
          const payload = await readJsonBody(request);
          const workbook = await exportWithPython(pythonBin, payload);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          response.setHeader("Content-Disposition", "attachment; filename=codex-runner-logs.xlsx");
          response.setHeader("Content-Length", workbook.length);
          response.end(workbook);
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({
            error: error instanceof Error ? error.message : "Unable to export logs.",
          }));
        }
      });
    },
  };
}

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const d1 = null;
const r2 = null;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      localAdminApi(env.CODEX_LOG_DIR, env.PYTHON_BIN),
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
