# TS 项目可复用性重构实施方案

> **For agentic workers（执行说明）:** 本方案按任务逐条推进，任务使用 `- [ ]` 复选框追踪。建议由子代理按任务执行、任务间人工 review。执行前必须先完成 `阶段 0`，用其产物（真实路径、基线报告）替换本方案中的 `<PROJECT_ROOT>` 与示例路径。

**目标（Goal）：** 将既有 TypeScript/JavaScript 项目从"能跑"重构为"可复用、低耦合、边界清晰"，分 5 层推进：命名去重 → 函数/组件单一职责 → 模块边界 → 接口/契约依赖反转 → 共享包下沉。

**架构（Architecture）：** 采用"先探后改、层层推进"：先建立可量化的基线与代码资产清单，再按复用阶梯由内向外逐层重构，每层以"信号定位 → 配方改造 → 验证 + 提交"闭环，杜绝一次性大重构。

**技术栈（Tech Stack）：** TypeScript/JavaScript；工具：`typescript`、`eslint`、`vitest`、`jscpd`、`madge`、`knip`、`eslint-plugin-boundaries`；包管理按你的实际使用（`npm` / `pnpm` / `yarn`，下文以 `npm` 为例，其余等价替换）。

**约定：**
- `<PROJECT_ROOT>`：项目根目录（含 `package.json` 的位置），阶段 0 解析为真实绝对路径。
- `src/`：源码根。若你的真实目录不同，用阶段 0 的清单统一替换。
- 每个任务结束后做一次成型提交；不允许"改完一批再提交"。

---

## 阶段 0：探索与基线（必须先执行）

> 目标：建立代码资产清单、度量基线与风险地图，为后续任务提供真实路径和优先级依据。本阶段只读不改。

### Task 0.1：确认工程入口与脚本

**Files：**
- Read: `<PROJECT_ROOT>/package.json`
- Test: `<PROJECT_ROOT>/tsconfig.json`、`<PROJECT_ROOT>/src`

- [ ] **Step 1：读取工程配置**

```bash
cat <PROJECT_ROOT>/package.json
cat <PROJECT_ROOT>/tsconfig.json 2>/dev/null
ls <PROJECT_ROOT>/src
```

Expected：看到 `scripts` 里的 test/lint/build、`src` 目录结构。

- [ ] **Step 2：锁定真实的源码根与测试命令，写入你的记忆上下文**
  - 如果 `package.json` 里没有 `test` 脚本或没有测试框架，将阶段 2 以后的"验证"命令改为 `npx tsc --noEmit`（仅类型检查）。

- [ ] **Step 3：提交基线认知（如有 git）**

```bash
git -C <PROJECT_ROOT> rev-parse --show-toplevel
git -C <PROJECT_ROOT> status --short | head -50
```

Expected：确认当前分支干净或明确未提交改动，避免重构混入无关变更。

### Task 0.2：跑复制检测，生成风险清单

**Files：**
- Create（报告产物）: `<PROJECT_ROOT>/docs/refactor/report-cpd.json`
- Create（报告产物）: `<PROJECT_ROOT>/docs/refactor/report-complexity.txt`

- [ ] **Step 1：安装检测工具（开发依赖）**

```bash
cd <PROJECT_ROOT>
npm install -D jscpd eslint-plugin-boundaries madge
```

- [ ] **Step 2：运行复制检测**

```bash
npx jscpd src --min-tokens 20 --output ./docs/refactor/report-cpd.json --format json
```

Expected：若存在重复会有报告；若无输出且命令退出码 0，说明该阈值下无显著复制，将此结论记录到 Task 0.3 的智库中。

- [ ] **Step 3：记录重复簇**
  对报告中每个 `duplicationA/B` 记录三要素：**复现的一切片段所在文件集合**、**重复的可用片段大小（估算行数）**、**所属业务域（如订单/用户/风控）**。同名业务域内成簇的重复 = 阶段 1 优先目标。

