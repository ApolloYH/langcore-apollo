---
name: repo-health-skill
description: GitHub 项目调查、搜索、检查与报告生成。Use when the user asks to find, search, investigate, evaluate, compare, analyze, score, monitor, summarize, or report on GitHub repositories, GitHub URLs, or open-source projects. Handles GitHub repo search, project due diligence, activity and maintenance checks, issue and commit summaries, community/risk/momentum signals, investment analysis, daily or weekly repo reports, and markdown or HTML output. 适用于：调查 GitHub 项目、搜索开源项目、分析仓库、检查项目活跃度、仓库健康度、开源项目风险、投资分析、生成仓库日报/周报.
---

# Repo Health Skill

Use this skill to build composable terminal pipelines for GitHub project investigation:

```sh
${CLAUDE_SKILL_DIR}/repo-fetch owner/repo --include issues,commits \
  | ${CLAUDE_SKILL_DIR}/repo-analyze \
  | ${CLAUDE_SKILL_DIR}/report-generate --template weekly --format markdown
```

Search GitHub repositories before analysis:

```sh
${CLAUDE_SKILL_DIR}/repo-fetch --search "vector database language:Python" \
  | ${CLAUDE_SKILL_DIR}/repo-analyze \
  | ${CLAUDE_SKILL_DIR}/report-generate --template investment --format markdown
```

When the user provides a GitHub URL, convert it to `owner/repo` before running `repo-fetch`.
Prefer including both issues and commits unless the user asks for repository metadata only.

## Tools

### repo-fetch

Single responsibility: collect GitHub repository or search data.

Input:

```sh
${CLAUDE_SKILL_DIR}/repo-fetch owner/repo [--include issues,commits] [--issues] [--commits]
${CLAUDE_SKILL_DIR}/repo-fetch --search "search query" [--per-page 10]
```

Output: JSON on stdout.

Environment:

- `GITHUB_TOKEN`: optional token for higher rate limits and private repository access.
- `GH_TOKEN`: optional fallback token if `GITHUB_TOKEN` is not set.
- `GITHUB_API_URL`: optional override, defaults to `https://api.github.com`.

### repo-analyze

Single responsibility: analyze `repo-fetch` JSON with GLM through an Anthropic-compatible endpoint.

Input: JSON from stdin.

```sh
${CLAUDE_SKILL_DIR}/repo-fetch owner/repo --include issues,commits | ${CLAUDE_SKILL_DIR}/repo-analyze
```

Output: structured JSON analysis on stdout.

Environment:

- `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`: required.
- `ANTHROPIC_BASE_URL`: optional Anthropic-compatible base URL. Defaults to `https://api.anthropic.com`.
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_MODEL`, or `CLAUDE_MODEL`: optional model override. Defaults to `glm-5.1`.

### report-generate

Single responsibility: generate a report from `repo-analyze` JSON.

Input: analysis JSON from stdin.

```sh
${CLAUDE_SKILL_DIR}/repo-fetch owner/repo --include issues,commits \
  | ${CLAUDE_SKILL_DIR}/repo-analyze \
  | ${CLAUDE_SKILL_DIR}/report-generate --template daily --format html --output report.html
```

Options:

- `--template daily|weekly|investment`
- `--format markdown|html`
- `--output PATH`: optional. If omitted, report is printed to stdout.

## Contracts

- All tools fail fast on invalid arguments, invalid JSON, missing required environment variables, or upstream API errors.
- Data tools emit machine-friendly JSON to stdout.
- Errors are emitted as JSON to stderr:

```json
{"ok": false, "error": {"code": "invalid_input", "message": "description", "details": {}}}
```

- Tools are idempotent: the same inputs and external API state produce the same output shape.
- Tools are pipe friendly: stdout is reserved for primary output, stderr is reserved for diagnostics.
