# Supertag 原版对齐审计

日期：2026-10-11  
源码基线：`a0029d5` (`fix: align editor and view interactions`)  
范围：Supertag 的数据模型、模板/继承、字段生命周期、实例页、配置页、标签交互、Search/View/Reference 投影与编辑闭环。

## 证据与方法

本审计使用了 `$reverse-engineer-anything` 的分层方法：先确定目标和版本，再把原版运行时观察、已保存的 REA 静态证据和当前源码审计分开记录。证据标签如下：

- **运行时观察**：通过 CUA 直接操作本机 `/Applications/Tana Outliner.app`，版本 1.529.0，观察日期 2026-10-11。原版处于 `WORKING OFFLINE`，但 Supertags 页面和配置面板可打开。
- **静态证据**：当前仓库源码、测试、`docs/tana-reverse-study.md` 中已保存的原版证据 ID，以及此前对 Electron 包的 REA 分片分析。
- **推断**：由控制流、数据边界或测试缺口推导出的风险，报告中会明确标注；未把推断写成已验证的原版行为。

本轮调用 REA MCP 时服务端返回 `Transport closed`。`rea-agents@6.3.0 doctor --client codex --json` 显示 Codex 注册与 skill 版本对齐，但当前客户端需要重连，且 Hopper/Ghidra/IDA provider 不可用。因此本报告不虚构新的完整内部调用图；Electron 的静态结果仍采用既有的 main/preload/renderer 分片证据。REA 的这个限制不影响本轮对当前源码和原版 UI 的审计，但会限制“从二进制还原源码”的结论精度。

