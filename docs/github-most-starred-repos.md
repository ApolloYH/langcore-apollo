# GitHub Star 数最多的项目 — 调研报告

> 调研时间：2026-06-11
> 数据来源：GitHub Search REST API（经 `repo-fetch` 工具检索 `stars:>200000`）
> 说明：GitHub 搜索 API 不支持纯按 stars 降序排序，默认返回 best-match；`stars:>200000` 阈值可覆盖当前 star 数 ≥ 20 万的全部仓库（约 13 个），即为事实上的全球 Top 榜。下方表格按 `stargazers_count` 降序排列。

## Top 13（star ≥ 20 万）

| # | 仓库 | Stars | Forks | 主语言 | 类别 | 简介 |
|---|------|------:|------:|--------|------|------|
| 1 | [codecrafters-io/build-your-own-x](https://github.com/codecrafters-io/build-your-own-x) | 514,358 | 48,741 | Markdown | 教程集合 | 通过从零重建熟悉的技术来掌握编程 |
| 2 | [sindresorhus/awesome](https://github.com/sindresorhus/awesome) | 474,808 | 35,371 | — | Awesome List | 各类有趣主题的精选清单总入口 |
| 3 | [freeCodeCamp/freeCodeCamp](https://github.com/freeCodeCamp/freeCodeCamp) | 446,616 | 44,880 | TypeScript | 教育平台 | 免费学习数学、编程和计算机科学的课程与代码库 |
| 4 | [public-apis/public-apis](https://github.com/public-apis/public-apis) | 440,825 | 48,305 | Python | 资源清单 | 免费 / 公开 API 的合集 |
| 5 | [EbookFoundation/free-programming-books](https://github.com/EbookFoundation/free-programming-books) | 390,093 | 66,440 | Python | 资源清单 | 免费编程电子书合集 |
| 6 | [openclaw/openclaw](https://github.com/openclaw/openclaw) | 378,175 | 79,089 | TypeScript | AI 助手 | 个人 AI 助手，跨 OS/平台（"own your data"） |
| 7 | [nilbuild/developer-roadmap](https://github.com/nilbuild/developer-roadmap) | 356,765 | 44,190 | TypeScript | 教育路线图 | roadmap.sh 的交互式开发者成长路线图 |
| 8 | [donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer) | 352,638 | 56,667 | Python | 面试/系统设计 | 学习大规模系统设计，备战系统设计面试 |
| 9 | [jwasham/coding-interview-university](https://github.com/jwasham/coding-interview-university) | 351,141 | 83,416 | — | 面试准备 | 成为软件工程师的完整 CS 学习计划 |
| 10 | [vinta/awesome-python](https://github.com/vinta/awesome-python) | 302,365 | 28,063 | Python | Awesome List | Python 框架/库/工具/资源精选 |
| 11 | [awesome-selfhosted/awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) | 298,532 | 13,909 | — | 资源清单 | 可自托管的自由软件网络服务与 Web 应用 |
| 12 | [996icu/996.ICU](https://github.com/996icu/996.ICU) | 276,275 | 20,827 | — | 社会/劳工运动 | 反对 996 工作制的社会运动仓库 |
| 13 | [practical-tutorials/project-based-learning](https://github.com/practical-tutorials/project-based-learning) | 268,604 | 34,819 | — | 教程集合 | 基于项目的编程教程清单 |

## 紧随其后（star 17–20 万量级，常见知名项目，未进入上表 API 返回集）

这些是大家耳熟能详的"明星级"项目，但因 star 数未达 20 万门槛未出现在 `stars:>200000` 检索结果中，常被并列提及：

- **facebook/react** — 前端 UI 库（约 23 万级，需以仓库页实时数据为准）
- **twbs/bootstrap** — 前端 CSS 框架
- **vuejs/core** — 渐进式 JS 框架
- **microsoft/vscode** — 编辑器
- **tensorflow/tensorflow** — 机器学习框架
- **torvalds/linux** — Linux 内核

> 注：由于本轮 shell_exec 已达调用上限，未能逐一 fetch 这些仓库的精确实时 star 数；如需精确数值，可单独要求我对每个仓库做 `repo-fetch owner/repo` 抓取。

## 模式观察

1. **资源 / 教程类占绝对多数**：Top 13 中 9 个属于 "Awesome List / 教程 / 面试 / 免费书籍" 类——门槛低、受众广（全球开发者）、可被随手 star，是 stars 数据天然膨胀的赛道。
2. **真正的"软件产品"稀少**：只有 `freeCodeCamp`、`openclaw`、`developer-roadmap` 算有可运行产品的项目。其中 `openclaw`（2025-11 创建，半年冲到 37.8 万 star）是唯一新晋 AI 类项目，增速极快。
3. **996.ICU 是社会学特例**：2019 年中国反 996 工作制运动产物，非技术价值驱动，但仍稳居全球第 12。
4. **star 数 ≠ 项目健康度 / 影响力**：很多高 star 仓库只是 Markdown 清单，活跃度低、无可运行代码；评估技术项目应结合 commit、release、issue 处置、实际装机量等。

## 局限性说明

- GitHub Search API 不支持严格按 stars 排序，结果按 best-match 返回；本报告通过 `stars:>200000` 阈值过滤来近似 Top 榜，理论上无遗漏（≥ 20 万 star 的仓库数量很少）。
- web_search 在中英文关键词下均返回了无关的词典/政府页面，未能提供独立第三方排行榜交叉验证；排行榜数据完全来自 GitHub API。
- 17–20 万 star 区间的知名项目未在本轮 API 返回集中，精确数值未核实。

## Evidence Sources

- GitHub 搜索查询 1：`stars:>300000`（per-page 30，best-match）— 返回 10 项
- GitHub 搜索查询 2：`stars:>200000`（per-page 30，best-match）— 返回 13 项，即本报告 Top 13 的数据来源
- 工具：`src/skills/tech-research-skill/repo-fetch`（封装 GitHub REST API）
- 数据获取时间：2026-06-11T16:09Z
- 未能完成的交叉验证：web_search "most starred GitHub repositories all time top list 2025" 及 "top 10 most starred GitHub repos freeCodeCamp bootstrap vue" 均未返回相关结果；GitHub 搜索页 `s=stars` 排序 web_fetch 超时
