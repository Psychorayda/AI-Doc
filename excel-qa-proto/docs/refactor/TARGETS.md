# 重构智库（阶段0产物 + 收尾回填）

基线命令：`node --test tests/*.test.js`；jscpd/madge 经 npx 临时运行，报告在 `docs/refactor/`。

## 复制簇
- [x] A1: 中文数字映射 validator.js ≈ nlu.js → 收敛为 `src/data/cnnum.js`（CN_DIGIT 取并集 + cn2num）
- [x] A2: `round` mart.js ≈ query.js → 收敛为 `src/core/num.js`
- [x] A3: 枚举构建 main.js ≈ tests/helpers.js → 统一由 `profile.dims` 驱动（main.js:74-76 / helpers.js:17-21）
- [x] A4: 问候语/表头提示重复 → 单源 `profile.copy`，index.html 改占位由 main.js `applyCopy()` 注入
- [x] A5: 指标中文名不一致（qty 销量/数量）→ 统一为"销量"（profile.nlu.labels）
- [x] A6: jscpd 克隆 chatview.js:9-14≈18-23 → 提取 `mount()` 辅助函数

## 巨型/上帝单元
- [x] B1: Validator.run 上帝函数 → 规则流水线：`Rules.*` 工厂（dateNorm/requiredText/fillDefault/numeric/productConsistency）+ `run(raw, rules)` 仅编排
- [x] B2: nlu.js 混合模块 → `createNLU(lexicon)` 工厂：prompt/词表/阈值正则/话术全部迁入画像，引擎只留通用分析语法

## 循环依赖
- [x] 无（madge --circular 前后均为 0）→ 阶段3 跳过

## 死代码
- [x] D1: Store.on/emit 零调用 → 已删除
- [x] D2: MockData.STORES/CATS 无消费者 → 已收敛导出
- [x] D3: eval.js CASES 多余导出 → 已去掉；黄金集迁 `src/profiles/retail-cases.js`
- [x] D4: legacy-single-file.html → 已删除（docs/summary-report.html 中仅为存档文字提及，无运行时引用）

## 领域画像（方案外新增阶段，替代原阶段 3/5）
- [x] 画像契约 `src/core/profile.js`（defineProfile fail-fast 校验）
- [x] 零售画像 `src/profiles/retail-sales.js`：schema/rules/dims/nlu/copy/mock 六段全量迁入
- [x] 消费侧工厂化：createExcelIO(schema) / createMock(spec) / createNLU(lex) / createQueryEngine(lex) / createChat(...,nlu,query) / createEvalRunner(...,cases)
- [x] main.js 单点注入画像；enumCache 由 profile.dims 构建
- [x] 第二画像验证 `tests/profile.test.js`（食堂档口主题：不同表头/别名/词表/标签/规则，核心零改动）
- [x] 启动冒烟 `tests/boot.test.js`（DOM stub 下 main.js 装配 + 文案注入）

## 成功度量（基线 → 现状）
- 复制 token 数：25（1 簇）→ **0（0 簇）**（jscpd min-tokens 20）
- 循环依赖环数：0 → 0
- 核心模块（src/core、src/data、src/qa、src/ui）领域词（门店/品类/销售额/销量/单价/现制/烘焙等）：**0 残留**（grep 验证，仅余注释中的范式说明）
- 测试：13/13 → **18/18 pass**（+4 第二画像、+1 启动冒烟）

## 已知边界（v1）
- spec 结构（metric/groupBy/filters/compare/ratio）与 Mart 预计算结构（amount/qty 聚合、月/季/年桶）属核心层，画像不替换；`date` 为时间维固定字段。
- UI 展示层已画像化：table.js 列定义走 `profile.table.cols`；settings.js / issues.js 为通用界面，无领域词。
