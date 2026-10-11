# Local Tana 全量审计

日期：2026-10-11（Asia/Shanghai）
基线：工作区当前 `HEAD`（`1008504`）
范围：根据原版 Tana 的 REA 静态证据、REA 原生无障碍观察、项目冻结约束和本地代码/测试结果，审计当前实现的语义正确性、View 生命周期、编辑闭环、桌面壳和已知功能边界。

## 审计边界与证据

原版证据来自 `docs/tana-reverse-study.md`、`docs/tana-feature-interaction-matrix.md` 记录的 REA Evidence 和离线原生窗口观察。REA 对完整 Electron bundle 的一次性语义图会耗尽 Node 堆，因此本次采用已验证的分层证据：主进程、共享 preload、renderer chunks、窗口 preloads，以及 `quick-capture:searchNodes` 定向 trace。没有把 OOM 或 `Transport closed` 推断成原版产品行为。

仓库中没有找到用户偏好所要求的 `tana-ux-prd-v3.md`。因此本报告只能逐项对照当前仓库的 `AGENTS.md`、Golden Scenarios 和逆向矩阵；无法对缺失 PRD 条款宣称“已满足”。

验证结果：

- `bun test`：437 pass，0 fail。
- `bun run typecheck`：通过。
- `bun run lint`：通过。
- `bun run build`：通过，Next.js 生产构建成功。
- `cargo test`：1 pass，0 fail；`cargo check`：通过。
- `bun run test:ui`：55 pass，8 fail（63 个场景）。失败集中在 F06 导航视图、F08 侧栏、响应式导航和专注模式。

单元测试已经覆盖并验证了 Search Host 的 PARENT/GRANDPARENT、2500 上限、缺失字段的 View 诊断、分组先于分页、Search-owned 创建路径、每类型 View state 和 canonical Field 编辑；下面的问题是这些修复没有完全贯穿运行时边界，或测试尚未覆盖到的路径。

## P0：必须先修复的结果可信度问题

### P0-1 View 的“失效字段/标签”仍可能 fail-open

`src/lib/tana/view-projection.ts:70-72` 的 `hasUsableField` 只检查 `fieldDefinition` 是否存在，没有检查 `isTanaNodeActive`。`diagnoseTanaViewFilter` 在 `:81-96` 对字段和超级标签也是同样逻辑；`matchesTanaViewFilterClause` 在 `:112-120` 随后继续读取存储值或成员关系。

这与 Search 的 `activeFieldDefinition` 不一致：Search 会把被删除或移入 Trash 的定义视为失效，View 却会把仍被索引的历史定义继续当作可用定义。项目的生命周期设计明确保留 Trash 节点以维持旧 NodeId，因此“定义移入 Trash”是可达到的真实状态，不是理论上的 missing-only 情况。

影响：用户删除 Status 定义后，`Status = Active`、`Status is set`、按标签过滤等 View 条件可能继续匹配，或者控件继续把已失效定义列为可选字段。结果集会扩大或保持旧语义，违反 fail-closed 要求。

修复方向：抽出 Search 和 View 共用的语义解析器，定义必须同时满足“存在、正确语义类型、`isTanaNodeActive`”；解析失败统一返回 diagnostic，过滤、排序、分组和字段候选都不能静默降级。需要新增字段/标签被移入 Trash 的 Golden Scenario，不能只测节点物理删除。

### P0-2 Search 计算使用 occurrence 上下文，但结果层丢失 occurrence identity

`src/lib/tana/query.ts:415-476` 已经把 `contextNode`（候选 occurrence）和 `contentNode`（canonical target）分开用于谓词计算；但 `TanaQueryResult` 只暴露 `nodes`，`evaluateTanaQuery` 在 `:529-547` 最终把 `contentTarget` 放入结果，并按 canonical id 去重。

这会产生“按 occurrence 判断、按 target 返回”的身份折叠：一个 Reference occurrence 可能满足 `child-of`、`on-day-node` 或动态上下文条件，但 View/Search 只能得到 canonical target，无法保留命中的具体 occurrence、路径和直接 Reference 边。`src/lib/tana/view-projection.ts:17-22` 的注释声称 projection 保留 occurrence identity，但 Search source 已在上游把 occurrence 丢掉；当前测试只验证了手工传入 Reference source 的情况，没有验证 Search 运行时路径。

影响：同一 canonical Node 的多个 occurrence 被提前合并；导航、分组、编辑定位和 `PARENT` 语义无法说明“是哪一个位置命中”。这正是逆向审计要求区分 Search Host、Candidate Occurrence、Canonical Target 的核心原因。

