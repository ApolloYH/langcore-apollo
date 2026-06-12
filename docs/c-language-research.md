# C 编程语言：技术方向研究报告

> 研究日期：2025-06 ｜ 方法：多智能体并行调查（GitHub 生态 + 市场趋势 + 竞品分析）

---

## 一、总体判断

**潜力评级：高（作为基础设施工具）｜ 新项目增长评级：中低**

C 语言在 2025 年处于"强势在位、缓慢结构性承压"的状态：

- **不可替代**：Linux 内核、SQLite、PostgreSQL、Redis、Nginx、Git、所有 libc——这些万亿级行量级的基础设施不会也不能被重写，C 是它们的唯一语言。
- **仍在增长**：TIOBE 2025 年 6 月排名第 2（10.77%），同比 +1.30%，是少数仍在增长的传统语言。
- **结构性承压**：内存安全政策压力（CISA/ONCD）、Rust 在内核/嵌入式/云原生领域的蚕食、新项目选型中 C 不再是默认选项。

**结论**：C 不是一门"正在消亡"的语言——它的核心护城河足够深，但 *新增* 绿地项目中的份额正在被 Rust、Go、Zig 等逐步蚕食。

---

## 二、GitHub 生态景观

### 代表性仓库

| 仓库 | Stars | 描述 | 最近提交 | 健康度 | 揭示的趋势 |
|------|-------|------|----------|--------|-----------|
| torvalds/linux | 236k | Linux 内核 | 当日 | 100/100 | C 在 OS/内核领域不可替代 |
| redis/redis | 74.8k | 内存数据库/KV存储/向量引擎 | 2天前 | 100/100 | C 正向 AI 相邻工作负载扩展 |
| git/git | 61.5k | Git 源码 | 当日 | 100/100 | 最关键的开发基础设施仍是纯 C |
| tmux/tmux | 46.5k | 终端复用器 | 当日 | 100/100 | Unix 系统工具仍是 C 的天下 |
| zephyrproject-rtos/zephyr | 15.6k | 可扩展 RTOS | 当日 | 100/100 | 嵌入式/IoT 是 C 最活跃增长前沿 |
| wasm3/wasm3 | 7.9k | WebAssembly 解释器 | 当日 | 100/100 | 新兴 C 项目定位为"可移植运行时" |

### 关键观察

1. **C 主导不可重写的基础设施**：Linux、Git、FFmpeg、Redis、tmux——这些是数十年的投资，移植成本极高，每日仍有活跃提交。
2. **嵌入式/IoT 是增长前沿而非过去**：Zephyr RTOS、LVGL（23.8k★）、tinyUSB、mongoose 等活跃度极高，MCU 约束使 C 在此领域无可替代。
3. **现代 C 项目定位为"可移植运行时/引擎"**：wasm3（WASM 运行时）、Redis 向量引擎、netdata 可观测性——新 C 项目成功的方式是成为其他东西运行的 *基座*。
4. **GitHub 指标存在偏差**：Linux 和 Git 的 GitHub Issues 已关闭（使用邮件列表开发），低 issue 数不代表低活跃度。

---

## 三、流行度与排名

| 排名体系 | C 的位置 | 趋势 | 来源 |
|----------|---------|------|------|
| TIOBE 指数（2025年6月） | 第 2 名，10.77% | 上升 — 从第 3 升至第 2，同比 +1.30% | tiobe.com |
| Stack Overflow 开发者调查 2024 | 第 9，20.3%（整体）；16.9%（专业）；38.0%（学习者） | 稳定；学习者份额显著高于专业者 | survey.stackoverflow.co/2024 |
| GitHub Octoverse 2024 | 未进增长榜前列 | Python 登顶第 1，C 不在增长最快之列 | GitHub Blog |

**要点**：
- C 是 TIOBE 前三名中唯一同比 *增长* 的语言（C++ 和 Java 均下滑）
- 学习者占比 38%（vs 专业者 16.9%），表明 C 仍是核心教学语言
- C 在 Stack Overflow 上（20.3%）仍领先于 Rust（12.6%）和 Go（13.5%）

