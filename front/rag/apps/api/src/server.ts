import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { config } from "dotenv";
import Fastify from "fastify";

import { appRouter } from "./router";
import { configureNetworkProxy } from "./proxy";

const apiSrcDir = dirname(fileURLToPath(import.meta.url));
const frontRoot = resolve(apiSrcDir, "../../../..");
const envPaths = [
  resolve(frontRoot, "../agent/.env"),
  resolve(frontRoot, ".env.local"),
  resolve(frontRoot, ".env"),
  resolve(frontRoot, "rag/apps/api/.env")
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}
configureNetworkProxy();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const server = Fastify({
  logger: true
});

await server.register(cors, {
  origin: true
});

server.get("/health", async () => ({ ok: true }));

await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter
  }
});

await server.listen({ host, port });