- [ ] **Step 4：跑圈复杂度，识别"巨型函数/上帝类"**

```bash
npx jscpd --reporters console 2>/dev/null
```

> 说明：`jscpd` 默认不做圈复杂度；改用 ESLint 规则 `complexity` 输出到清单文件：

```bash
npx eslint "src/**/*.{ts,tsx}" --rule '{"complexity":["warn",10]}' --format compact > docs/refactor/report-complexity.txt
```

Expected：文件中 `warning` 行给出"文件:行号 复杂度超标"清单，作为阶段 1 Task 2.x 的候选。

- [ ] **Step 5：提交基础工具配置**

```bash
git add package.json package-lock.json docs/refactor
git commit -m "chore: add refactor tooling (jscpd, boundaries, madge) + baseline reports"
```

### Task 0.3：建依赖图，识别污点与循环依赖

**Files：**
- Create（报告产物）: `<PROJECT_ROOT>/docs/refactor/report-deps.svg`
- Create（报告产物）: `<PROJECT_ROOT>/docs/refactor/report-deps.json`

- [ ] **Step 1：生成模块依赖图**

```bash
cd <PROJECT_ROOT>
npx madge src --extensions ts,tsx --image docs/refactor/report-deps.svg --json > docs/refactor/report-deps.json
```

- [ ] **Step 2：定位循环依赖**

```bash
npx madge src --extensions ts,tsx --circular
```

Expected：任何 `Circular dependency found` 输出，都是阶段 3 的硬性修复对象；把每个环涉及的模块列表抄录到智库。

- [ ] **Step 3：标记"病态节点"**
  依据依赖图，把 `入边多`（被大量模块依赖）且 `聚集了不相干职责` 的模块标为"上帝模块/混合模块"；把 `大多为大而全工具`（如 `utils.ts`）标为"垃圾桶模块"。这两类进入阶段 2/3 候选。

- [ ] **Step 4：兜底删除未用导出（体积悖论：大量"复用"其实是死代码）**

```bash
npx knip > docs/refactor/report-knip.txt
```

Expected：列出未使用导出/文件，作为"看似可复用实则无人消费"的清理候选，优先进阶段 1 降噪。

- [ ] **Step 5：建立"重构智库"**
  在 `<PROJECT_ROOT>/docs/refactor/TARGETS.md` 汇总阶段 0 结果：

```markdown
# 重构智库（阶段0产物）
## 复制簇
- [ ] A: src/a/x.ts 与 src/b/y.ts，约40行，同属"订单"域 → 阶段1
## 巨型/上帝单元
- [ ] B: src/core/manager.ts 复杂度>15，混合"校验+持久化+通知" → 阶段2
## 循环依赖
- [ ] C: pkgA → pkgB → pkgA → 阶段3
## 死代码
- [ ] D: src/util/legacy.ts 无消费 → 阶段1清理
## 目标基线
- 复制token数/单元数: <在此记录初始值>
- 循环依赖环数: <在此记录初始值>
```

- [ ] **Step 6：提交智库**

```bash
git add docs/refactor/TARGETS.md docs/refactor/report-deps.svg docs/refactor/report-deps.json docs/refactor/report-knip.txt
git commit -m "docs: baseline dependency map and refactor target ledger"
```

> **阶段 0 完成判据：** `TARGETS.md` 已包含复制簇、巨型单元、循环依赖、死代码四类候选与基线数值；所有后续任务都在本清单上挑选，完成一项勾选一项。**若 TARGETS.md 为空，说明当前项目可复用性已较好，跳过 1/2 层直接评估 3/4 层。**

---

## 阶段 1：命名规范化与去重（复用阶梯第 1 层）

> 原则：只收敛重复的"实现"，不引入多余抽象。同一业务域成簇的重复是目标；不同业务域"长得像但语义不同"的代码**不合并**。

### Task 1.1：清理死代码，收敛复制簇（以 TARGETS.md 的 A/D 为例）