---

## 四、行业需求驱动力

### 核心需求领域

- **嵌入式 / IoT / 固件**：裸金属和 RTOS 开发的 lingua franca（FreeRTOS、Zephyr、AUTOSAR Classic、MISRA-C）。MCU 资源约束下，C 是唯一可行的高级语言。
- **操作系统 / 内核**：Linux、BSD、Windows 内核、虚拟化层、设备驱动——全部以 C 为主。
- **数据库与运行时**：Redis、SQLite（超万亿部署量）、PostgreSQL、Nginx——高性能数据基础设施的首选。
- **安全关键认证**：汽车（ISO 26262 / MISRA C）、航空（DO-178C）、医疗器械——C 有成熟的认证工具链和合规体系。
- **教育**：几乎所有 CS/EE 项目必修 C，保证人才持续供给。

### 尾风（推动力）

1. **C23 标准正式发布**：ISO/IEC 于 2024 年正式采纳 C23（ISO/IEC 9899），这是 C 语言多年来最重要的更新。
2. **嵌入式需求持续增长**：IoT 设备、边缘计算、汽车电子的扩张驱动 C 需求。
3. **现代工具链改进**：Clang/LLVM、CMake、Meson 等持续改善 C 开发体验。
4. **WebAssembly**：Emscripten 允许 C 代码运行在 Web 平台，开辟新应用场景。

---

## 五、竞争格局

### 竞争者一览

| 语言 | 首发年份 | 主要领域 | 内存安全 | C 互操作 | 动量 | 对 C 的威胁程度 |
|------|---------|---------|---------|---------|------|----------------|
| Rust | 2010 | 系统/内核/网络/嵌入式 | 强（借用检查器） | 优（FFI+bindgen） | 最高 | 严重 |
| C++ | 1985 | 游戏/浏览器/HFT/编译器 | 部分（RAII/智能指针） | 原生 | 稳定 | 中等 |
| Go | 2009 | 云服务/CLI/DevOps | GC，非实时 | cgo 有开销 | 稳定 | 低（直接） |
| Zig | 2016 | 系统/嵌入式/工具链 | 更安全默认值 | 最佳（内置 C 编译器） | 上升 | 工具链层威胁 |
| Nim | 2008 | 系统/脚本 | GC/ARC 可选 | 编译到 C | 小众 | 极低 |
| Carbon | 2022 | C++ 后继者 | 设计目标 | C++ 互操作 | 早期 | 间接 |

### Rust — 最严重的威胁

- 已在 Linux 内核（6.1+ 合并）、Windows 内核组件、Android（Google 强制新代码用 Rust）、AWS Firecracker、Cloudflare Pingora 落地
- 政策顺风：ONCD（2024年2月）、NSA/CISA 明确推荐内存安全语言
- 弱点：编译速度慢、借用检查器学习曲线陡峭、C ABI 仍是所有 FFI 的基础

### Zig — 工具链侧的渗透

- 定位为内置 C/C++ 编译器的系统语言（zig cc 可直接替换 gcc/clang）
- 代表项目：Ghostty（56k★）、TigerBeetle（16k★）、Lightpanda（31k★）
- 弱点：未达 1.0（当前 0.16.0），从 GitHub 迁移至 Codeberg，生态小

### Go — 不同战场的赢家

- 在云/网络服务和 CLI 工具领域已取代 C 的位置（Docker、K8s、Terraform）
- 因 GC 和运行时，无法进入内核、硬实时、MCU 领域

---

## 六、C 的护城河（仍胜出的领域）

