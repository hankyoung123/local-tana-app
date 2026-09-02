# Local Tana UI/UX 产品层设计

## 设计方向

采用克制、安静、信息密度高的“本地知识工作台”风格。界面以暖白、石墨和苔绿色为主，内容优先，操作在 hover 或 focus 时出现。侧栏、正文和 Inspector 使用一致的间距、圆角和语义色，不增加装饰性卡片堆叠。

## Node 展示入口

所有顶层 Tana Node 继续经过 Plate 的统一 block wrapper。Wrapper 负责 gutter、折叠、缩放、选择态、拖拽态和 hover actions；`NodeRendererRegistry` 只提供真正不同的 semantic presentation。普通 Node、Field Definition 和 Option 使用默认正文表现；Field、Value、Supertag 和 View 提供特化展示。

这条链路不保存 semantic type，也不创建 UI projection：

```text
Plate Node
  → getNodeSemanticType()
  → Node wrapper
  → optional semantic renderer
```

## Field 正文体验

Field occurrence 与 Value 保持两个真实 Node。视觉上使用相邻 Node 布局把它们组合成单行：左侧是由 Field Definition 动态派生的名称，右侧是 Value Node 的编辑区。两者仍分别拥有 NodeId、选择、拖拽、历史和导航能力。

Plain 与 Number 保留 Plate contenteditable。Checkbox、Date、Options、From Supertag 使用轻量控件，通过 `TanaFieldPlugin` 写回 Value Node。Options 候选始终来自 Field Definition 的直接子 Node；From Supertag 候选始终来自 TanaIndex。Field hover actions 只提供聚焦值、清空和隐藏，不建立第二套 Field row 状态。

## Inspector

Inspector 展示当前 Node identity、semantic 摘要、Field 来源和系统关系。普通 Node 显示系统字段、标签字段和自定义字段；Supertag Definition 将直接子 Field occurrences 解释为模板字段；Field Definition 显示类型及 Option/From Supertag 配置；View Definition 复用现有查询编辑器。

Inspector 只读取 TanaIndex，并通过现有 Plate plugins mutation。面板开关、输入草稿和搜索弹层属于临时 React UI 状态，不持久化为业务 Store。

## 快捷与验证

工作区提供 `Cmd/Ctrl+P` 打开全局 Node 搜索；编辑器内部的 Enter、Tab、Shift+Tab、Selection、DnD 和 History 继续由 Plate 负责。验证覆盖 Field 单行展示、结构化 Value 写入、Option hierarchy、Inspector 配置、搜索快捷键以及 Web/Tauri 构建。