**Files：**
- Delete（示例）: `<PROJECT_ROOT>/src/util/legacy.ts`
- Modify（示例）: `<PROJECT_ROOT>/src/order/helpers.ts`（新建共享点）

- [ ] **Step 1：先删死代码（试点 A）**
  把 `TARGETS.md` 中 `D` 类（knip 认定的无用文件）删除，若其导出被引用则改为逐一确认后重建。删除后：

```bash
cd <PROJECT_ROOT>
npx tsc --noEmit && npm test
```

Expected：PASS（至少不新增错误）。若删除引发类型错误，说明并非死代码，回滚该文件。

- [ ] **Step 2：把复制簇收敛为命名明确的纯函数**
  将 `TARGETS.md` 中 `A` 簇（`src/a/x.ts` 与 `src/b/y.ts` 各 40 行）共有的纯逻辑提取到 `src/order/helpers.ts`（示例内容）：

```ts
export interface AmountParts {
  minor: number;
  precision: number;
  symbol: string;
}

/** 把金额对象规范化为统一显示结构，纯函数、无副作用。 */
export function normalizeAmount(input: AmountParts): string {
  const whole = Math.floor(Math.abs(input.minor) / 10 ** input.precision);
  const frac = Math.abs(input.minor) % 10 ** input.precision;
  const sign = input.minor < 0 ? "-" : "";
  return `${sign}${input.symbol}${whole}.${String(frac).padStart(input.precision, "0")}`;
}
```

> 配方要点：只搬迁**无副作用**、**入参出参清晰**的纯逻辑；若原片段依赖模块级状态或 IO，则先不要提取，留到阶段 2 让该片段先变成纯函数再提取。

- [ ] **Step 3：替换两处原实现**
  在 `src/a` 与 `src/b` 中删除重复片段，改为 `import { normalizeAmount } from "../order/helpers"`，并核对 import 路径（以阶段 0 真实相对路径为准）。

- [ ] **Step 4：为共享函数补测试**

```ts
// src/order/helpers.spec.ts
import { describe, expect, it } from "vitest";
import { normalizeAmount } from "./helpers";

describe("normalizeAmount", () => {
  it("formats positive currency", () => {
    expect(normalizeAmount({ minor: 12345, precision: 2, symbol: "¥" })).toBe("¥123.45");
  });
  it("handles negative and zero-padded fraction", () => {
    expect(normalizeAmount({ minor: -50, precision: 2, symbol: "¥" })).toBe("-¥0.50");
  });
});
```

- [ ] **Step 5：验证 + 提交**

```bash
npx tsc --noEmit
npx vitest run src/order/helpers.spec.ts
```

Expected：PASS（测试全绿，类型检查无错）。

```bash
git add src/order/helpers.ts src/order/helpers.spec.ts src/a src/b src/util
git commit -m "refactor: extract normalizeAmount shared helper; remove dead legacy util"
```

- [ ] **Step 6：更新智库**，将 `A`、`D` 勾选完成，并把 `报告-CPD` 重新跑一遍核对 token 数下降。

> **1.x 通用判据：** 阶段 0 的复制簇全部收敛到"命名明确、纯函数、带测试"的共享点；凡因副作用/状态无法收敛的，明确标注转入阶段 2 处理，不许强行合并。

---

## 阶段 2：函数/组件单一职责与正交（第 2 层）

> 目标：把"巨型函数/上帝组件"拆成单个职责、互相正交、可被组合复用的单元。判断复用质量的试金石："组合优于继承/复制"。

### Task 2.1：拆分巨型函数（以 TARGETS.md 的 B 为例）

**Files：**
- Modify: `<PROJECT_ROOT>/src/core/manager.ts`

- [ ] **Step 1：写一组覆盖当前行为的"角色依赖测试"（精简示例）**

```ts
// src/core/manager.spec.ts
import { describe, expect, it } from "vitest";
import { createManager } from "./manager";

describe("createManager", () => {
  it("returns a runnable handle", () => {
    const m = createManager({});
    expect(typeof m.run).toBe("function");
  });
});
```

