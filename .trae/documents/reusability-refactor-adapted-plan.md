# excel-qa-proto 可复用性重构实施计划（基于 reusability-refactor-plan.md 裁剪调整）

## 一、方案适配性评估

| 原方案阶段 | 适配性 | 结论 |
|---|---|---|
| 阶段 0 探索与基线 | 部分适配：项目零构建、无 package.json/tsconfig，jscpd/madge 用 npx 临时跑，不落地依赖；测试命令改为 `node --test tests/`，无 `tsc --noEmit` | **调整后执行** |
| 阶段 1 命名去重/死代码 | 适配：已勘察出明确目标（见下） | **执行** |
| 阶段 2 单一职责 | 适配：`Validator.run` 上帝函数、`nlu.js` 混合模块 | **执行** |
| 阶段 3 破循环依赖 | 无对象：依赖图 `core←data←qa←ui` 严格单向，零环 | **跳过** |
| 阶段 4 依赖反转 | 适配且是关键：main.js 已有工厂注入雏形，需把"领域知识"反转为可注入契约 | **执行（与领域画像合并）** |
| 阶段 5 共享包下沉 | 过重：零构建单页原型，无 monorepo | **跳过** |
| （方案外）主题/规则可配置化 | 用户核心目标，原方案未覆盖 | **新增：领域画像（Domain Profile）阶段** |

**总评：** 原方案部分适配。按用户确认裁剪为：阶段 0/1/2 + 新阶段 D（领域画像，吸收阶段 4 的依赖反转思想），跳过 3/5。

## 二、现状分析（勘察结论，含证据）

