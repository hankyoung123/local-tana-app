# Tana 离线版编辑器一致性审计（2026-10-11）

本轮按“全面对标 Tana 的离线版本”审查编辑器架构、Plate 写入边界和跨视图交互一致性。审计基于当前工作树 `425ea97`、`AGENTS.md` 的冻结约束、源码静态检查、临时 Plate 文档复现，以及已经保存的原版行为观察记录。没有把原版的内部源码结构当作已知事实。

## 证据边界

当前实现的基础方向是对的：Plate 文档是唯一可写状态，`TanaIndex` 由文档派生且只读，顶层 NodeId 是身份边界，折叠使用 Plate Toggle 的 `openIds`，字段、引用、搜索和视图写入都经过语义插件。这部分与 `docs/architecture-freeze.md` 一致，不能把这些派生对象误报成第二份编辑器状态。

原版桌面包 `/Applications/Tana Outliner.app` 的 `Contents/Resources/app/package.json` 显示版本 `1.529.0`，`build/config.json` 将渲染地址配置为 `https://app.tana.inc`。包内的 `build/main.js`、`preload.js` 和少量 Electron UI asset 可以静态恢复出窗口、缓存、协议和 IPC 行为；包内没有 Tana Web 编辑器的完整 renderer 源码，`main.js` 末尾引用的 `main.js.map` 也不在包内。REA MCP 在分析整个包时返回 `Transport closed`，CLI 路径随后在解析 49 个 JavaScript 文件时因 V8 heap OOM 退出。这个结果只说明分析图超过当前资源边界，不能说明原版编辑器不存在或无法运行。

因此，“从二进制层面逆向出源码”的结论是分层的：Electron 主进程和 preload 可以反编译、格式化并恢复大部分控制流与字符串；内置 `.node` 原生模块只能得到反汇编/伪代码；真正的编辑器行为在此版本桌面包中由远端 Web 客户端提供，不能从这个离线桌面包直接恢复原始 TypeScript/React 源码。要继续对齐编辑器，必须使用用户拥有的运行时页面/网络响应/浏览器或 Electron 运行时证据，并把运行时观测与静态反编译严格分开。

## 高优先级发现

### P0 — 被移入废纸篓的 Field Definition 仍会扩大 View 结果

`src/lib/tana/view-projection.ts:70-72` 的 `hasUsableField` 只检查 `fieldDefinition` 是否存在，没有检查 `isTanaNodeActive`。被移到 Trash 的 Definition 仍然保留 `fieldDefinition`，所以不会产生诊断；`field-set`、`field-not-set` 和 `field-equals` 仍会继续计算。

临时 Plate 文档复现结果：将 `status` Definition 移到 `trash` 后，对 `field-set(status)` 得到 `diag=[]` 且对带有该字段值的任务 `match=true`。这与 Search 对失效字段的 fail-closed 规则不一致，也违背“失效关系不能扩大结果集”的产品语义。影响是用户删除字段定义后，保存的 View 可能继续显示旧字段结果，且没有失效提示。

修复边界应放在 View 的语义解析层：Field Definition 必须同时存在、类型正确且处于 active scope；否则返回 broken diagnostic，并让整个相关筛选 fail closed。不要在 renderer 中用额外的空结果判断掩盖这个问题。

### P1 — Calendar 在展开日期前分页，结果会随页码消失

`src/components/tana/tana-view.tsx:17-19` 先建立分页后的 `projection.items`，再把这些结果传给 Calendar；`src/components/tana/tana-calendar-view.tsx:235-237` 只从这批分页结果展开日期。`src/lib/tana/view-projection.ts:218-228,251-290` 也明确先 `paginate`，再按分页 ID 投影分组。

临时文档包含 101 个同一天的带日期任务，复现为 `items=100, pageCount=2, entries=100`。第一页的 Calendar 看不到第 101 个事件，切换页码后事件才出现。Calendar 的日期全集应从完整 filter/sort 结果展开，再对日历布局或事件组采用明确的分页策略；当前顺序把“集合分页”和“日期展开”混成一条管线。

### P1 — Block Selection 与命令菜单的目标身份不一致

`src/components/tana/tana-workspace.tsx:214-228` 只从文本选择的 anchor 读取 `selectedNodeId`，没有读取 Plate `BlockSelectionPlugin` 的 `selectedIds`。随后 `:353-395` 把该单一 ID 用于检查器、Duplicate、Trash 和 Toggle Done；Duplicate 还会强行把选择重置成一个 ID。