> 目标不是 100% 覆盖，而是把当前行为"冻结"住，确保拆分不改变对外契约。

- [ ] **Step 2：确认微拆分**

```bash
npx vitest run src/core/manager.spec.ts
```

Expected：PASS，先跑通旧行为再动结构。

- [ ] **Step 3：按"角色"垂直拆分**
  把 `manager.ts` 中混合的三类职责拆成三个文件，各自持有一份明确职责，`manager.ts` 仅编排：

```ts
// src/core/validate.ts —— 只负责校验
export type Rule = (v: unknown) => string | null;
export const composeRules = (rules: Rule[]) => (value: unknown) =>
  rules.map((r) => r(value)).find((e) => e !== null) ?? null;

// src/core/persist.ts —— 只负责持久化
export interface PersistPort {
  save(key: string, value: string): Promise<void>;
}

// src/core/notify.ts —— 只负责通知
export type Notify = (msg: string) => void;
```

```ts
// src/core/manager.ts —— 仅编排（示例）
import { composeRules } from "./validate";
import type { PersistPort } from "./persist";
import type { Notify } from "./notify";

export function createManager(deps: { persist: PersistPort; notify: Notify }) {
  const validate = composeRules([]);
  return {
    async run(input: unknown) {
      const problem = validate(input);
      if (problem) return { ok: false as const, error: problem };
      await deps.persist.save("last", JSON.stringify(input));
      deps.notify("saved");
      return { ok: true as const };
    },
  };
}
```

> 配方要点：依赖以**构造函数入参**注入（见 `deps`），而不是模块内 `import` 硬编码；这为阶段 4 的依赖反转铺路。任何一个文件现在都只回答一个问题。

- [ ] **Step 4：跑测试确认契约未变**

```bash
npx tsc --noEmit && npx vitest run src/core/manager.spec.ts
```

Expected：PASS。

- [ ] **Step 5：提交**

```bash
git add src/core
git commit -m "refactor: split manager into validate/persist/notify single-responsibility units"
```

- [ ] **Step 6：对组件层做同样处理**
  若项目有 React，把"又渲染又取数又管表单态"的高耦合组件拆为"展示组件 + 独立 hooks/工具"。判定标准：**该组件能否在不同页面被组合而不改动内部逻辑**。

> **阶段 2 判据：** 巨型函数/上帝组件拆分完毕，每个单元单一职责且依赖通过参数注入；各单元具备组合复用能力。

---

## 阶段 3：模块边界与依赖方向（第 3 层）

> 目标：消除循环依赖，明确分层与依赖方向（高层依赖低层接口，而非反之），杜绝"垃圾桶模块"与"上帝模块"。**阶段 0 的循环依赖清单是本阶段硬性输入。**

### Task 3.1：破除循环依赖（以 TARGETS.md 的 C 为例）

**Files：**
- Modify: 参见具体环的成员（用阶段 0 `madge --circular` 输出定位）

- [ ] **Step 1：对每个环，画出环上模块的"请求方向"**
  记录谁在运行时真正发出调用，谁只是被调用；通常环里只有一小段是"真实因果"，其余是"类型引用"或"事件回调"。

- [ ] **Step 2：用"契约下沉"破环（示例）**
  若环是 `pkgA → pkgB → pkgA`，且 B 只用到 A 的类型，把一个只含类型/接口的新文件作为共同底层：

```ts
// src/contracts/types.ts —— 只放类型，不引具体实现
export interface Order {
  id: string;
  totalCents: number;
  state: "pending" | "paid" | "closed";
}
```

然后让 `pkgA` 与 `pkgB` 都改从 `src/contracts/types` 导入 `Order`，砍掉运行时相互 import。对于"事件回调"型环，用回调或订阅端口替代直接 import（配方见阶段 4）。

- [ ] **Step 3：验证无环**

