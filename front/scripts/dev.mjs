import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultDatabaseUrl = "postgres://langcore:langcore_password@127.0.0.1:5432/langcore";
const children = [];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontRoot = path.resolve(scriptDir, "..");

loadEnvFiles([
  path.resolve(frontRoot, "../agent/.env"),
  path.resolve(frontRoot, ".env.local"),
  path.resolve(frontRoot, ".env")
]);

function loadEnvFiles(paths) {
  for (const envPath of paths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = unwrapEnvValue(trimmed.slice(separatorIndex + 1).trim());
    }
  }
}

function unwrapEnvValue(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function runSetup() {
  const result = spawnSync("docker", ["compose", "up", "-d", "postgres"], {
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.error || result.status !== 0) {
    console.warn("[dev] PostgreSQL was not started by docker compose. Continuing with existing DATABASE_URL.");
  }
}

function start(name, command, args, env = {}) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? defaultDatabaseUrl,
      DEVSCOPE_PROXY_URL: defaultProxyUrl,
      RAG_API_URL: process.env.RAG_API_URL ?? "http://127.0.0.1:4000",
      NEXT_PUBLIC_RAG_API_URL: process.env.NEXT_PUBLIC_RAG_API_URL ?? "http://127.0.0.1:4000",
      ...env
    },
    stdio: "inherit"
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (signal) {
      return;
    }

    if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

async function detectProxyUrl() {
  const configuredProxy =
    process.env.DEVSCOPE_PROXY_URL ??
    process.env.GIT_HTTPS_PROXY ??
    process.env.GIT_HTTP_PROXY ??
    process.env.HTTPS_PROXY ??
    process.env.HTTP_PROXY ??
    process.env.https_proxy ??
    process.env.http_proxy;

  if (configuredProxy) {
    return configuredProxy;
  }

  for (const port of [7897, 7890, 1087, 1080]) {
    if (await isPortOpen("127.0.0.1", port)) {
      return `http://127.0.0.1:${port}`;
    }
  }

  return "";
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(250);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const defaultProxyUrl = await detectProxyUrl();
if (defaultProxyUrl) {
  console.info(`[dev] Using proxy ${defaultProxyUrl}`);
} else {
  console.info("[dev] No local proxy detected. Set DEVSCOPE_PROXY_URL if GitHub access needs a proxy.");
}

runSetup();
start("rag-api", "npm", ["run", "dev:rag"], { PORT: process.env.PORT ?? "4000" });
start("front", "npm", ["run", "dev:front"]);