结果是：用户通过 Plate 的拖拽手柄选中多个可交互 Node 后，从命令菜单执行 Duplicate/Trash/Done，命令目标可能只有 anchor；在没有文本 caret 时还会回退到当前 Zoom 根节点。这个问题不是“增加一个选中列表”这么简单，命令入口、检查器目标、快捷键和 Block Selection 必须共享同一套当前目标解析策略。Plate 仍应拥有选择生命周期，Tana 只读取并应用语义权限。

### P1 — 全局快捷键在编辑控件和输入法组合期间抢占事件

`src/components/tana/tana-workspace.tsx:443-465` 在 `document` capture 阶段拦截 `Cmd/Ctrl+S/K/P/E` 和 `Shift+F/T`，但没有检查事件目标是否为 input/textarea/contenteditable，也没有检查 `event.isComposing`。这与 `src/components/editor/plugins/tana-shortcuts-plugin.ts` 已有的组合输入保护不一致。

在表格标题、字段值、Query Builder 控件或中文输入法组合状态中触发这些组合键时，工作区命令会先 `preventDefault()` 并打开全局 UI，编辑器的本地键盘语义无法完成。应先定义“编辑上下文是否允许全局命令”的统一门槛，再让 Plate/控件自身处理文本编辑和 IME 事件；不能由工作区 capture listener 无条件截断。

### P1 — 同一 View 的新增操作在不同 renderer 中改变不同的页面上下文

`src/components/tana/tana-view-actions.ts:15-34` 已经把 Search View 的新增路径收敛到 `TanaSearchPlugin.search.createResult`，这是正确方向；但 renderer 的后续交互仍然分裂：`src/components/tana/tana-navigation-view.tsx:34-39` 创建后立即 `zoom.to(nodeId)`，而 Table 的 Enter、Cards 的“添加卡片”和 Calendar 的“添加”不执行相同的 Zoom 行为。

这会让“在同一个 Search + View 中创建结果”在 List/Tabs/Side menu、Table、Cards、Calendar 之间产生不同的焦点与页面上下文。新增策略应由 Search/Source Mutation Policy 统一决定，renderer 只报告创建意图并接收结果；如果产品决定创建后留在 View，就所有 renderer 保持一致。

### P1 — List/Tabs/Side menu 仍是同一投影的三种布局，不是完整的页面组合

`src/components/tana/tana-navigation-view.tsx:12-17,44-136` 对三种类型只切换导航容器 class 和布局，内容都是一个 `NodeProjection` 加最多 12 个直接子节点；选中项的内容没有进入 Plate 编辑上下文，标签/侧菜单也没有完整的节点编辑、字段编辑、折叠和键盘导航闭环。`src/components/tana/tana-view.tsx:44` 将三种类型统一路由到这个组件。

这不是测试标签命名问题，而是产品模型仍停留在“列表 + 投影详情”的中间态。可以保留一个共享投影基础层，但需要为导航视图明确选中项、打开/编辑、焦点恢复、键盘切换、子树深度和分页的行为契约；在此之前不应把三种视图标记为与 Tana 完成对齐。

## 中优先级发现

### P2 — Projection 的标题和字段编辑不是完整 Plate 编辑体验

`src/components/tana/node-projection.tsx:218-221` 只取 canonical Node 的第一个直接 Text leaf；`ProjectionTitleInput` 是脱离 Plate selection 的原生 `<input>`，字段标量控件 `:517-535` 使用 uncontrolled `defaultValue`。当同一 canonical Node 在另一处被修改而 projection 组件未卸载时，标量输入不会跟随新的 index 值更新，用户可以在一个旧草稿上继续编辑。

这适合做轻量投影编辑，但不能与 Outliner 中的完整 rich text/inline reference/marks 编辑混称为同一编辑器体验。后续应明确哪些 View 只允许字段写入和标题短编辑，哪些操作必须打开 canonical Plate Node；同时给输入控件加 canonical value 变更后的草稿同步和焦点策略。

### P2 — Navigation view 的选中状态是 renderer 本地状态