```bash
npx madge src --extensions ts,tsx --circular
npx tsc --noEmit && npm test
```

Expected：`--circular` 无输出，类型与测试全绿。

- [ ] **Step 4：提交**

```bash
git add src
git commit -m "refactor: break circular dependency by extracting shared contract types"
```

- [ ] **Step 5：重复直至阶段 0 的所有环被清除，并更新智库。**

### Task 3.2：立依赖方向规矩（`eslint-plugin-boundaries`）

**Files：**
- Create: `<PROJECT_ROOT>/.eslintrc.cjs` 中的 boundaries 规则段

- [ ] **Step 1：安置层规约**

```js
// .eslintrc.cjs 示例
module.exports = {
  plugins: ["@typescript-eslint", "boundaries"],
  settings: {
    "boundaries/elements": [
      { type: "domain", pattern: "src/domain/**" },
      { type: "app", pattern: "src/app/**" },
      { type: "shared", pattern: "src/shared/**" },
    ],
  },
  rules: {
    "boundaries/entry-point": ["error"],
    "boundaries/element-types": [
      "error",
      {
        default: "disallow",
        rules: [
          { from: ["app"], allow: ["domain", "shared"] },
          { from: ["domain"], allow: ["domain", "shared"] },
          { from: ["shared"], disallow: ["domain", "app"] }, // shared 不得反向依赖业务
        ],
      },
    ],
  },
};
```

> 元素类型与 `src` 实际目录以阶段 0 清单为准，这里只是规约骨架。

- [ ] **Step 2：校验规矩**

```bash
npx eslint "src/**/*.{ts,tsx}"
```

Expected：报出违反方向的 import，逐一修正（把反向依赖改为通过端口/类型下沉）。

- [ ] **Step 3：提交**

```bash
git add .eslintrc.cjs
git commit -m "chore: enforce module boundary direction rules via eslint-plugin-boundaries"
```

> **阶段 3 判据：** `madge --circular` 为空；boundaries 规则通过；依赖图呈现清晰分层，不再有混合职责的"垃圾桶模块"。

---

## 阶段 4：接口/契约 与 依赖反转（第 4 层，杠杆最大）

> 核心思想：让高层的稳定逻辑依赖"抽象契约"，底层实现可替换。用信号"同一逻辑被硬编码 import 的具体实现反复使用、且未来可能要换实现"来选择范围。原则：**只在真实的变化点抽象，不为想象中的复用加抽象。**

### Task 4.1：把基础设施依赖反转为端口

**Files：**
- Create:
  - `<PROJECT_ROOT>/src/app/ports.ts`（端口/契约）
  - `<PROJECT_ROOT>/src/infrastructure/adapters.ts`（可替换实现）

- [ ] **Step 1：选一个稳定演进点**
  从阶段 2 拆出的"持久化/通知/存储"类职责里，选一个已被多处使用、未来可能替换（如云厂商、SDK 升级）的接入点。

- [ ] **Step 2：定义端口（契约）**

```ts
// src/app/ports.ts —— 只放接口与类型，无实现
export interface DocumentStore {
  get(id: string): Promise<string | null>;
  put(id: string, data: string): Promise<void>;
}
```

- [ ] **Step 3：实现具体适配器**

```ts
// src/infrastructure/adapters.ts
import type { DocumentStore } from "../app/ports";

export const createLocalStore = (root: string): DocumentStore => ({
  async get(id) {
    // 当地文件实现
    return null;
  },
  async put(id, data) {
    // 当地文件实现
  },
});
```

- [ ] **Step 4：业务侧只依赖端口**

```ts
// 业务模块内
import type { DocumentStore } from "../app/ports";

export function makeRepo(store: DocumentStore) {
  return { save: (id: string, d: string) => store.put(id, d) };
}
```

> 组装/装配（把 `createLocalStore` 注入给 `makeRepo`）放在应用入口（如 `main.ts` / DI 容器）。业务模块不再 `import` 具体底座。

