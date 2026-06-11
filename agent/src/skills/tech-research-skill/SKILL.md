---
name: tech-research-skill
description: "技术方向、行业领域、产品赛道、GitHub 仓库和开源项目的调查、研究、竞品分析、趋势分析和报告生成。Use when the user asks to investigate, research, evaluate, compare, analyze, score, summarize, or report on a technology direction, market/domain niche, AI infra, agent, RAG, LLM, devtool, data, security, web3, GitHub repository, GitHub URL, or open-source project. Handles GitHub repo search, repo health, issues/commits, implementation patterns, competitor landscape, market trend research, evidence sources, Markdown report output, and downloadable report links."
---

# Tech Research Skill

Use this skill for both:

- **Direction research**: investigate a technology direction, industry/domain, product category, or open-source theme.
- **Repository research**: investigate one or more GitHub repositories or open-source projects.

Default to this skill for prompts like "调查数字人方向", "分析 RAG agent 赛道", "研究某 GitHub 项目", "竞品分析", "趋势分析", "开源项目尽调", or "生成研究报告".

## Tool Location

The shell tools live in the same directory as this `SKILL.md`.

Set the tool directory from the loaded skill path:

```sh
TECH_RESEARCH_SKILL_DIR="$(dirname "$SKILL_PATH")"
```

If the current shell is already running from this skill directory, use:

```sh
TECH_RESEARCH_SKILL_DIR="."
```

Do not use absolute paths. Do not run exploratory `find`, `ls`, or `echo $CLAUDE_SKILL_DIR` just to locate these tools. If path context is uncertain, call `skill_read` for `tech-research-skill` and derive the directory from the returned path.

Tool role labels:

- `repo_search`: `"$TECH_RESEARCH_SKILL_DIR/repo-fetch" --search "<query>" --per-page 10`
- `repo_fetch`: `"$TECH_RESEARCH_SKILL_DIR/repo-fetch" owner/repo --include issues,commits`
- `repo_analyze`: `"$TECH_RESEARCH_SKILL_DIR/repo-analyze"` reads `repo-fetch` JSON from stdin and emits deterministic local health signals. It does not call an LLM, does not use network, and does not require model credentials.
- `repo_report_generate`: `"$TECH_RESEARCH_SKILL_DIR/report-generate" --template investment --format markdown --output <report>.md` renders `repo-analyze` JSON into Markdown or HTML. It does not call an LLM.

These role labels are not separate executable filenames. The executable scripts are `repo-fetch`, `repo-analyze`, and `report-generate`.

The outer agent is responsible for the actual judgment: repository health interpretation, implementation-pattern analysis, competitor analysis, market/trend synthesis, opportunity mapping, and final recommendation. Treat `repo-analyze` output as structured evidence, not as the final answer.

## GitHub API Token

`repo-fetch` uses the GitHub REST API. Unauthenticated requests are rate-limited quickly, so prefer a local token.

Supported environment variables:

```sh
GITHUB_TOKEN=<github personal access token>
GH_TOKEN=<github personal access token>
```

`repo-fetch` also loads a local `.env` file from this skill directory. That `.env` file is ignored by git and may contain:

```sh
GITHUB_TOKEN=<github personal access token>
```

Never hardcode a GitHub token into `repo-fetch`, `SKILL.md`, reports, examples, command output, or committed files. If a token appears in chat/logs/source, tell the user to revoke and rotate it.

## Workflow A: Technology Direction Research

Use this workflow when the user provides a field, technology direction, product category, or market/domain.

### Turn Budget Rules

Finish with a report instead of continuing to search. For a normal direction investigation:

- Run at most 4 GitHub search queries.
- Fetch details for at most 4 representative repositories.
- Fetch/search at most 5 web sources.
- If GitHub or web search quality is poor twice, stop searching and write the report with limitations.
- Do not run `date`, `ls docs`, or other housekeeping commands before writing the report.
- Prefer a concise evidence-backed report over exhaustive searching.
- Once there is enough evidence for a directional judgment, immediately write the Markdown report to the repository-root `docs/` directory. If the current working directory is `agent`, use `../docs/<filename>.md`; if the current working directory is this skill directory, use `../../../../docs/<filename>.md`. Do not write `docs/<filename>.md` from the `agent` directory, because that creates `agent/docs` and the frontend will not treat it as the canonical report location.

1. Frame the topic:
   - Normalize the topic name.
   - Identify adjacent keywords and English/Chinese search terms.
   - Decide whether the user needs build advice, investment analysis, competitor analysis, learning research, or a general trend report.

2. Search GitHub first:

```sh
"$TECH_RESEARCH_SKILL_DIR/repo-fetch" --search "<topic keywords> stars:>100" --per-page 10
```

Select 5-10 representative repositories:

- Most-starred or widely used projects.
- Recently active challengers.
- Different implementation approaches.
- Commercially relevant SDKs, frameworks, or infrastructure.
- Niche projects that reveal emerging use cases.

Do not rely only on stars. Prefer repos with recent commits, active issues/PRs, releases, real users, and clear positioning.

3. Analyze representative repositories:

```sh
"$TECH_RESEARCH_SKILL_DIR/repo-fetch" owner/repo --include issues,commits \
  | "$TECH_RESEARCH_SKILL_DIR/repo-analyze"
```

`repo-analyze` only computes local deterministic signals from the fetched GitHub data. The agent must read the JSON and perform the higher-level health analysis itself.

4. Search the web for trend evidence:
   - Use current authoritative sources: official docs, standards bodies, foundation pages, vendor announcements, market reports, funding/news coverage, developer surveys, ecosystem reports, benchmarks, regulation/compliance updates.
   - Collect source URLs and dates.
   - Distinguish observed evidence from inference.

5. Produce a report with this structure:
   - **Executive Judgment**: high/medium/low potential and why.
   - **GitHub Landscape**: repo table, implementation approaches, health, risks.
   - **Competitor Analysis**: direct open-source, commercial products, infrastructure platforms, substitutes.
   - **Trend and Market Signals**: drivers, tailwinds, headwinds, 6-18 month outlook.
   - **Opportunity Map**: underserved users, product wedges, technical differentiation, distribution/community angles.
   - **Recommendation**: build/watch/avoid, MVP scope, validation experiments, what to monitor.
   - **Evidence Sources**: final section with every repo, GitHub query, issue/commit dataset, and web page used.

## Workflow B: GitHub Repository Research

Use this workflow when the user gives a GitHub URL, `owner/repo`, or asks for open-source project health.

Convert GitHub URLs to `owner/repo`.

Fetch and analyze:

```sh
"$TECH_RESEARCH_SKILL_DIR/repo-fetch" owner/repo --include issues,commits \
  | "$TECH_RESEARCH_SKILL_DIR/repo-analyze" \
  | "$TECH_RESEARCH_SKILL_DIR/report-generate" --template weekly --format markdown
```

For investment or opportunity analysis:

```sh
"$TECH_RESEARCH_SKILL_DIR/repo-fetch" owner/repo --include issues,commits \
  | "$TECH_RESEARCH_SKILL_DIR/repo-analyze" \
  | "$TECH_RESEARCH_SKILL_DIR/report-generate" --template investment --format markdown
```

The generated repository report is a starting template. For user-facing research, the agent should expand it with its own analysis, web evidence, competitor context, and a final evidence-source section.

## Report Output

Always write final user-facing reports as Markdown under the repository root `docs/` directory, not under `agent/docs`.

Canonical report locations by current working directory:

```sh
# If cwd is the agent root:
DOCS_DIR="../docs"

# If cwd is this skill directory:
DOCS_DIR="../../../../docs"
```

Before writing, choose the path from the actual cwd. Never use `docs/<filename>.md` when cwd is `agent`.

Use a lowercase slug plus timestamp when useful:

```text
../docs/digital-human-research-20260611-153000.md
../docs/repo-health-owner-repo-20260611-153000.md
```

Do not put an absolute path in the report instructions.

Use the dedicated file-writing tool when available. Do not use shell redirection or here-docs for writing the report if a `write_file` tool exists.

Use a simple stable filename when no timestamp is available, such as `../docs/digital-human-research.md` from the agent root. It is better to overwrite a topic report than to spend a turn checking the clock or listing directories.


Every final report must end with:

```md
## Evidence Sources
```

Include:

- GitHub repositories used as evidence.
- GitHub search queries that shaped repo selection.
- Issue/commit datasets used.
- Web pages, articles, docs, market reports, announcements, and search results used for trend or competitor claims.
- Source names, URLs, and publication/access dates when available.

Do not put download links inside the Markdown report file, and do not manually add download links in the web frontend final answer. The frontend chat route appends report links after the assistant message once it detects the generated file. If a manual link is ever needed outside the frontend, the `file` query parameter must be only the basename in `docs`, not a path.

## Quality Bar

- Use real repositories and real external sources; do not invent competitors or metrics.
- Cite GitHub repos and web sources with links.
- Prefer evidence-backed judgment over generic commentary.
- Separate facts from inference.
- Call out uncertainty, missing credentials, GitHub API limits, failed fetches, and weak evidence.
- If the user asks in Chinese, answer in Chinese unless they request otherwise.
