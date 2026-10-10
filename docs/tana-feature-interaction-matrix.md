# Tana 功能与交互逆向矩阵

更新时间：2026-10-10（Asia/Shanghai）

这份矩阵把原版 Tana Outliner 的官方 Learn 目录、原生无障碍树观察和本项目实现边界放在一起。`已实测` 只表示在本机离线桌面包中看到了对应入口或状态；`目录已知`来自原版 Learn 页面文字，尚未在当前账号中执行完整交互；`待实现/验收` 是本项目需要继续对齐的行为。

## 已实测的桌面交互

| 功能面 | 原版观察到的入口与行为 | 证据等级 | 本项目对齐要求 |
| --- | --- | --- | --- |
| 侧边栏 | 顶栏单一入口循环 `完整 → 迷你 → 隐藏 → 完整`。迷你态保留 Today、Supertags、Search、Recents、AI chats、Create new、Pinned、Workspaces 图标；隐藏态移除侧栏宽度。 | 已实测：CUA 无障碍树，2026-10-10 | 继续使用单一 `sidebarMode`，不能再出现并行的收起/隐藏控制状态。 |
| 顶栏 | 后退、前进、新建页签、通知、帮助、快捷键、离线状态、设置属于窗口/工作区层；Daily notes 和 View 工具栏属于内容层。 | 已实测：CUA 无障碍树，2026-10-10 | 专注模式只保留可预测的退出入口；窗口拖动区和窗口控制不能侵入内容工具栏。 |
| 命令菜单 | `Cmd/Ctrl+K` 打开命令菜单；当前节点上下文可见 Find nodes、Add/Remove tag、Move to、Move and leave reference、View as outline/table/list/cards/lanes/tabs/calendar/side menu、Show view toolbar、Filter by、Sort by、Group by、Display、Zoom、Open in tab、Pin to sidebar、Copy/Download/Export、字段自动填充等。菜单显示结果数和键盘操作提示。 | 已实测：CUA 无障碍树，100 个命令结果 | 命令入口应复用 Plate 当前选中节点，不建立第二套节点选择状态。 |
| 快捷键面板 | 顶栏 `Keyboard shortcuts` 打开表格，按 Navigating、Editing、Formatting 分组；可见 `⌘K` 命令行、`⌘M` 打开面板、`⌃⌘M` 单面板、`⌘T/⌘W` 页签、`⌘\\` 侧栏、Tab/⇧Tab 缩进、`⌘⏎` 完成、`⇧⏎` 插入节点、`>` 创建字段、`@` 引用、`#` 标签等。 | 已实测：CUA 无障碍树，2026-10-10 | 键盘操作必须落在 Plate 官方编辑与 Toggle 行为上；快捷键不能创建平行编辑器。 |
| Today / Daily notes | 页面含 workspace、Daily notes、年、周、前一天/后一天、回到今天、按日期跳转、Google Calendar 设置和 Workspaces 入口；日节点仍是可编辑节点。 | 已实测：CUA 无障碍树，2026-10-10 | 日历日期解析使用 canonical NodeId 与字段索引，不把日期导航当成独立文档。 |
| View 工具栏 | `Show view toolbar` 展开 `Filter by name`、`Display`、`Group`、`Sorting active`、`Filter by`；`Display` 按 User-defined fields/System fields 展示复选框；`Group` 字段标注 `Global`；排序面板有字段、升降序、Remove sorting、Add sort、Reapply sort、Reset。 | 已实测：CUA 无障碍树，2026-10-10 | 视图配置是展示层状态，需按视图类型独立保存，不能覆盖 Search AST 或其他 View。 |
| View 类型入口 | 节点 Options 与命令菜单都列出 Outline、Table、Cards、Lanes、List、Calendar、Side menu、Tabs；Navigation views 是这些导航视图的分组标题。 | 已实测：CUA 无障碍树，2026-10-10 | 所有 renderer 共享同一 collection projection 与 canonical NodeId；Tabs/Side menu/Lanes 不能只换 CSS。 |
| Search/结果节点 | Search 结果行继续暴露文本输入区、复选框、标签按钮和节点按钮；通过 View 工具栏控制展示，不复制编辑文档。 | 已实测：REA MCP Evidence + CUA | Plate 文档是真相，TanaIndex 只读派生，引用编辑必须回写原节点。 |
| Search 过滤菜单 | `Filter by` 先选 Tags、字段或系统字段；Tags 子菜单区分 `Any tag`、`No tag` 和具体标签（如 `# Idea`、`# Task`）。 | 已实测：CUA 无障碍树，2026-10-10 | Search 与 View 共用字段语义解析；缺失字段必须 fail-closed 并给出诊断。 |
| 节点 Options | 普通结果节点的 Options 包含 View as、Show view toolbar、Filter/Sort/Group/Display、Appearance、Copy/Duplicate、Publish、Add tag/description/checkbox、Show progress bar、Show edit log、Delete、More commands；Search/Related content 节点还提供 `Prefer area: Content bottom/Content right`、`Remove from #Day`、`Edit related content`。 | 已实测：CUA 无障碍树，2026-10-10 | 相关内容布局是节点配置，不应绕过 canonical writer 直接操作投影。 |
| 通知与版本说明 | Notifications 打开 inbox，含 Notifications 与 What’s new；What’s new 菜单可 Mark all as read、Notification preferences。离线状态明确显示 `WORKING OFFLINE`。 | 已实测：CUA 无障碍树；未执行读状态变更 | 本项目可先提供本地状态提示；网络同步、通知读状态不属于当前 A+B 范围。 |
| Learn / 帮助 | Help 打开 Tana Learn 页面，可切换 Tana/Learn、搜索文档、Open in browser；官方目录列出 Editor、Knowledge graph、AI、Templates、Integrations 等功能面。 | 已实测：CUA 无障碍树 + Learn 页面 | 目录可作为覆盖清单，不能把帮助文档描述当作本地运行时已验证行为。 |

