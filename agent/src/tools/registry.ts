import type { AnthropicTool, JsonObject, ToolDefinition, ToolExecutionContext, ToolResult } from "../types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  definitions(): AnthropicTool[] {
    return Array.from(this.tools.values()).map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }));
  }

  riskOf(name: string) {
    return this.tools.get(name)?.risk;
  }

  async execute(name: string, input: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { content: `Unknown tool: ${name}`, isError: true };
    context.emit({ type: "tool_call", tool: name, input, risk: tool.risk });

    const approved = await context.requestApproval({
      toolName: name,
      risk: tool.risk,
      reason: `Tool ${name} requested by the model.`,
      input,
    });
    if (!approved) {
      return { content: `Permission denied for tool ${name}`, isError: true };
    }
    return tool.execute(input, context);
  }
}