- [ ] **Step 5：验证 + 提交**

```bash
npx tsc --noEmit && npx vitest run
git add src
git commit -m "refactor: invert dependency on document store via DocumentStore port"
```

- [ ] **Step 6：评估其他接入点**
  只对出现"替换成本高/已多次切换/base import 蔓延"的点做同样的端口化，其余保持简单（YAGNI）。

> **阶段 4 判据：** 业务模块不再直接 import 可变基础设施；接入点可替换（换适配器即切换实现）；依赖图中业务层指向契约层而非指向具体底座。**这是个人能力升级为系统能力的分界，也是本方案标注的核心层。**

---

## 阶段 5：复用包 / 共享层下沉（第 5 层）

> 目标：把经过 1–4 层验证、被多个模块/项目真实消费的稳定能力，打包为内部共享包或单体仓库内的可发布库。**只用被真实消费 3 次以上的能力下沉；不确定就留在原处。**

### Task 5.1：把稳定通用能力下沉为内部包

**Files（示例，以你的 monorepo 结构为准）：**
- Create: `<PROJECT_ROOT>/packages/shared/package.json`
- Create: `<PROJECT_ROOT>/packages/shared/src/index.ts`

- [ ] **Step 1：创建内部包骨架**

```json
// packages/shared/package.json
{
  "name": "@yourorg/shared",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p .", "test": "vitest run" }
}
```

```ts
// packages/shared/src/index.ts
export { normalizeAmount } from "./amount";
export const pkgVersion = "0.1.0";
```

> 只导出经过阶段 1/2 验证、且确实被多处消费的公共 API；未稳定/编排类代码不进共享包。

- [ ] **Step 2：为包暴露 API 配契约测试**

```ts
// packages/shared/src/amount.spec.ts
import { normalizeAmount } from "./amount";
import { describe, expect, it } from "vitest";

describe("shared normalizeAmount", () => {
  it("is stable API", () => {
    expect(normalizeAmount({ minor: 100, precision: 2, symbol: "$" })).toBe("$1.00");
  });
});
```

- [ ] **Step 3：明确版本策略（semver 声明）**
  在 `package.json` 注释或 README 写明：`0.x` 期间允许破坏性变更；`1.0.0` 后遵循 semver。今后改动必须向后兼容或升主版本。

- [ ] **Step 4：消费方改引包，不改源码复制**

```bash
# 在消费模块的 package.json 添加依赖后
npm install --workspace <consumer> @yourorg/shared@^0.1.0
```

- [ ] **Step 5：验证 + 提交**

```bash
npx tsc --noEmit && npx vitest run
git add packages sharedpackage-lock.json
git commit -m "feat(shared): promote verified helpers to internal shared package"
```

> **阶段 5 判据：** 共享包只含稳定且被真实消费的 API；版本策略明确；业务模块通过包依赖而非复制源码复用。**升到第 5 层的包必须权威（有 owner、有版本、有测试），否则不如留在第 4 层的端口抽象里。**

---

## 执行顺序与止损规则

1. **严格串行**执行阶段 0 → 1 → 2 → 3 → 4 → 5；不得跳层。每阶段以"判据"达标为准。
2. **每次提交必须类型检查通过 + 涉及测试全绿**；任何一步不达标先回退该步，不允许带红提交。
3. **复用是"可替换的能力"而非"被多处调用"**：改动是否成功，看"新的变化点出现时，改动是局部化还是扩散全链路"。
4. 若某任务工程量过大，按"同一业务域复制簇 / 单个上帝模块 / 单个循环依赖"切成更小的任务持续推进，不要做一次性大重构。

## 成功度量（收尾阶段回填 TARGETS.md）
- 复制 token/单元数较基线下降比例。
- 循环依赖环数：降至 0。
- `knip` 未使用导出清零或显著下降。
- 依赖图分层清晰，`boundaries` 规则全绿。
- 业务模块对可变基础设施的直接 import 全部替换为端口依赖。