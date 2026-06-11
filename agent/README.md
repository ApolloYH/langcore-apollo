# LangCore Agent

一个轻量 TypeScript agent runtime。默认是可持续对话的问答助手；当用户要求它查看项目、改文件、运行命令、调用 MCP、发邮件或做 Git 协作时，再进入工具执行流程。

覆盖：

- Anthropic-compatible Messages API agent loop
- 原生 tool calling
- QueryEngine 会话引擎
- PromptBuilder 分层系统提示词
- ToolPolicy 工具选择和风险策略
- 上下文压缩
- 权限审批和高价值决策人工介入
- Skill 搜索/读取
- MCP stdio server 工具网关
- 主从多 agent 委派
- Web 搜索
- URL / API 内容读取
- Bash/shell 执行
- 文件读写
- Git 协作工具
- 邮件 outbox / sendmail
- CLI trace，展示调用了什么工具和执行了什么步骤

## 架构

核心模块：

- `QueryEngine`：一个会话一个实例，负责多轮消息历史、LLM 调用、tool loop、上下文压缩和 worker 调度。
- `PromptBuilder`：按 section 构造系统提示词，包括身份、系统规则、做任务规则、执行动作风险、工具策略、agent 委派、环境和输出风格。
- `ToolPolicy`：集中描述工具选择规则、风险边界和子 agent 委派策略。
- `ToolRegistry`：把本地读写、Web 搜索、Bash、Git、邮件、Skill、MCP、worker 委派暴露为模型原生工具。

## 多智能体模型

LangCore 的多智能体按 Claude Code 的 Task/Subagent 模式设计：

- 主 agent 负责用户对话、任务拆解、最终判断和结果汇总。
- Worker 是一次性的 fresh subagent，不继承主对话历史，只接收主 agent 写入的任务 brief。
- Worker 适合复杂调研、跨文件探索、独立审查、嘈杂的多步调查和专门实现。
- 不应把简单文件读取、小改动、明确路径查询交给 worker；这类任务直接用专用工具更快。
- Worker 的结果不会直接展示给用户，主 agent 必须综合后再回复。
- `delegate_to_worker` 要提供 `worker`、短 `description` 和完整 `task`，终端只展示短描述，完整 brief 留在工具调用内部。

## 配置

不要把 token 写进仓库。运行前在 shell 中设置：

```bash
export ANTHROPIC_AUTH_TOKEN="..."
export ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="glm-5.1"
```

可复制 `agent.config.example.json` 为本地配置：

```bash
cp agent.config.example.json agent.config.json
```

## 运行

推荐：交互式问答/做事模式：

```bash
npm install
npm run dev -- --config agent.config.json
```

进入后可以连续输入问题或任务。同一个进程会保留上下文，直到输入 `/clear` 或退出。

CLI 默认开启过程输出和流式回答：等待模型时会使用两行状态块，第一行是明暗呼吸的 `agent`，第二行是逐字显示并闪动的 `* Thinking...` 和思考用时。模型开始输出后会清掉状态块，重新以 `agent` 单独占一行，回答从下一行开始，避免挤在一起。工具调用会以简洁的一行状态展示。终端输出会做轻量 Markdown 清理，避免直接露出 `##`、`**`、反引号等原始标记。单次任务模式适合脚本调用：

```bash
npm run dev -- --config agent.config.json "查看仓库结构并总结"
```

交互命令：

- `/skills`：列出已安装的本地 skills
- `/skill install <path> [name]`：从本地 `SKILL.md` 文件或包含 `SKILL.md` 的目录安装 skill
- `/verbose on|off`：运行中打开或关闭 trace
- `/stream on|off`：运行中打开或关闭流式输出
- `/yes on|off`：运行中打开或关闭自动审批
- `/clear`：清空当前对话上下文
- `/exit`：退出

CLI 参数：

- `--quiet`：关闭过程输出，只保留回答
- `--no-stream`：关闭流式输出
- `--no-color`：关闭彩色输出
- `--yes`：自动批准工具调用

审批模式默认是 `ask`。`--yes` 会自动批准工具调用，只建议在受控环境中使用。

为避免模型在失败时连续请求危险操作，CLI 默认会限制同一用户请求内重复高风险工具调用。读取网页、GitHub API、README 或 raw 文件时优先使用 `web_fetch`，不再通过 `shell_exec` 调 `curl`。

## 程序调用

后期接网页 demo 时，不需要走 CLI。可以在 Node 后端直接调用 SDK：

```ts
import { createQueryEngine } from "langcore-agent";

const engine = await createQueryEngine({
  configPath: "agent.config.json",
  assumeYes: false,
  onEvent(event) {
    // 可以转发到 WebSocket/SSE，用于前端显示工具调用轨迹
    console.log(event);
  },
});

const answer = await engine.submitMessage("帮我看一下当前项目结构");
console.log(answer);
```

如果是无状态 HTTP 接口，也可以用单次调用：

```ts
import { runAgentTurn } from "langcore-agent";

const { text } = await runAgentTurn({
  configPath: "agent.config.json",
  input: "解释这个项目能做什么",
  assumeYes: true,
});
```

网页 demo 建议后端持有一个 `QueryEngine` 实例对应一个浏览器会话，这样多轮对话能共享上下文；`onEvent` 用于把 `[llm]`、`[tool]`、审批等事件推给前端。

## Skill 安装

LangCore 的 skill 是一个目录，目录里必须有 `SKILL.md`：

```text
skills/
  my-skill/
    SKILL.md
```

在 CLI 交互模式里安装本地 skill：

```text
/skill install /path/to/my-skill
```

也可以直接安装某个 `SKILL.md` 文件，并指定名称：

```text
/skill install /path/to/SKILL.md my-skill
```

查看已安装 skills：

```text
/skills
```

在对话里也可以让 agent 调用 `skill_install` 工具安装本地 skill。安装后当前会话即可通过 `skill_search` / `skill_read` 查到；如果后续把 skills 缓存化，再考虑增加 reload 命令。

## 需求文档

调研结论和需求规格见 [docs/requirements.md](docs/requirements.md)。