## 官方目录已知、当前未完整实测

| 功能面 | Learn 页面声明 | 当前状态与边界 |
| --- | --- | --- |
| 编辑器基础 | 缩进、展开/收起、重排、Zoom 到 full page；没有独立文档/文件。 | 逆向目标明确；项目受 Plate/frozen outliner 约束，需继续做键盘、拖拽和 Toggle openIds 场景。 |
| Nodes / References / Node types | 每个 bullet 是 Node；同一 Node 可多处引用；内容、引用、Search、Command、Field 等类型有不同表现。 | 原生树已看到普通节点与引用按钮；跨引用编辑与移动路径仍需 Golden Scenario。 |
| Supertags / Fields | Supertag 是带模板的类型；字段支持 text、date、number、URL、options，并可搜索、筛选、排序。 | 当前项目 Field-as-Node 模型已冻结；需要继续验证模板继承、Options 子节点和字段失效诊断。 |
| Search nodes | Live query、Query builder、结果是 references、展开 Search 时更新。 | Search host context、PARENT/GRANDPARENT、2500 上限和统一新增路径已列为 A 批次验收。 |
| Views | Outline、Table、Cards、Calendar、List、Tabs、Side menu；同一数据可切换展示。 | 已观察入口与基础设置；每视图独立配置、先分组后分页仍属 B 批次。 |
| Related content | 节点旁/下方显示 Search 或 references，可由单节点或 Supertag 模板提供。 | 已观察 placement 与 Edit related content 入口；真实布局和生命周期待验收。 |
| AI 与自动化 | Tana AI、会议记录、AI Chat、AI Agents、Command nodes、AI command nodes、AI for builders、Meeting agent、实时语音转录。 | 当前窗口离线；不触发录音、账号、网络或付费操作。 |
| Focus mode | 任意节点进入专注模式，工作区变换，退出时显示专注时长。 | 仅有官方目录和用户截图；窗口控制按钮排版、退出入口需单独做桌面构建验收。 |
| Calendar / dates | 日期节点、周/月/年、日历视图、Calendar integration。 | 本地日导航已观察；外部日历同步保持未实测。 |
| Workspaces / Library / Capture | Workspaces、Library、Capture inbox、Tana Mobile/Capture、Import workspace。 | 侧栏入口与命令已观察；导入、跨工作区移动和离线恢复未执行。 |
| Publish / Import / Export | Tana Publish、Copy-paste/export、Tana Paste、Tana Intermediate Format、从其他工具导入。 | 节点 Options 有 Publish、Copy、Download/Export 命令；没有执行会产生外部页面或文件的操作。 |
| API / MCP / integrations | API and MCP、Input API、Readwise、Google Calendar。 | Learn 目录已记录；当前逆向没有读取私有协议、OAuth 或网络请求。 |
| Account / billing | Account settings、Payment/billing/AI credits。 | 仅目录已知；不进入账号或付费流程。 |

## Golden Scenarios 覆盖映射

| 场景 | 关联功能面 | 当前证据 |
| --- | --- | --- |
| 导航三态 | Sidebar、Navigation、Focus mode | 原版三态被动观察；项目已实现循环状态 |
| Search host context | Search nodes、Daily notes、Dates | REA Search/query Evidence；项目 A 批次待跑 |
| View 配置隔离 | Views、Display、Sort、Group | 原版面板入口已实测；项目 B 批次待跑 |
| broken filter fail-closed | Fields、Search、Views | 来自源码审计与项目约束；原版行为未声称已证实 |
| 分组后分页 | Views、Group、Pagination | 原版 Group 面板已实测；执行顺序由项目 Golden Scenario 验收 |
| 统一新增路径 | Search、View editors | 原版命令/Options 有入口；项目写入策略待跑 |
| too-many-results | Search nodes、query runtime | 项目 A 批次待跑，原版离线未造出 2500+ 数据 |
| 跨 View 编辑身份 | Nodes/references、Table/Cards/Outline | 原版结果行编辑边界已实测；项目写入闭环待跑 |

## 取证限制

- 原版窗口当前为 `WORKING OFFLINE`；外部同步、账号、AI、发布、集成等行为不作为本地运行事实。
- REA 的 Electron JavaScript 应用图在 48 个打包脚本的 AST 投影阶段耗尽 Node 堆；MCP provider 重试返回 `Transport closed`，因此本矩阵不声称拥有完整静态调用图。
- 当前矩阵中的“已实测”来自原生无障碍树和已记录 REA Evidence；Learn 页面“目录已知”只用于覆盖规划。
