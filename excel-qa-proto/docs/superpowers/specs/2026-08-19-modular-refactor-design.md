# 模块化重构设计（ESM 静态拆分）

日期：2026-08-19 · 状态：待审阅 · 对象：`excel-qa-proto/index.html`（~1400 行单文件）

## 目标与约束

- 摈弃单文件，获得真正的模块复用性（`import` 即用，非复制粘贴）；
- 纯逻辑层（data/qa）零 DOM 依赖，可在 Node 下直接单测；
- 功能零回退：现有 25/25 黄金集、双通道仲裁、标注预览等行为保持逐字一致；
- 零构建工具、零 npm 依赖（SheetJS 仍走 CDN）；代价：`file://` 双击失效，需静态服务器。

## 目录与模块边界

```text
excel-qa-proto/
├── index.html                 # 骨架 + 弹窗 + <script type="module" src="src/ui/main.js">
├── styles/main.css            # 全部样式（tokens + 组件）
├── src/
│   ├── core/
│   │   ├── store.js           # 状态单例 + subscribe/emit（替代隐式耦合）；tblState/view/arbCount 全收编
│   │   └── config.js          # LLMClient 配置的 localStorage 读写
│   ├── data/                  # 纯逻辑 · 无 DOM · 无网络
│   │   ├── mock.js            # MockData.generate（跨年 234 行 + 错误注入）
│   │   ├── excel.js           # ExcelIO：parse（表头门禁+别名建议）/ downloadMock
│   │   ├── validator.js       # Validator.run：9 类规则，{clean, issues}
│   │   └── mart.js            # Mart.build：月/季/年聚合、排行、环比同比、qOf
│   ├── qa/                    # 纯逻辑（llm.js 仅依赖 fetch，可注入 mock）
│   │   ├── query.js           # QueryEngine.run / renderLocal（含 rangeNote）
│   │   ├── nlu.js             # SPEC_HINT / buildExtractPrompt / parseSpecJSON / sanitizeSpec / ruleParse / mergeContext / resolveMonth / isVague / vagueReply
│   │   ├── llm.js             # createLLMClient({fetchImpl})：jsonMode、超时熔断、400 降级
│   │   ├── chat.js            # createChat({llm, query, nlu, store, view})：双通道仲裁、多轮记忆、模糊拦截、二次校验
│   │   └── eval.js            # EvalRunner：CASES / judge / run / runLLM
│   └── ui/                    # 仅 DOM：读 store、调模块、渲染
│       ├── table.js           # 修复前标注表 / 修复后表、排序筛选、列筛选弹层
│       ├── issues.js          # 统计卡 + 问题清单 + 筛选 chip
│       ├── chatview.js        # 消息渲染、typing、方向提示
│       ├── settings.js        # 模型设置弹窗 + 通用报错弹窗 + toast
│       └── main.js            # 装配：实例化各模块、绑定事件、启动
└── tests/
    ├── pipeline.test.js       # validator/mart/query/nlu 单测（node:test）
    └── eval.test.js           # 黄金集 headless 回归（node --test）
```

## 依赖规则（防循环）

`core ← data ← qa ← ui`，单向不许反向 import；qa 内 `chat → {llm, query, nlu}` 单向；`eval → {nlu, query, llm}`。UI 不直接碰 data 层计算，一律经 store 状态或 qa 接口。

## 关键接口（签名不变式平移）

- `Validator.run(rawRows) → {clean, issues}`
- `Mart.build(cleanRows) → mart`；`Mart.qOf/prevMonth/prevYear`
- `QueryEngine.run(spec, rows, mart) → res`；`QueryEngine.renderLocal(spec, res, mart) → string`
- `NLU.ruleParse(q, enums)` / `sanitizeSpec(s, enums)` / `resolveMonth(spec, enums, q)` / `mergeContext(spec, lastSpec, q)` / `isVague(q, spec)` / `vagueReply(enums)`
- `createLLMClient({fetchImpl}) → {chat(messages, opts), cfg, save, ready}` — fetch 可注入，Node 测试用 stub
- `createChat(deps) → {ask(q), reset()}` — view 仅暴露 addMsg/addThinking，便于 headless 测试仲裁逻辑
- `Store`：`state` + `on(event, fn)` + `set(patch, event)`；事件：`data:loaded`、`data:validated`、`chat:changed`

## 行为保持清单（验收对照）

表头门禁报错弹窗 / 原始表橙红标注 / 两段式校验按钮 / Mart 预计算 / 双通道仲裁 + stArb 计数 / 月份消歧 / 追问继承 / 模糊模板 / 占比·阈值·季度·年度算子 / 日期范围注记 / 二次校验开关 / 评测双按钮 / 排序筛选表头 / 对话重置。

## 迁移步骤

1. 建目录骨架，styles/main.css 从 `<style>` 原样抽出；
2. 按依赖序迁移 data → qa → core → ui，每步 `node tests/` 可跑（逻辑层先带测试）；
3. UI 层平移 DOM 结构与事件，Store 接线替换直接调用；
4. index.html 瘦身收尾，跑通 http.server 手工冒烟 + 黄金集双通道；
5. 删除旧单文件（保留 git 历史可溯）。

## 风险

- Store 事件化改造是最大行为差异点 → 用「行为保持清单」逐条人工核对；
- `file://` 失效需在交付说明中写明启动方式（`python3 -m http.server`）；
- 单测需把 `localStorage`/`document` stub 抽成 tests/helpers.js 复用。