修复方向：查询结果返回 `{ occurrence, target }`（或至少返回 occurrence id 与 target id），canonical 去重策略显式化；View 只读取 target 的内容语义，导航/上下文/编辑保留 occurrence。需要增加“同一 target 的两个 occurrence 只有一个命中、但保留命中 occurrence”的 Golden Scenario。

## P1：当前体验或生命周期仍不完整

### P1-1 List/Tabs/Side menu 仍是同一套简化导航，编辑和可访问语义不完整

`src/components/tana/tana-navigation-view.tsx:51-79` 的条目按钮只叫 `选择 …`，内容区只有一个通用的 `打开节点` 按钮（`:92-99`）；没有条目级 `打开 <title>` 操作、真正的 tab/listbox 语义、键盘方向键模型、选中项持久化或源更新后的选中项同步。

`bun run test:ui` 的 F06 场景因此找不到期望的“打开 candidate”操作。当前实现可以显示一个内容 pane，但还没有达到原版导航视图的完整工作流。

修复方向：为 List、Tabs、Side menu 定义清楚的 active item、panel、open action 和键盘契约；条目按钮名称应包含目标标题；选中项以 NodeId 派生并在结果变化后校正。不要把三种视图仅视为 CSS 变体。

### P1-2 导航三态的 UI 契约与测试不一致，专注模式退出入口尚未定稿

`src/components/tana/tana-workspace-toolbar.tsx:59-85` 把完整态命名为“收窄导航”、迷你态命名为“隐藏导航”，而浏览器验收要求“收起导航/展开导航”；F08 和 responsive 的 5 个失败都卡在这些可访问名称上。原版逆向证据的状态机是单一入口 `完整 → 迷你 → 隐藏 → 完整`，名称则随状态表达 Show mini / Hide / Show。

专注模式下同一个按钮被标为“退出专注模式”（`:59-65`）。现有 still-shell 场景要求进入专注模式后不存在这个按钮，但逆向基线要求专注模式保留可预测的退出入口。当前行为与测试契约冲突，不能靠改一个字符串解决，需要先固定产品规则，再更新验收。

修复方向：保留一个导航状态机和一个可访问入口；窄屏的 `navigationOpen` 只能是临时 overlay 状态，不能与持久化 `sidebar.mode` 形成第二套可见状态。专注模式明确“顶栏是否保留退出入口”，并为该规则写单独场景。

### P1-3 Calendar 使用了分页后的集合

`src/components/tana/tana-view.tsx:17-20` 先计算带 pagination 的 `projection`，再把 `projection.items` 作为 Calendar 的 `results`（`:42`）。`src/components/tana/tana-calendar-view.tsx` 随后从 `resolved.items` 派生日期条目，因此超过一页的日历只会看到当前页节点，日期字段全集和未安排集合也随页码改变。

修复方向：Calendar 的日期 placement 从完整 filter/sort 结果派生，分页只作用于确实需要分页的 renderer；或者明确 Calendar 的 range/page 语义并独立保存。增加 101 个带日期节点的跨页测试。

### P1-4 每类型 View state 已写入，但派生关系和旁路 renderer 未完全迁移

`src/lib/tana/view-state.ts` 已实现每类型 state，这部分单元测试通过；但 `src/lib/tana/index.ts:946-973` 的内部引用扫描仍只读取 legacy flat 字段，没有遍历 `definition.states`。因此 states 中的 `groupFieldId`、`visibleFieldIds`、sort/filter 字段或标签不会进入 derived relation/backlink 计算，完整性和删除诊断看不到这些关系。

另外 `src/components/tana/tana-table-view.tsx:713-722` 的无 projection fallback 直接读取 `viewDefinition.visibleFieldIds`，绕过 `getTanaViewState`。主 View 路径传入 projection 时暂时掩盖了问题，Supertag/独立 Table renderer 路径仍可能读到旧配置。

修复方向：所有 View NodeId 引用统一遍历 legacy 与各 type state；所有 renderer 只能通过 `getTanaViewState` 读取配置。补充“Table/ Cards 切换后删除字段定义、重载、打开 References/Integrity”的场景。

### P1-5 Field candidate Search 没有传递 Search Host

`src/lib/tana/field-candidates.ts:1-3` 的 `SearchRunner` 只接收 `(index, expression)`，`:51-53` 对作为 Options 来源的 Search 直接 `runSearch(index, source.searchDefinition.query)`。`src/lib/tana/index.ts:568-575` 通过 `runTanaQuery` 调用它，也没有 `searchHostId`。

