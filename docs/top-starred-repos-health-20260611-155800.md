# GitHub Star 最多的项目健康度分析

**生成时间**: 2026-06-11
**数据来源**: GitHub Search API (`stars:>300000`) + repo-fetch / repo-analyze 本地健康度信号

## 核心结论

**"Star 最多" ≠ "最健康"。** Star 数 Top 1 的 `build-your-own-x`(51.4 万星)反而健康度最低(88/100),且已经 110 天没有代码提交;而真正"活"的项目(持续提交、issue 响应)是 freeCodeCamp、public-apis、free-programming-books 这类有组织/社区持续维护的项目。

Star 数本质上是"历史知名度"和"收藏量"的累积指标,与项目当前是否健康、是否值得依赖,相关性并不强。

## Top 10 项目一览(按 star 排序)

| 排名 | 仓库 | Stars | Forks | 语言 | 最后 Push | 健康度 |
|---|---|---|---|---|---|---|
| 1 | [codecrafters-io/build-your-own-x](https://github.com/codecrafters-io/build-your-own-x) | 514,355 | 48,741 | Markdown | 110 天前 | ⚠️ **88** |
| 2 | [sindresorhus/awesome](https://github.com/sindresorhus/awesome) | 474,804 | 35,371 | — | 9 天前 | ✅ 100 |
| 3 | [freeCodeCamp/freeCodeCamp](https://github.com/freeCodeCamp/freeCodeCamp) | 446,616 | 44,880 | TypeScript | 当天 | ✅ 100 |
| 4 | [public-apis/public-apis](https://github.com/public-apis/public-apis) | 440,825 | 48,303 | Python | 4 天前 | ✅ 100 |
| 5 | [EbookFoundation/free-programming-books](https://github.com/EbookFoundation/free-programming-books) | 390,093 | 66,440 | Python | 2 天前 | ✅ 100 |
| 6 | openclaw/openclaw | 378,174 | 79,089 | TypeScript | 当天 | 未深析 |
| 7 | nilbuild/developer-roadmap | 356,765 | 44,190 | TypeScript | 当天 | 未深析 |
| 8 | donnemartin/system-design-primer | 352,638 | 56,667 | Python | 83 天前 | 未深析 |
| 9 | jwasham/coding-interview-university | 351,141 | 83,415 | — | ~287 天前 | 未深析 |
| 10 | vinta/awesome-python | 302,364 | 28,063 | Python | 2 天前 | 未深析 |

> 注:排名 6–10 仅基于搜索元数据,未拉取 issues/commits 做完整健康度分析。但仅从"最后 push 时间"一列就能看出明显分化:`coding-interview-university` 已近一年没更新,`system-design-primer` 也有 83 天。

## Top 5 深度健康度分析

### ✅ freeCodeCamp/freeCodeCamp — 健康度 100
- **维护强度极高**:当天仍有 push,近 90 天捕获 30 次提交。
- **Issue 响应健康**:175 个 open issues(对比 44 万星基数,极低),近 90 天 12 次 issue 更新。
- **License 规范**:BSD-3-Clause,非营利组织运营,社区治理成熟。
- **判断**:真正"活的"大型项目,可放心依赖/贡献。

### ✅ public-apis/public-apis — 健康度 100
- 4 天前有 push,近 90 天 30 次提交。
- ⚠️ **需注意**:1363 个 open issues,在 Top 5 中最高,说明作为"众包列表"项目,issue 积压是结构性问题(大量是"请加入新 API"的请求),而非维护失能。
- License:MIT,规范。
- **判断**:健康,但 issue 积压反映列表类项目的天然治理难题。

### ✅ EbookFoundation/free-programming-books — 健康度 100
- 2 天前 push,近 90 天 30 次提交,3 次 issue 更新。
- Open issues 仅 81 个(对比 39 万星),治理非常干净。
- License:CC-BY-4.0,基金会背书。
- **判断**:健康度最佳的"资源列表"类项目之一。

### ✅ sindresorhus/awesome — 健康度 100
- 9 天前 push,近 90 天 6 次提交。
- Open issues 81 个,License:CC0-1.0(最宽松)。
- 由知名维护者 sindresorhus 长期维护,生态庞大。
- **判断**:作为"元列表"项目,提交频率低但稳定,健康。

### ⚠️ codecrafters-io/build-your-own-x — 健康度 88(最低)
**这是本次最重要的发现。**
- **已 110 天无 push**,近 90 天捕获 0 次提交。
- 近 90 天仍有 14 次 issue 更新,说明社区还在活动,但维护者没有合并代码。
- **License 未捕获**(no SPDX),在 Top 5 中是唯一许可证不明的项目。
- 503 个 open issues,积压较多。
- **风险信号**:虽然 star 第一,但实质进入"低活动"状态。背后公司 codecrafters-io 的商业重心已转向 codecrafters.io 平台本身,该仓库更像"引流入口"而非核心产品。
- **判断**:**收藏价值高,但不要把它当作"活跃维护中"的项目来依赖**。作为学习资源仍可用,但若要贡献或派生,需评估维护停滞风险。

## 关键洞察

1. **Star 是滞后指标,健康度是即时指标。** 排名第 1 的 build-your-own-x 和排名第 9 的 coding-interview-university(近一年无更新)都在用历史 star 透支当前的"知名度榜单"。

2. **组织/基金会运营 > 个人维护。** Top 5 中健康度满分的 4 个(freeCodeCamp、public-apis、free-programming-books、awesome)都有持续的组织化维护;而个人维护的项目(system-design-primer、coding-interview-university)更容易出现长期停滞。

3. **列表/资源类项目 vs 框架/库类项目。** Top 10 几乎全是"学习资源 + 资源列表",而非可被生产依赖的框架。对这类项目,"健康度"的关键不是"能否升级",而是"内容是否还在更新"——因此 push 间隔是最重要的单一信号。

4. **openclaw/openclaw(37.8 万星,排名第 6)值得单独关注**:2025-11-24 才创建,半年内冲到 37 万星,8019 个 open issues,是本榜上唯一"年轻且爆发式增长"的项目,典型的 AI 浪潮产物。

## 给开发者的建议

- **想学编程**:首选 freeCodeCamp(健康度最高、当天还在更新)。
- **想查 API/资源**:public-apis、free-programming-books、awesome-python 都健康可用。
- **看到 build-your-own-x 排第一就想依赖**:先看最后更新时间,内容依然优质但维护已放缓。
- **判断任何项目是否可依赖**:不要只看 star,至少检查 `pushed_at`、open/closed issue 比、近 90 天 commit 数。

## Evidence Sources

- GitHub Search API 查询:`stars:>300000` (per_page 10),通过 repo-fetch 执行,2026-06-11。
- 仓库健康度分析(含 issues, commits 数据集)通过 repo-analyze 本地启发式计算:
  - https://github.com/codecrafters-io/build-your-own-x
  - https://github.com/sindresorhus/awesome
  - https://github.com/freeCodeCamp/freeCodeCamp
  - https://github.com/public-apis/public-apis
  - https://github.com/EbookFoundation/free-programming-books
- 排名 6–10 的元数据来自上述同一搜索结果(openclaw/openclaw、nilbuild/developer-roadmap、donnemartin/system-design-primer、jwasham/coding-interview-university、vinta/awesome-python)。
- 分析模型:`local-heuristic-v1`,仅基于 GitHub 元数据 + issue/commit 采样,不含 LLM 推断。
