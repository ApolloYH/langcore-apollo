import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AgentConfig, JsonObject, McpServerConfig } from "../types.js";
import { stringify } from "../utils.js";

type McpConnection = {
  client: Client;
  transport: StdioClientTransport;
};

export class McpManager {
  private readonly connections = new Map<string, McpConnection>();

  constructor(private readonly config: AgentConfig) {}

  serverNames(): string[] {
    return Object.keys(this.config.mcpServers);
  }

  async listTools(serverName?: string): Promise<unknown> {
    if (serverName) {
      const client = await this.client(serverName);
      return { server: serverName, ...(await client.listTools()) };
    }
    const all = [];
    for (const name of this.serverNames()) {
      const client = await this.client(name);
      all.push({ server: name, ...(await client.listTools()) });
    }
    return all;
  }

  async callTool(serverName: string, toolName: string, args: JsonObject): Promise<string> {
    const client = await this.client(serverName);
    const result = await client.callTool({ name: toolName, arguments: args });
    return stringify(result, 12000);
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.connections.values()).map(async ({ transport }) => {
        await transport.close().catch(() => undefined);
      }),
    );
  }

  private async client(name: string): Promise<Client> {
    const existing = this.connections.get(name);
    if (existing) return existing.client;
    const server = this.config.mcpServers[name];
    if (!server) throw new Error(`Unknown MCP server: ${name}`);
    const transport = new StdioClientTransport(this.toTransportConfig(server));
    const client = new Client({ name: "langcore-agent", version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    this.connections.set(name, { client, transport });
    return client;
  }

  private toTransportConfig(server: McpServerConfig): ConstructorParameters<typeof StdioClientTransport>[0] {
    return {
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
      stderr: "pipe",
    };
  }
}
