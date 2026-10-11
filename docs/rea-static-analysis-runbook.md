# REA 静态分析运行手册

更新时间：2026-10-11（Asia/Shanghai）

## 结论

问题有解决方案，但需要把 Tana Electron 包按运行边界拆开分析。当前一次性分析完整 `Resources/app` 目录会在 JavaScript 图投影阶段产生过高内存峰值；即使提高 Node 堆上限，也不适合把约 48 个 renderer chunk 和主进程一起通过 MCP 返回。主进程、preload 和单个 renderer chunk 可以独立生成完整的局部 Evidence，再用 CLI 对保存的 Evidence 做定向 trace。

REA 官方支持直接分析 Electron 的 ASAR 或展开目录；CLI 和 MCP 使用同一 application service。官方工作流也要求把完整 Evidence 保存到文件，在后续 CLI 进程中作为输入，而不是依赖一次 MCP 会话保留大型图。见 [JavaScript artifact reconstruction](https://github.com/morluto/rea/blob/main/docs/javascript-artifact-reconstruction.md) 和 [JavaScript application workflows](https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md)。

## 已验证的分层结果

### 主进程切片

输入：复制 Tana 的 `package.json` 与 `build/main.js` 到临时目录，保持 `main: build/main.js`。

- REA：`6.3.0`（当前 npm latest）
- Evidence：`ev_2b5e28f33c74ddf7d1f7bc318bbe652397cd0d605f702612747e9154e9a0e53c`
- 读取文本：`2,512,450` bytes
- AST 节点：`626,066`
- findings：`874`
- BrowserWindow：`2`
- IPC：`28` operations、`18` literal channels、`27` main handlers
- 结果文件：`/tmp/tana-main-analysis.json`

### preload 切片

输入：复制 Tana 的 `package.json`，将 `main` 指向 `build/preload.js`，只保留真实 `build/preload.js`。

- Evidence：`ev_ba033c3063fc54b7dedee27e560e003c64f27e3bd28187d64cccc1a2686e9977`
- 读取文本：`291,961` bytes
- AST 节点：`59,431`
- Context bridge API：`1`
- 暴露 API 成员：`20`
- IPC：`8` operations、`6` renderer transmissions、`2` renderer listeners
- 结果文件：`/tmp/tana-preload2-analysis.json`

### 局部 IPC trace

从主进程 Evidence 对字面量 channel `quick-capture:searchNodes` 做本地 trace：

- Evidence：`ev_b832b1a97b1ec0d54ffb80e51ca53617d110c75b9271cafcda70aa72a37d6be3`
- 匹配 seeds：`1`
- 可达节点：`224`
- 可达边：`908`
- terminal paths：`79`
- unknown/unavailable facts：`0`
- 结果文件：`/tmp/tana-trace-searchnodes.json`

这证明“先分析、保存 Evidence、再按功能 trace”可以工作；它也避免了把 178 MB 级别的完整 JSON 结果塞进一次 MCP 响应。

## 可复现命令

```sh
APP='/Applications/Tana Outliner.app/Contents/Resources/app'
SLICE="$(mktemp -d /tmp/tana-main.XXXXXX)"
mkdir -p "$SLICE/build"
cp "$APP/package.json" "$SLICE/package.json"
cp "$APP/build/main.js" "$SLICE/build/main.js"

NODE_OPTIONS=--max-old-space-size=8192 \
  npx -y rea-agents@6.3.0 analyze-javascript-application "$SLICE" \
  --artifact-format directory \
  --integrity-policy record-and-continue \
  --format json > /tmp/tana-main-analysis.json
```

后续 trace 不重新读取应用目录，直接把 Evidence 文件放进 workflow 输入：

```sh
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const application = JSON.parse(readFileSync("/tmp/tana-main-analysis.json", "utf8"));
  writeFileSync("/tmp/tana-trace-input.json", JSON.stringify({
    application,
    seed: { kind: "channel", value: "quick-capture:searchNodes", match: "exact" },
    direction: "both"
  }));
'
npx -y rea-agents@6.3.0 trace-application-feature \
  /tmp/tana-trace-input.json --format json > /tmp/tana-trace-searchnodes.json
```

renderer 侧应按入口 chunk 单独复制到临时目录运行同一命令。每个结果保留自己的 artifact digest 和 Evidence ID；不要把不同切片的节点身份直接当成同一张完整图。

## MCP 使用边界

- MCP 适合小型、定向的 native UI capture、单个 trace 或摘要查询。
- 长时间静态分析使用 one-shot CLI；CLI 的进度和结果写入文件，避免 MCP stdio 在大响应或长任务期间 `Transport closed`。
- 需要跨连接继续工作时，保留完整 Evidence 文件，并按 REA 的 evidence bundle/import 规则重新导入；不要只保留摘要。
- Evidence 中的静态关系只表示 AST 推断，不能证明运行时执行、IPC 注册可达性或默认配置。REA 官方文档明确要求把这些事实与 runtime observation 分开。

## 仍然存在的边界

分层方案解决了内存峰值和 MCP 传输稳定性，但它不会自动生成跨所有 renderer chunk 的单一完整图。要得到那张图，需要 REA 增加受控 artifact selection、磁盘 spill/streaming graph 或多 Evidence merge 能力；当前版本没有在本项目中声称这些能力已经存在。对功能逆向来说，主进程/preload 图 + 目标 renderer chunk + 原生 UI/runtime Evidence 已足够支持按功能闭环验证。