因此 Search 作为字段候选来源时，含 `PARENT`/`GRANDPARENT` 的 AST 会失去它自己的 host，退回候选节点上下文或无法匹配。主 Search、View source 和 sidebar 已传递 host，但这个字段候选旁路没有。

修复方向：候选 runner 接受 host id，使用统一 `evaluateTanaQuery(index, query, { searchHostId: source.id })`；同时保留 broken/too-many diagnostic，不能用 `try { ... } catch {}` 静默变成空候选。

### P1-6 Query Builder 的 Done/Run once 仍不是闭环交互

`src/components/tana/tana-view-editor.tsx:183-207` 的 Run once 只计算一次并写一段文字；`:227-235` 的 Done 只调用 `editor.tf.focus()`，没有关闭 Builder、提交明确的运行状态或刷新结果工作流。递归编辑器的 key 在 `:392-399` 使用 `JSON.stringify(child)`，Predicate 表单在 `:526-529` 也使用 JSON key；每次键入/结构变更都可能卸载重建表单，丢失焦点和未提交输入。

原版逆向证据确认 Query Builder 保留嵌套 AST、Run once 和 Done 都是实际交互节点。当前 AST 能表达 AND/OR/NOT，但编辑生命周期仍接近配置表单，复杂查询的修改成本高。

修复方向：稳定 React key，局部草稿在保存时一次写入；Done 明确关闭/回到结果；Run once 显示状态、诊断和结果计数；补齐逆向观察到但当前 AST/Builder 没有明确入口的关系操作（例如 OWNED BY、父/祖先后代方向），若产品决定不支持则在 UI 显式标为未实现。

### P1-7 桌面拖动仍缺少原生验证

`src/components/tana/tana-workspace-toolbar.tsx:66-74` 在 `mousedown` 后异步动态 import，再调用 `startDragging()`；壳层同时依赖 `data-tauri-drag-region`（`:78`）和 `src/components/tana/tana-workspace-shell.tsx:41` 的 88×52 隐形区域。这个实现未被浏览器测试覆盖，也没有 Tauri 原生窗口拖动验收；用户此前报告的“顶栏无法拖动”因此仍不能判定已解决。

修复方向：在已构建 Tauri 包中分别测试普通态、迷你/隐藏侧栏、专注模式、窗口控制按钮周围的拖动区域；把原生拖动调用预加载为稳定引用，避免第一次 pointerdown 依赖异步模块加载；交互控件明确标记 no-drag。

## P2：与原版逆向基线的功能覆盖差距

- `TanaViewType`（`src/lib/tana/types.ts:204-211`）没有原版 Options/命令菜单中观察到的 Lanes。
- 当前命令注册表（`src/components/tana/tana-workspace-commands.ts:1-22`）只有 21 个工作区命令；原版命令菜单观察到 100 个可用结果，并包含通知、帮助、快捷键、标签增删、Move/Move and leave reference、View/Filter/Sort/Group/Display、Open in tab、Export/Download、编辑日志和 Autofill 等上下文动作。当前实现有一部分节点/视图入口，但没有完整对齐。
- 当前顶栏主要提供搜索、检查器、更多和新建；原版顶栏观察到通知、帮助、快捷键、离线状态和页签相关入口。它们应作为后续产品范围，而不能用“命令面板存在”宣称已完成。
- AI、账号、同步、发布、外部 Calendar、API/MCP 和集成行为在原版窗口处于 `WORKING OFFLINE` 时没有验证；这些属于外部依赖排除项，不应写成当前项目的已实现或已缺陷运行事实。

## 当前审计结论

项目的 Plate 单文档、NodeId、Field-as-Node、TanaIndex 只读派生和基础 A+B 管线已经有较强的测试基础，Search Host、overflow、View 分组分页和统一创建路径的修复方向是正确的。当前不能把 F05/F06 标为完成，原因不是缺少几个控件，而是：View 的活动定义语义没有和 Search 统一、Search 结果身份模型仍在运行时被折叠、Calendar 和 per-type state 还有旁路、导航视图和 Builder 没有形成完整交互闭环。

建议实施顺序：

1. 先修 P0-1/P0-2，补充 Trash 失效定义和多 occurrence 的 Golden Scenarios。
2. 再修 P1-3/P1-4/P1-5，确保 View projection、derived relation 和所有 Search source 使用同一执行上下文。
3. 修复 P1-1/P1-2/P1-6，并让 `bun run test:ui` 全绿；专注模式和导航命名先确定单一产品契约。
4. 最后处理拖动原生验收、Lanes、顶栏上下文动作和外部依赖范围。

在这四步完成前，F05 Search Nodes 与 F06 Views 应保持“重新打开审查”状态，而不是冻结为已完成。