`TanaNavigationView` 用 `useState(projection.items[0])` 保存 `selectedId`。这是 UI 选择状态，不违反文档单一真相，但当筛选、排序、分页或结果身份变化时，选择恢复规则没有持久化契约，也没有与当前 Plate selection/Zoom 对齐。切换 View 类型或返回该 View 后，当前项可能回退到分页第一项，而不是用户最后打开的 canonical Node。

### P2 — 原生窗口拖拽仍缺少可自动验证的 desktop 证据

当前实现将 `still-native-titlebar` 限制为桌面窗口左上角 88×52 区域，并对工作区 toolbar 使用自定义 `startDragging()` (`src/components/tana/tana-workspace-shell.tsx:41`, `src/components/tana/tana-workspace-toolbar.tsx:68-78`, `src/styles/still-shell.css:11-15`)。这能解释为什么窗口控制区与普通顶栏的拖拽行为容易出现边界差异，但浏览器 UI 测试不能证明 Tauri 原生拖拽是否真的成功。需要在构建后的 Tauri 桌面包中做按坐标的 mouse-down/move 验证，并同时覆盖专注模式和导航隐藏模式；在拿到该证据前，不把它升级为源码层的确定性 P0。

## 已校正的旧结论

- 之前 UI 运行的 8 个失败不能全部作为产品回归：其中 List/Tabs/Side menu 的旧断言仍期待旧版“打开 candidate”按钮，导航全屏/mini/hidden 和 Focus 测试也仍按冻结前行为断言。它们应迁移到当前交互契约。
- 窄窗口下导航收起后按钮仍显示“收窄导航”而不是“展开导航”是实际可见性问题，因为标签只读取持久化 `sidebarMode`，没有读取当前 overlay 的 `navigationOpen`；这属于 P1 的 shell 文案/状态同步问题，点击路径本身仍存在。
- Search 结果按 canonical target 去重 (`src/lib/tana/query.ts:529-549`) 目前有明确实现意图，且现有测试把它作为结果模型的一部分。没有额外的原版 occurrence 证据时，不能把它定为“丢失结果身份”的 P0；需要先确认产品是否允许同一 canonical Node 以多个 occurrence 出现。
- Search 的 `searchHostId` 已经由 View source、inline Search、Search inspector 和新增结果复评统一传入；“PARENT 完全按 candidate 解析”的旧结论不再适用于当前实现。仍需用原版动态宿主场景做运行时验收，但不能按旧代码审计直接判定为已知缺陷。

## Golden Scenarios 验收矩阵

| 场景 | 当前状态 | 证据/缺口 |
| --- | --- | --- |
| Project 下创建 Search，使用 PARENT 查询任务 | 部分通过 | Search host 已传入 `searchHostId`；缺少原版运行时的动态日期宿主验收 |
| Search → Table 修改标题/字段 → Cards 分组 → 返回 Outline | 部分通过 | canonical Field/Title writer 可复用；需要验证 View 状态、焦点和新增上下文是否保持 |
| 删除 Field Definition 后，Search/View 都 fail closed | Search 通过，View 失败 | View 对 Trash Definition 的复现见 P0 |
| 101 个日期结果在 Calendar 中完整展开 | 失败 | 分页先于日期展开，复现 100/101 |
| 多选节点后执行 Duplicate/Trash/Done | 未通过架构检查 | Workspace 命令只读取 anchor ID |
| Table/Cards/Calendar/List 新增结果的焦点和页面上下文一致 | 失败 | Navigation renderer 会额外 Zoom |
| 中文输入法组合期间触发全局快捷键 | 未通过交互契约 | capture listener 无 IME/编辑目标门槛 |
| 专注模式、mini/hidden sidebar、desktop drag | 未完全验收 | 需要 Tauri 构建后坐标级测试；旧 UI 断言已过时 |

## 验证记录

已有仓库验证：`bun test` 437 pass / 0 fail，`bun run typecheck`、`bun run lint`、`bun run build`、`cargo test` 和 `cargo check` 通过；`bun run test:ui` 为 63 个场景中 55 通过、8 失败，其中多数失败是旧交互契约断言。此次新增的临时复现测试在运行后已删除，没有改变生产源码。

下一步应先修正 P0 View active-scope 解析、统一 workspace command target 与全局键盘门槛，再重构 Calendar 的集合/日期投影顺序和各 View 的新增上下文；随后以 Golden Scenarios 作为跨 renderer 的验收入口，而不是继续按单个按钮或静态组件存在与否判定完成。