1. **通用 ABI**：所有 FFI 边界——Python、Java JNI、Go cgo、Rust extern "C"、Node N-API——最终都讲 C ABI。这是事实上的平台 ABI，所有竞争者都依赖它。
2. **不可替代的遗留代码**：Linux 内核、SQLite（万亿级部署）、PostgreSQL、Redis、Nginx、Git——重写在经济上不理性，将维护数十年。
3. **嵌入式工具链**：MCU 厂商（ST、Microchip、NXP、Renesas）优先提供 C 编译器并通过认证。MISRA C 是汽车/航空合规标准。
4. **性能可预测性**：无 GC、无运行时、无隐藏分配——手动栈/堆控制，确定性内存布局。
5. **标准与可移植性**：ANSI/ISO C 标准，运行在几乎所有架构上（包括 Rust/Go 未支持的）。
6. **人才池**：可能是最广泛教授的系统语言，每个 CS 毕业生都有 C 基础。

---

## 七、C 被蚕食的领域

1. **新系统软件中内存安全为硬需求的场景**：驱动、内核模块、网络服务、加密代码——Rust 已成 Microsoft、Google、AWS、Cloudflare 新底层代码的默认选择。
2. **安全/合规政策层**：ONCD 报告（2024年2月）、NSA/CISA 指南明确推荐内存安全语言用于新代码——制度性替代。
3. **云/网络服务和 CLI 工具**：已被 Go（及部分 Rust）取代——Docker、K8s、Terraform、ripgrep 等现代工具链不再首选 C。
4. **JS/构建工具链**：Rust 正在悄悄蚕食（SWC、Turborepo、Rspack、Oxc、Biome）。
5. **构建工具链本身**：Zig 通过 zig cc 从编译器驱动层面切入，Bun 取代 C 系 JS 工具。
6. **新数据库/运行时**：TigerBeetle（Zig）、各种 Rust 数据库——绿地数据基础设施已很少用 C 起步。

---

## 八、趋势与市场信号

### 驱动因素
- IoT/边缘计算扩张驱动嵌入式 C 需求持续增长
- C23 标准落地为语言现代化注入活力
- 万亿级 C 代码库需要持续维护投入
- 38% 学习者占比确保人才管道

### 顺风
- C23 标准正式发布（ISO/IEC 2024）— 最重要催化剂
- 嵌入式/IoT 领域仍在扩张
- WebAssembly 开辟新平台
- 现代 Clang/CMake 工具链持续改善开发体验

### 逆风
- 内存安全政策压力持续加大（国防、汽车、关键基础设施采购偏好内存安全语言）
- Rust 在内核/嵌入式/云原生领域逐步蚕食
- 绿地项目中 C 不再是默认选项
- 新一代开发者更倾向 Rust/Go/Zig

### 6-18 个月展望

1. **TIOBE 排名稳定或微增**：嵌入式/系统需求维持 C 在前 3，但上限受限于缺乏新应用场景
2. **C23 采用加速**：GCC 14+、Clang 18+ 支持完善，安全关键行业更新合规档案
3. **内存安全政策压力加大**：国防、汽车、关键基础设施采购对新代码的内存安全要求趋严
4. **Rust 缓慢蚕食**：内核驱动、嵌入式（no_std）、云原生系统，但 Rust 复杂性可能限制大规模采用
5. **教育管道保持健康**：C 继续作为 CS/EE 必修语言

**净评估**：C 在 2025 年是一个"强势在位者，承受缓慢结构性压力"。需求在其核心领域（嵌入式、内核、固件、安全关键遗留系统）仍然持久，语言本身刚获得了多年来最大的现代化（C23），但新系统工作正逐步转向 Rust/Go，内存安全法规对新项目是真实的多年逆风。C 不在衰退（TIOBE 趋势向上），但它在新增绿地系统代码中的份额可能正在缓慢萎缩。

---

## 九、机会地图

### 未被充分服务的领域
- **C23 迁移工具链**：帮助现有 C 代码库利用 C23 新特性（改进的类型安全、属性、位精度整数等）
- **嵌入式 C 安全加固**：静态分析、形式化验证、MISRA-C 自动化合规工具
- **C 与 Rust 渐进式混合方案**：帮助组织在保持 C 代码库的同时引入 Rust（FFI 桥接、渐进重写策略）
- **C 教育与培训**：面向嵌入式/IoT 开发者的现代 C（C23）课程