原版公开行为也以 [Supertags 官方文档](https://outliner.tana.inc/learn/features/supertags)、[Fields 官方文档](https://outliner.tana.inc/learn/features/fields)、[Related content 官方文档](https://outliner.tana.inc/learn/features/related-content) 和 [Extend 官方指南](https://outliner.tana.inc/learn/guides/when-to-use-extend-in-supertags) 交叉核对。

## 结论

当前项目的底层方向是正确的：Plate 文档是唯一编辑真相，Supertag membership、Definition、继承和字段模板都落在带 NodeId 的普通 Node 上，TanaIndex 负责派生。这一基础符合仓库冻结约束，也比另起一套 Supertag 数据库更接近 Tana。

但当前实现还不能称为“离线 Tana 的 Supertag 对齐实现”。主要原因有两类：

1. **语义边界仍可被写坏**：`define`、默认子标签、继承、字段候选和模板解析没有统一的 active/semantic host 检查；回收站或坏数据可以继续影响字段和候选结果。模板子树克隆还存在路径漂移风险。
2. **产品页面模型明显缩水**：原版把 Supertag 作为“实例集合 + 多个视图 + 完整 Schema 配置”来使用；当前只有一个派生表格页和一个三标签 Inspector，缺少配置生命周期、模板编辑工作流、视图工具栏和投影中的标签编辑闭环。

按风险排序，最先应修复的是：

- P0：禁止把系统节点、字段/值节点、Search/View 节点定义成 Supertag；统一 active 语义边界。
- P0：修复模板 direct subtree 克隆的路径漂移，并补目标节点位于模板之前的测试。
- P0：修复 Supertag 页面上的“添加行”无效入口，统一到 Supertag-owned `createInstance`。
- P1：补齐实例页/配置页模型，至少让配置项、字段模板和实例视图拥有清晰生命周期。
- P1：把 Search/Table/Cards/Reference 中的静态 `#tag` 文本改成统一的可编辑标签入口。

## 一、原版运行时基线

### 1. Supertags 总览

原版点击左侧 `Supertags` 后显示：

- `Browse templates` 模板区：Task、Meeting、Brainstorm、Article、Weekly reflection、Daily prep、Memo。
- `Filter tags` 搜索/过滤入口。
- 按 Workspace 分组的标签列表，并显示标签名称和实例数量。
- 标签页头部仍保留 Back、内容宽度控制等全局页面动作。

这不是一个只列 Definition Node 的侧栏。它是进入 Schema、实例集合和模板库的入口。

### 2. 标签实例页

打开 `Task` 后，原版显示：

- 页面标题、图标、Banner、复选框和 `Create new`。
- 一组已保存快捷视图：`rd`、`Task calendar`、`All tasks`，以及 `Add view`。
- 当前视图的 Search/query 文本：`Not done or done last 7 days`。
- 表格/分组列：`Backlog`、`In progress`、`Done`、`Task status not set`，每组都有 Add/Hide column 动作。
- 实例行可继续编辑，行内保留 `Remove tag from item # Task` 之类的标签关系动作。

这说明原版的 Supertag 页面不是“Definition Node 的直接子节点列表”，而是一个由标签 membership 驱动、可切换保存视图的 collection surface。

### 3. 标签 Options 菜单

原版标签页的 Options 菜单包含：

`Configure supertag`、`Unpin tag`、`Copy node link`、`Copy`、`Duplicate`、`Move`、`Add tag`、`Add description`、`Show edit log`、`Delete`、`More commands`。

`Delete` 与原版文档描述一致：删除前显示使用次数，保留已有引用/标签关系的可见性，并允许后续彻底删除。

### 4. 完整配置面板

打开 `Configure supertag` 后，原版在右侧打开独立配置面板，而不是用一个简化 Inspector 覆盖页面。面板包含以下折叠区：

- **Building blocks**：Base type、Extend other supertags，以及继承说明。
- **Content template**：Default content、`Extend from`、字段的默认值、pinned、Optional fields、New field、Insert existing field、Show checkbox、Done state mapping。
- **AI and Commands**：autofill、audio-enabled、compact/full menu、事件触发命令、AI instructions。
- **Voice chat**：assistant greeting 和 instructions。
- **Advanced options**：Build title from fields、Default child supertag、Related content、Shortcuts、Building block promotion。

实际观察到的 Task 配置包括：

- `Task status` 默认值为 `Backlog`。
- `Due date` 有 Default value/Choose date。
- Checkbox 状态映射为 `Task status = Done` 或 `Backlog, In progress`。
- Title expression 输入框、默认子标签选择器、related content、快捷视图列表、building-block 建议标签。
- 底部 `View all 21 instances` 与 `Delete / Used 21 times`。

公开文档还确认：输入 `#` 会打开创建/选择标签菜单；可把普通节点转换为 Supertag；可单个或批量 Add/Remove tag；标签支持颜色；删除 Definition 时已有引用不会自动消失。上述交互应作为本项目的对齐基线。

## 二、当前实现地图

| 区域 | 当前实现 | 评价 |
|---|---|---|
| Definition 数据 | `SupertagDefinition` 只有 `defaultChildSupertagId`、`extends`、`titleExpression`（`src/lib/tana/types.ts:250-256`） | 基础语义够用，配置面严重不完整 |
| 继承 | `getSupertagInheritance` parent-first、cycle-safe；writer 也拒绝自环和闭环 | 方向正确，但没有统一 active/broken 诊断 |
| 模板字段 | Field-as-Node，模板字段由 Index 派生；首次 apply 时物化 | 符合冻结模型；现有实例的模板变更生命周期不完整 |
| 实例页 | `TanaSupertagPage` 派生 active instances，附带直接内容子节点导航 | 只是简化表格，不是原版 collection/view 页面 |
| 配置页 | Inspector 三个 tab：信息、字段、关联 | 能编辑少量配置，缺少完整 Schema 面板 |
| 标签投影 | `node-projection.tsx` 将标签渲染成静态 `span` | 破坏 Search/View/Reference 编辑闭环 |
| 写入入口 | 插件提供 create/define/apply/remove/createInstance/from-supertag | 数据变换覆盖较广，但边界和原子性有缺口 |
| 测试 | `src/lib/tana/supertag.test.ts` 强于数据不变量 | 缺少页面、键盘、投影、焦点和失败路径验收 |

## 三、详细发现

### P0-1：`define` 没有遵守 Supertag host 边界

**证据（静态源码）**：`src/components/editor/plugins/tana-supertag-plugin.ts:219-235` 的 `define` 只排除 Reference 和已有 Definition，未排除 `system`、Field Definition、Field occurrence、Value、Option、Search、View 等结构节点。相邻的 `convertToSupertag` 已经有更严格的候选检查（约 `:699-723`），说明两条入口的语义边界不一致。

**影响**：用户或未来命令可以把结构节点定义成标签。之后 `TanaIndex` 会把它们当作可搜索、可继承、可作为字段来源的 Definition，破坏 AGENTS.md 中“Field-as-Node”和“普通节点/结构节点边界”。

**修复方向**：抽出一个唯一的 `isTanaSupertagDefinitionHost`/`canDefineSupertag` 谓词，所有 create/define/convert、批量命令、UI picker 共用；失败返回诊断而不是静默 no-op。

### P0-2：回收站/缺失 Definition 的 active 语义没有贯穿 Index、Fields 和 candidates

**证据**：

- `src/lib/tana/index.ts:60-89` 的 `getSupertagInheritance` 只判断 `supertagDefinition` 是否存在，不判断节点 active。
- `src/lib/tana/fields.ts:516-590` 的 `getDirectSupertagTemplateFields`/`getSupertagTemplateFields` 会继续合并这些 Definition 的模板。
- `src/lib/tana/fields.ts:737-742` 会据此把实例字段标记为 `source: 'supertag'`。
- `src/lib/tana/field-candidates.ts:56-57` 对 `from-supertag` 直接读 `nodesBySupertag`，没有先验证 source Definition active。
- `src/components/editor/plugins/tana-supertag-plugin.ts:288-310,342-383` 的 default-child 读写只检查 Definition 是否存在，不拒绝 trashed Definition。

**影响**：同一个被删除/回收的标签，在 Query/View 中可能被当作 broken 而 fail-closed，却仍然向节点 Inspector 注入字段、向 from-supertag 字段提供候选，形成跨子系统语义不一致；默认子标签也可能指向回收节点。

**修复方向**：在语义解析层区分 `live`、`trashed`、`missing`、`invalid`，统一 fail-closed + diagnostic。保留历史 membership 时可以继续显示“已移至回收站”，但不得把失效 Definition 当成有效模板或候选源。补充“回收→恢复”和“永久删除→保留历史 membership”的明确测试。

### P0-3：模板子树克隆存在路径漂移风险

**证据**：`src/components/editor/plugins/tana-supertag-plugin.ts:74-95` 预先收集模板子树路径；`100-170` 随后逐个插入克隆。插入第一个子树后，模板和后续 source path 可能发生位移，而循环仍使用旧路径。现有测试主要覆盖“模板源节点位于目标之后/模板顺序有利”的情况，没有覆盖 Home 在 Schema 之前、目标位于模板之前且有两个 direct subtrees 的情况。

**影响**：一次 apply 可能把后续模板复制成错误节点，丢失字段关系或克隆到错误子树。该风险属于 canonical Node identity 错误，比单纯 UI 排版问题严重。

**修复方向**：在插入前把所有 source subtree 深拷贝为纯数据快照，并基于快照生成 idMap；或从后往前插入，使 source path 不被前面的插入改写。新增 target-before-template、多个 direct subtree、嵌套 Field/Reference 的 Golden test。

### P0-4：Supertag 实例页的添加入口实际无效

**证据**：`src/components/tana/tana-supertag-page.tsx:52-100` 将 Definition Node 本身传给 `TanaTableView`（`view={node}`），但该 node 通常没有 `viewDefinition`。`src/components/tana/tana-view-actions.ts:21-29` 的 `createTanaViewNode` 在没有 `viewDefinition` 时直接返回；而 Table 的 Add row/Enter 入口位于 `src/components/tana/tana-table-view.tsx:680-689,783-791`。页面另有 `新建实例` 按钮调用 `createInstance`，造成同一页面两个新增入口路径不一致。

**影响**：用户看到可操作的表格新增入口，但操作没有效果；这比缺少按钮更难发现。成功的新建实例按钮也丢弃 `createInstance` 返回的 NodeId（`tana-supertag-page.tsx:87-92`），没有 focus/zoom 新节点。

**修复方向**：Supertag 页面显式创建 collection/view definition，或让 TanaTableView 接收 `createInstance` policy；所有新增入口统一委托 `TanaSupertagPlugin.supertag.createInstance`，成功后 select/focus/zoom 到 canonical instance。

### P1-1：当前页面模型不是原版的实例集合 + 保存视图

**证据**：`TanaSupertagPage` 只计算 `getActiveSupertagInstances`，将 direct canonical children 变成横向按钮，没有 `TanaTableToolbarControls`、Filter/Display/Group/Sort、保存视图切换或日历视图；当前 `SupertagDefinition` 也没有 per-view state。

**影响**：Task 这样的原版标签无法复现 `rd`、calendar、All tasks 等视图；用户在 Supertag 页面上不能以同一批 canonical nodes 切换展示方式，也不能保留每个视图自己的排序、分组和字段配置。

**修复方向**：把 Supertag 页面看成 collection surface：Search/Source 决定 canonical result set，View 只保存展示配置。每个保存视图拥有独立的 filter/sort/group/visible fields/pagination 状态，不能把 Cards 的配置写回 Table。

### P1-2：配置面只覆盖三小块，缺少原版 Schema 生命周期

**证据**：当前 Inspector 只为 Definition 提供 `信息/字段/关联`（`src/components/tana/tana-inspector.tsx:131-147`），内容由 `:347-455`、`:524-583`、`:585-638` 实现。缺少原版的颜色、图标、Banner、描述、Base type、Extend from、Insert existing field、默认值、Show checkbox、Done state mapping、AI/Voice、Related content、Shortcuts、Building block、使用次数和删除生命周期。

**影响**：用户可以创建一个“有字段的标签”，却无法在页面上完成原版最关键的 Schema 工作流；已有底层 title/extends/default-child 能力没有被组合成可理解的配置体验。

**修复方向**：先按原版面板结构补齐信息架构，再决定每项如何落回现有 Node/Field-as-Node 模型。配置项不得创建平行 editor/state；应将可持久化语义落在 Definition Node 或其普通子节点，视图/展开状态才放 UI state。

### P1-3：投影中的标签只是静态文本

**证据**：`src/components/tana/node-projection.tsx:244-334` 把 `target.supertagIds` 渲染为 `<span>#标签</span>`；`src/components/ui/supertag-node.tsx:95-137` 的 inline token 只能打开 host inspector/hover 移除，不能统一打开标签页或 tag picker。

**影响**：Search、Table、Cards、Reference 中显示了标签，却不能在结果行上 Add/Remove、打开 Definition、查看标签实例页或用键盘完成同一动作；用户必须回到 Outline 才能修改 membership，canonical writer 的能力没有贯穿所有投影。

**修复方向**：实现一个共享 `SupertagControl`：读取 canonical NodeId，点击打开 tag page/inspector，菜单支持 Add/Remove/Create/Convert，批量选择复用同一 writer；投影只负责呈现和把动作委托给 canonical writer。

### P1-4：模板变更没有完整实例生命周期

**证据**：`applyInBatch`（约 `:410-530`）只在首次 apply 时 materialize 字段和模板子树。`setOptional`、`setPinned`、`setInitializer`、`setExtends` 修改的是模板 Node/Definition；`getNodeFieldDescriptors`（`src/lib/tana/fields.ts:714-764`）只遍历已经存在的 occurrence，不会把新增模板字段补到已有实例。现有测试验证首次 apply 和继承合并，但没有“已有 21 个实例后新增必填字段/继承字段”的行为测试。

**影响**：Schema 修改后，新旧实例可能拥有不同的物化结构；Inspector 可能不显示新字段，或者默认值/optional/pinned 只对新实例生效。原版是否实时回填需要进一步运行时验证，但当前实现没有明确的 refresh/materialization policy。

**修复方向**：定义模板版本/物化策略：首次应用、显式 refresh、自动补齐分别是什么；补充 old-instance/new-instance、undo/redo 和 inherited field 的 Golden scenario。Related content 的 materialization/refresh 已由官方文档明确存在，应沿用同样的显式生命周期思路。

### P1-5：默认子标签的多标签优先级是隐式的

**证据**：`getDefaultChildSupertagId`（`src/components/editor/plugins/tana-supertag-plugin.ts:288-310`）按 `owner.supertagIds` 数组顺序和继承反序遍历，没有持久化优先级字段、UI 解释或测试。

**影响**：同一个节点挂多个标签时，默认子标签取决于 membership 数组顺序；批量添加/删除、恢复历史或 merge 可能改变数组顺序，导致 Enter 创建出的子节点类型变化。

**修复方向**：明确规则并测试：标签顺序是否就是优先级，还是 Definition 自身优先、继承父标签次之；在 UI 显示冲突并允许选择。

### P1-6：实例和 From-Supertag 创建不是原子失败

**证据**：`createInstanceInBatch`（`:600-630`）先把普通节点插入 Home，再调用 `applyInBatch`；失败只把返回值设为 `undefined`，没有明确删除已经插入的节点。`createSourceInstanceAndAssign`（`:648-696`）也可能先创建来源实例，再在 materialize/setValue 失败后返回 undefined。

**影响**：字段源无效、模板坏损或历史数据异常时，用户得到孤儿节点，且 UI 只看到“创建失败”。

**修复方向**：预检所有 definition/source/template 条件；或在同一 Plate batch 内保留插入路径并在失败时回滚；测试坏 Definition、trashed source、materialize 失败和 undo。

### P1-7：From-Supertag 的创建能力没有 UI 入口

**证据**：底层 `createSourceInstanceAndAssign` 有实现和测试，但源码搜索未发现 Inspector、Table、Projection 调用入口。当前 UI 只能选择已有 candidates。

**影响**：即使数据层支持“在字段处新建来源标签实例并立即赋值”，用户也无法完成该工作流；如果原版字段候选菜单允许创建，这属于功能不可达。

**修复方向**：在 from-supertag 候选选择器中加入 `新建来源实例`，创建于 Home，成功后立即写 Value，并显示 source tag 的失效诊断。

### P1-8：继承、坏循环和永久删除缺少一致诊断

**证据**：`getSupertagInheritance` 有运行时 cycle guard，但如果持久化坏循环在 Index 建立时尚未被 Integrity 修复，`fields.ts:571-590` 仍可能按当前遍历结果合并模板。Integrity persistence validation（约 `tana-integrity-plugin.ts:725-847`）验证形状和 cycle，但没有 active/trash 语义；注释还保留永久删除后的历史 membership。另有 `missing-supertag-membership` 类型，却没有在 `validateNode` 中完整发出对应诊断。

**影响**：渲染、字段解析和完整性修复的先后顺序会改变结果；用户可能先看到一组字段，稍后 Integrity 才修正。历史 membership 保留是可以接受的产品选择，但必须和“不可作为有效模板/候选”区分。

**修复方向**：Index 在异常图上 fail-closed；Integrity 负责报告和修复，不让渲染依赖修复时序。将 `missing/trashed/invalid` 状态显示为 unavailable，而不是静默当作有效标签。

### P2-1：Remove 的返回值与实际副作用不一致

`src/components/editor/plugins/tana-supertag-plugin.ts:548-582` 即使删掉了 stale presentation token，也可能因为 membership 已不存在而返回 `false`。调用方无法区分“membership 没有变化但修复了坏 token”和“什么也没做”，这会影响命令反馈和测试。

### P2-2：标签候选排序和键盘交互未对齐

`src/lib/tana/index.ts:611-625` 以 `nodesById` 遍历产生候选，没有最近使用、层级、继承信息或快捷键元数据；`src/components/ui/supertag-node.tsx:144-225` 只覆盖搜索和精确创建。现有 block context menu 虽支持 Add/Remove/Convert，inline 和 projection 没有复用同一入口。需用原版运行时逐项核对候选排序、Enter/Escape/IME、批量菜单行为。

### P2-3：Title expression 只有写入，没有编辑反馈

`src/components/tana/tana-inspector.tsx:585-613` 仅在 blur 时调用 `setTitleExpression`，没有即时语法检查、预览、字段缺失提示或与原版页面标题的联动反馈。title expression 的解析本身是派生逻辑，输入编辑应显示可解释的错误状态。

## 四、当前实现的正向基础

以下部分应保留，不应通过第二套编辑器或 projection document 重写：

- `Plate` 仍是唯一文档/编辑真相。
- Supertag Definition、membership、Field occurrence、Value、Option 都是普通 Node，有稳定 NodeId。
- `TanaIndex` 是只读派生层，继承字段使用 parent-first 合并，同 fieldId 可由子标签覆盖。
- Reference 只保留一跳 canonical target，apply/remove 会 canonicalize projection target。
- writer 使用 Plate transform/batch，cycle/self rejection 已有基础测试。
- trash/restore、batch add/remove、undo、title expression、source instance 等数据层行为已有覆盖。

修复应围绕这些边界补齐语义，不应创建独立的 Supertag JSON store、第二个 collapse/visibility store 或第二个编辑器。

## 五、Golden Scenarios 验收集

以下场景用于后续 A+B 重构和 UI 验收。每个场景都要求检查 canonical NodeId、Index 派生结果、页面反馈和 undo/redo。

### A. 标签创建和编辑闭环

1. 普通节点输入 `#`，候选可搜索；Enter 选择已有标签；Esc 关闭；IME 输入不误提交。
2. `#` 输入新名称可创建 Definition，并插入到 Schema；同名/大小写归一化只产生一个 Definition。
3. 点击任意 Outline、Search、Table、Cards、Reference 中的标签，打开同一个 Definition/page；菜单支持 Add、Remove、Create、Convert。
4. 多选节点批量 Add/Remove 后，所有 projection 同步更新，单次 undo 恢复 membership 和 presentation token。
5. 把普通节点 Convert 为 Supertag，保留原有 canonical children 和字段语义，不把结构节点转成 Definition。

### B. Schema 和模板

1. 打开 Definition 后可看到 Base type、Extend、Default content、Optional fields、pinned、Insert existing field、Show checkbox、Done mapping、title expression、default child、related content、shortcuts、使用次数/删除。
2. 新建必填字段、可选字段、默认值、current-date initializer，应用到新实例后结构正确。
3. 已有实例之后新增/删除/继承字段，按明确的 materialization policy 更新或显示诊断；旧实例、新实例和 undo/redo 结果一致。
4. A→B 继承时，B 显示 effective schema、覆盖字段和冲突；循环、自继承、回收父标签均 fail-closed。
5. target 位于模板 source 之前，模板含两个 direct subtree 和嵌套 Field/Reference，apply 后每个 clone 的 NodeId、indent、Field relation 都正确。

### C. 实例页和视图

1. Definition 页的顶部“新建实例”和表格 Add row/Enter 都进入同一个 `createInstance` writer，实例写入 Home，并返回 NodeId 后 focus/zoom。
2. `Task` 的多个保存视图可以切换；Table 的 sort/visible fields 不污染 Cards 的 group/field 配置；Outline、Table、Cards、Calendar 使用同一 canonical result set。
3. Search/View/Reference 行内标签可编辑，字段 cell 修改后 Outline、其它 View、实例页即时一致。
4. From-Supertag 字段可搜索已有来源实例，也可从候选菜单新建来源实例并立即赋值；source 标签回收/删除时 fail-closed 并显示诊断。

### D. 删除和恢复

1. 删除 Definition 前显示使用次数；已有 membership 不按同名标签重绑定。
2. 回收后 token、sidebar、field candidate、query/view filter 都显示 unavailable/diagnostic，不把 trashed Definition 当作有效模板。
3. 恢复原 NodeId 后 membership、字段候选和页面重新可用；永久删除的历史 membership 保留策略有明确 UI/Integrity 结果。

### E. 交互与历史

1. 配置面板打开/关闭不丢失当前页面和 focus；字段、继承、颜色、title expression 的每次修改都能一步 undo/redo。
2. 创建失败、坏模板、坏 source、循环继承不会留下 Home 孤儿节点。
3. 键盘导航、Enter/Escape、标签选择器、bulk action 与原版菜单的可达性一致。

## 六、建议的实施顺序

### A — Semantic correctness

- 建立统一的 Definition host、active、trash、broken resolution API。
- 修复 `define`、default-child、extends、title-expression、from-supertag candidate/source writer 的边界检查。
- 修复模板 clone 的快照/插入算法和失败回滚。
- 明确多标签 default-child precedence。
- 让 Index/Fields/Search/View 对 missing/trashed/invalid 使用同一 fail-closed 规则。

### B — Collection and schema model

- 为 Supertag 页面引入显式 collection/view model；每个保存视图独立保存展示配置。
- 明确模板变更的 materialization/refresh policy，不复制第二份文档。
- 将原版配置面板中可持久化部分映射到 Definition Node、Field-as-Node 或普通配置子节点；UI 展开、焦点和临时预览留在 React/Plate UI state。
- 用 Golden Scenarios 覆盖 target-before-template、坏数据、旧实例更新、source instance 和删除恢复。

### C — Interaction parity

- 统一 inline/projection/context 的 SupertagControl 和 tag picker。
- 重做实例页的 Add row、focus/zoom、视图 toolbar、分组/日历入口。
- 按原版配置面板补齐 fields、checkbox mapping、title preview、related content、shortcuts、used count/delete 等交互。
- 最后再处理 AI/Voice/building-block 等较大配置域，并为未知的原版行为保留可验证标记。

## 最终判断

当前项目可以作为 Supertag 重构的可靠底座，但不能以“Supertag 已完成”冻结。数据层已有不少正确实现，主要差距集中在语义 fail-closed、模板生命周期、实例集合视图和配置页面。下一轮应先完成 A+B，再用本报告的 Golden Scenarios 进行原版运行时对照；在 REA MCP 重连前，不应宣称已从二进制恢复出原版完整源码或内部调用图。
