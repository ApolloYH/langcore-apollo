# Agent Requirements

## Market Architecture Findings

- OpenAI Agents SDK frames agents as applications that plan, call tools, collaborate across specialists, and keep state for multi-step work. It also separates model/tool execution from orchestration, approvals, and state ownership. Source: https://developers.openai.com/api/docs/guides/agents
- OpenAI's SDK-level `Agent` model combines instructions, tools, handoffs, guardrails, structured outputs, MCP servers, and sessions. This maps closely to our requested runtime modules. Source: https://openai.github.io/openai-agents-python/agents/
- LangGraph positions itself as a low-level orchestration runtime for long-running stateful agents, emphasizing durable execution, streaming, human-in-the-loop, persistence, and tracing. Source: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph's workflow guide distinguishes fixed workflows from agents: workflows have predetermined code paths, while agents dynamically choose process and tool usage. It also names orchestrator-worker as a common pattern. Source: https://docs.langchain.com/oss/python/langgraph/workflows-agents
- Microsoft Agent Framework combines AutoGen-style single/multi-agent abstractions with session state, type safety, middleware, telemetry, and graph workflows for explicit multi-agent orchestration. Source: https://learn.microsoft.com/en-us/agent-framework/overview/
- AutoGen's core idea is conversable agents that integrate LLMs, tools, and humans via automated agent chat, allowing autonomous work with human feedback. Source: https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat/
- Anthropic MCP is an open standard for secure two-way connections between AI apps and data/tool servers. Claude's Messages API also has direct remote MCP connector support, but local stdio servers still need a client runtime. Sources: https://www.anthropic.com/news/model-context-protocol and https://platform.claude.com/docs/en/agents-and-tools/mcp-connector
- Anthropic tool use returns structured tool calls selected by the model from tool descriptions; client tools are executed by the application and returned to the model. Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

## Product Requirements

1. The runtime must implement an agent loop over Anthropic-compatible Messages API.
2. Tool calls must use native LLM tool calling, not text parsing.
3. The CLI must show observable execution trace: model turn, tool call, tool result summary, permission prompts, context compaction, and final answer.
4. The runtime must not expose hidden chain-of-thought. It displays process events and explicit model-visible messages only.
5. LLM configuration must come from environment variables:
   - `ANTHROPIC_AUTH_TOKEN`
   - `ANTHROPIC_BASE_URL`
   - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
6. Secrets must not be committed or embedded in code.
7. Context management must bound conversation growth and compact older turns.
8. Permissions must gate risky actions. Read-only tools can be auto-approved; shell, file writes, git commits, email send, MCP calls, and delegation can require human approval.
9. High-value decisions must be able to pause for human approval.
10. Skills must be discoverable from local skill directories and readable as instructions.
11. MCP servers must be configurable and callable through a tool gateway.
12. Multi-agent mode must support a master/slave pattern where the supervisor delegates tasks to named worker agents.
13. Git collaboration must include status/diff and commit tools.
14. Email communication must support composing outbound email. In safe default mode, email is written to an outbox; sending through `sendmail` is optional.
15. The implementation should be small enough to audit and extend.

## Initial Implementation Scope

- TypeScript CLI in this directory.
- Anthropic-compatible client implemented with `fetch`.
- Native tool loop supporting `tool_use` / `tool_result`.
- Built-in tools:
  - `list_files`
  - `read_file`
  - `write_file`
  - `shell_exec`
  - `git_status`
  - `git_diff`
  - `git_commit`
  - `email_send`
  - `request_human_approval`
  - `skill_search`
  - `skill_read`
  - `mcp_list_tools`
  - `mcp_call_tool`
  - `delegate_to_worker`
- MCP implemented through `@modelcontextprotocol/sdk`.
- Trace output printed to stderr, final answer printed to stdout.
