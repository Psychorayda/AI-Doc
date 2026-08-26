/* 测试基建：构造清洗后的数据环境与枚举（Node headless，无 DOM） */
import { MockData } from '../src/data/mock.js';
import { Validator } from '../src/data/validator.js';
import { Mart } from '../src/data/mart.js';

export function makeEnv(){
  const raw = MockData.generate();
  const { clean, issues } = Validator.run(raw);
  const mart = Mart.build(clean);
  const enums = {
    stores: [...new Set(clean.map(r=>r.store))],
    cats:   [...new Set(clean.map(r=>r.category))],
    months: [...new Set(clean.map(r=>r.date.slice(0,7)))].sort()
  };
  return { raw, clean, issues, mart, enums };
}

export function makeStore(env){
  return { rawRows: env.raw, cleanRows: env.clean, issues: env.issues, mart: env.mart,
    enumCache: env.enums, chat: [], arbCount: 0 };
}