### 潜在产品切入点

| 切入点 | 目标用户 | 差异化方向 |
|--------|---------|-----------|
| C23 迁移助手 | 大型 C 代码库维护者 | 自动检测可利用的 C23 特性并建议重构 |
| 嵌入式 C 安全扫描 | 汽车/航空/医疗开发者 | 集成 MISRA-C/CERT-C 规则，CI/CD 原生 |
| C-Rust 互操作 SDK | 系统软件开发者 | 简化 FFI 桥接，自动生成 bindgen 绑定 |
| C WASM 运行时 | 边缘/Web 开发者 | 一键将 C 代码编译为 WASM 并部署 |

### 需要监控的信号
- Rust 在 Linux 内核中的驱动模块增长速度
- Zig 1.0 发布时间和生态成熟度
- C23 在 GCC/Clang 中的符合性进展
- 各国政府对内存安全语言的采购政策变化
- 嵌入式 Rust（Ferrocene、Knurling-rs）的商业化进展

---

## 十、建议

**策略：观察 + 选域建设**

- **不建议** 全力押注 C 作为新产品的主要语言（除非目标是嵌入式/安全关键领域）
- **建议** 关注 C 生态中的工具机会（迁移、安全、互操作）而非语言本身
- **建议** 将 C 视为一个"基础设施层"——围绕它的维护、安全、现代化需求比语言本身更有商业价值
- **建议** 密切关注 Rust/Zig 在 C 传统领地的渗透速度，这是最重要的早期预警信号

---

## Evidence Sources

### GitHub 仓库（直接获取并分析）
- torvalds/linux — 236k★ — https://github.com/torvalds/linux
- redis/redis — 74.8k★ — https://github.com/redis/redis
- git/git — 61.5k★ — https://github.com/git/git
- tmux/tmux — 46.5k★ — https://github.com/tmux/tmux
- zephyrproject-rtos/zephyr — 15.6k★ — https://github.com/zephyrproject-rtos/zephyr
- wasm3/wasm3 — 7.9k★ — https://github.com/wasm3/wasm3

### GitHub 搜索查询
- language:C stars:>5000（per-page 10）— 返回 10 结果，total_count 417
- language:C embedded stars:>1000（per-page 10）— 返回 10 结果，total_count 90
- language:Rust systems stars:>2000 pushed:>2024-01-01 — total_count 44
- language:Zig stars:>500 — total_count 81

### Web 来源
- TIOBE Index 主页（2025年6月数据）— https://www.tiobe.com/tiobe-index/
- Stack Overflow Developer Survey 2024 — https://survey.stackoverflow.co/2024/technology
- ISO/IEC WG14 官方页面（C23 标准信息，2025-11-10）— https://www.open-std.org/jtc1/sc22/wg14/
- GitHub Octoverse 2024 — https://github.blog/news-insights/octoverse/octoverse-2024/
- Rust 官方网站（版本 1.96.0）— https://www.rust-lang.org/
- Zig 官方网站（版本 0.16.0）— https://ziglang.org/

### 公共知识来源（未在本次会话直接抓取，基于既定公开事实）
- Linux Rust-for-Linux 合并于内核 6.1（2022年12月）
- Microsoft 宣布在 Windows 内核组件中使用 Rust（2023）
- Google 强制 Android 新代码使用 Rust；Android 内存漏洞自 2019 年下降约 76%
- NSA/CISA 内存安全语言指南（2022-2023）；ONCD 报告 2024年2月

### 数据质量声明
- CISA/ONCD 内存安全相关原始文档 URL 在本次会话中返回 404（站点改版），相关结论基于既定公开事实
- RedMonk 2025 Q1 排名未能获取（URL 变更）
- Go 生态 GitHub 搜索查询因 topic 字段匹配问题返回 0 结果，Go 相关数据基于通用知识
- C23 编译器符合性详情未在本次会话中直接验证