- 架构：纯浏览器 ESM，`index.html:194` 加载 [main.js](file:///workspace/excel-qa-proto/src/ui/main.js)；依赖方向单向无环；测试 `node --test tests/`（node:test，3 个测试文件，25/25 黄金集）。
- 死代码：`Store.on/emit`（[store.js](file:///workspace/excel-qa-proto/src/core/store.js) 全项目零调用）；`MockData` 导出的 `STORES/CATS` 无消费者；`legacy-single-file.html`（约 1400 行遗留单文件）。
- 重复：中文数字映射 [validator.js:3](file:///workspace/excel-qa-proto/src/data/validator.js#L3) ≈ [nlu.js:117](file:///workspace/excel-qa-proto/src/qa/nlu.js#L117)；`round` [mart.js:4](file:///workspace/excel-qa-proto/src/data/mart.js#L4) ≈ [query.js:20](file:///workspace/excel-qa-proto/src/qa/query.js#L20)；枚举构建 [main.js:53-57](file:///workspace/excel-qa-proto/src/ui/main.js#L53-L57) ≈ [tests/helpers.js:10-14](file:///workspace/excel-qa-proto/tests/helpers.js#L10-L14)；问候语 [index.html:152](file:///workspace/excel-qa-proto/index.html#L152) ≈ [chatview.js:25](file:///workspace/excel-qa-proto/src/ui/chatview.js#L25)；指标中文名不一致（`qty` 一处"销量"一处"数量"）。
- 硬编码集中点（即"主题"耦合点）：表头/别名 [excel.js:2-8](file:///workspace/excel-qa-proto/src/data/excel.js#L2-L8)；清洗规则+阈值 [validator.js:17-76](file:///workspace/excel-qa-proto/src/data/validator.js#L17-L76)；NLU prompt/正则/词表 [nlu.js:12-169](file:///workspace/excel-qa-proto/src/qa/nlu.js#L12-L169)；标签表 [query.js:5-8](file:///workspace/excel-qa-proto/src/qa/query.js#L5-L8)；mock 数据 [mock.js](file:///workspace/excel-qa-proto/src/data/mock.js)；UI 文案 index.html 品牌/表头提示/示例问题。

## 三、执行计划

### 阶段 0：基线（只读 + 报告）

1. 用 npx 临时跑 `npx jscpd src --min-tokens 20 --format json --output docs/refactor/report-cpd.json`、`npx madge src --extensions js --circular`（预期无环）、`npx madge --json` 依赖图。**不创建 package.json，不安装依赖**。
2. 将勘察结论（上文死代码/重复清单）+ 工具结果汇总为 `excel-qa-proto/docs/refactor/TARGETS.md`，含基线数值。
3. 验证基线：`node --test tests/` 全绿后再动手。

### 阶段 1：死代码清理 + 重复收敛

按 TARGETS.md 逐项执行，每项完成后跑 `node --test tests/`：

1. 删除 `Store.on/emit`（store.js）；移除 `MockData` 的 `STORES/CATS` 导出及 `eval.js` 的多余 `CASES` 导出。
2. 删除 `legacy-single-file.html`（先 `grep` 确认 index.html/docs 无运行时引用；它已被模块版完全取代）。
3. 收敛中文数字映射：合并为 `src/data/cnnum.js`（取并集，含十一/十二），validator 与 nlu 共用。
4. 收敛 `round` 到 `src/core/num.js`（或并入 cnnum 同级的 `core/format.js`），mart/query 共用。
5. 统一指标中文名（qty 统一为"销量"，同步黄金集期望若有引用）。
6. 消除问候语重复：chatview 欢迎语改为从 profile 文案读取（与阶段 D 衔接，此处先抽常量到 config.js）。
7. 每项勾选 TARGETS.md。

### 阶段 2：Validator 规则流水线化（单一职责，为画像铺路）

1. 先补行为冻结测试：现有 pipeline.test.js 已覆盖七类规则，确认可作为回归网。
2. 将 [validator.js](file:///workspace/excel-qa-proto/src/data/validator.js) 的 `run()` 内联规则拆为独立规则对象数组：`{ id, level, check(ctx) → issues[] }`（数值清洗、范围阈值、日期归一、空值处理、amount 一致性各为一条）。`Validator.run(rows, rules)` 改为遍历执行，对外返回结构不变。
3. 默认规则集导出为 `DEFAULT_RULES`，行为与现状逐条等价。
4. 验证：`node --test tests/` 全绿。

### 阶段 D（新）：领域画像（Domain Profile）可配置化

目标：换一个主题 = 新增一个 profile 文件，不改核心代码。

1. **定义画像契约** `src/core/profile.js`：一个 profile 含
   - `schema`：必需字段、中文别名（excel.js 的 REQUIRED/ALIAS 迁入）；
   - `rules`：清洗规则数组（阶段 2 产物）+ 阈值 RANGE；
   - `dims`：枚举维度（门店/品类等，供 main.js 构建 enumCache 与 mock）；
   - `nlu`：指标/范围中文名、意图关键词正则、QMAP、LLM prompt 模板与 few-shot、模糊话术；
   - `copy`：品牌名、欢迎语、表头要求提示、示例问题；
   - `mock`：模拟数据生成参数。
2. **抽取零售画像** `src/profiles/retail-sales.js`：把现状所有硬编码内容原样迁入，作为默认画像（行为零变化）。
3. **消费侧改造（依赖注入，延续 main.js 工厂模式）**：
   - `excel.js`：`validateHeaders(headers, schema)`、`parse(..., schema)`；
   - `nlu.js`/`query.js`：词表、标签、prompt 从 profile 读取（工厂函数 `createNLU(profile)` 或参数传入）；
   - `mart.js`：维度聚合保持通用（已通用，仅枚举来源改 profile.dims）；
   - `mock.js`：改为 `createMock(profile)` 生成器；
   - `main.js`：顶部 `const profile = retailSalesProfile` 单点注入，传入各工厂；enumCache 由 profile.dims 构建；
   - `index.html`：品牌/提示/示例问题改为占位元素，由 main.js 启动时从 profile.copy 注入（消除与 excel.js/chatview.js 的文案重复）。
4. **验证画像可替换性**：tests 新增一个最小第二画像（如"测试用微型主题"，2 字段 2 规则），断言 Validator/NLU/Query 在该画像下工作，证明核心代码与主题解耦。
5. 验证：`node --test tests/` 全绿（含 25/25 黄金集）+ 浏览器手工冒烟（`python3 -m http.server` 打开，上传 mock、跑示例问题）。

### 收尾

- 回填 TARGETS.md 成功度量（复制簇清零、死代码清零、profile 外无主题硬编码——用 grep 校验"门店/品类/销量/价格"等词不再出现在 src 核心模块）。
- 更新 `docs/` 简要说明 profile 扩展方法（仅在用户需要时）。

## 四、假设与决策

- 保持零构建零 npm：jscpd/madge 仅 npx 临时运行，报告提交、工具不落地。
- 全部源码保持 `.js` + node:test，不引入 TypeScript/vitest/eslint。
- `legacy-single-file.html` 判定为死代码删除；若执行时发现被引用则保留并记录。
- 对外行为零变化：25 条黄金集、双通道仲裁、标注预览逐字保持（沿用既有验收清单）。
- 每次阶段提交前 `node --test tests/` 必须全绿，否则回退该步。

## 五、验证步骤

1. 每阶段：`node --test tests/`（工作目录 /workspace/excel-qa-proto）。
2. 阶段 D 完成后：新增第二画像测试通过 + grep 校验核心模块无领域词残留。
3. 最终手工冒烟：本地 http.server 打开页面，mock 上传→清洗标注→问数→设置弹窗全流程无报错。
