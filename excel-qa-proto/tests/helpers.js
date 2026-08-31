/* 测试基建：构造清洗后的数据环境与枚举（Node headless，无 DOM）
 * 默认使用零售画像；传其他画像可验证主题可替换性 */
import { profile } from '../src/profiles/retail-sales.js';
import { retailCases } from '../src/profiles/retail-cases.js';
import { createMock } from '../src/data/mock.js';
import { Validator } from '../src/data/validator.js';
import { Mart } from '../src/data/mart.js';
import { createNLU } from '../src/qa/nlu.js';
import { createQueryEngine } from '../src/qa/query.js';

export { profile, retailCases };

export function makeEnv(p = profile){
  const raw = createMock(p.mock).generate();
  const { clean, issues } = Validator.run(raw, p.rules);
  const mart = Mart.build(clean);
  const enums = {
    stores: [...new Set(clean.map(r=>r[p.dims.stores.field]))],
    cats:   [...new Set(clean.map(r=>r[p.dims.cats.field]))],
    months: [...new Set(clean.map(r=>r.date.slice(0,7)))].sort()
  };
  return { raw, clean, issues, mart, enums };
}

/* 画像驱动的 NLU + QueryEngine 实例对 */
export function makeNQ(p = profile){
  return { nlu: createNLU(p.nlu), query: createQueryEngine(p.nlu) };
}

export function makeStore(env){
  return { rawRows: env.raw, cleanRows: env.clean, issues: env.issues, mart: env.mart,
    enumCache: env.enums, chat: [], arbCount: 0 };
}
