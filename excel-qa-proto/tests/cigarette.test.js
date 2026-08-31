/* 卷烟销售画像（test-1 主题）端到端验证：
 * 表头门禁 → 清洗流水线（A 组规则逐类命中）→ Mart/NLU/QueryEngine → 黄金集 10/10 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExcelIO } from '../src/data/excel.js';
import { Validator } from '../src/data/validator.js';
import { createMock } from '../src/data/mock.js';
import { Mart } from '../src/data/mart.js';
import { createNLU } from '../src/qa/nlu.js';
import { createQueryEngine } from '../src/qa/query.js';
import { createEvalRunner } from '../src/qa/eval.js';
import { profile } from '../src/profiles/cigarette-sales.js';
import { cigaretteCases } from '../src/profiles/cigarette-cases.js';
import { profiles } from '../src/profiles/index.js';

function makeEnv(){
  const raw = createMock(profile.mock).generate();
  const { clean, issues } = Validator.run(raw, profile.rules);
  const mart = Mart.build(clean, Mart.cfgOf(profile));
  const enums = {
    stores: [...new Set(clean.map(r=>r.store))],
    cats:   [...new Set(clean.map(r=>r.category))],
    months: [...new Set(clean.map(r=>r.date.slice(0,7)))].sort()
  };
  return { raw, clean, issues, mart, enums };
}

test('卷烟画像：已按 id 注册（?theme=cigarette-sales 可选中）', () => {
  assert.equal(profiles['cigarette-sales'].profile, profile);
  assert.equal(profiles['cigarette-sales'].cases, cigaretteCases);
});

test('卷烟画像：ExcelIO 识别附件1 标准表头与常见别名', () => {
  const io = createExcelIO(profile.schema);
  const std = ['销售日期','零售户名称','许可证号','零售户类型','卷烟品牌','数量(条)','单价(元)','销售金额(元)','付款方式'];
  assert.deepEqual(io.validateHeaders(std).map.join(','),
    'date,store,license,storeType,category,qty,price,amount,payment');
  const aliased = ['日期','客户名称','许可证','业态','品牌','条数','单价','金额','支付方式'];
  assert.deepEqual(io.validateHeaders(aliased).map.join(','),
    'date,store,license,storeType,category,qty,price,amount,payment');
  assert.throws(()=>io.validateHeaders(['销售日期','零售户名称']), e=>e.details[0].includes('缺失必需字段'));
});

test('卷烟画像：A 组清洗规则逐类命中且边界受控（业务异常不剔除）', () => {
  const { raw, clean, issues } = makeEnv();
  assert.equal(raw.length, profile.mock.rowCount + profile.mock.bad.length);
  const removed = issues.filter(i=>i.action==='removed');
  const fixed = issues.filter(i=>i.action==='fixed');
  /* 剔除：名称空×1、数量≤0×2、单价金额双缺×1、完全重复×1 = 5 */
  assert.equal(removed.length, 5, removed.map(i=>i.rule).join('|'));
  assert.equal(clean.length, raw.length - 5);
  /* 各规则至少命中一次 */
  assert.ok(fixed.some(i=>i.rule==='日期格式归一'), '日期归一');
  assert.ok(fixed.some(i=>i.rule.includes('字符规范化')), '许可证号/空格规范化');
  assert.ok(fixed.some(i=>i.rule.includes('去除单位/货币/千分位符号')), '金额规整');
  assert.ok(fixed.some(i=>i.rule.includes('全角转半角')), '全角数字');
  assert.equal(fixed.filter(i=>i.rule.startsWith('缺失推导')).length, 2, '单价推导（缺失+非正各1）');
  assert.ok(fixed.some(i=>i.rule.includes('销售金额≠单价×数量')), '金额对账');
  assert.ok(removed.some(i=>i.rule.includes('完全重复')), '去重');
  /* 边界：清洗后无 null 单价/金额，且金额=单价×数量（对账后一致） */
  for(const r of clean){
    assert.ok(r.price>0 && r.amount>0 && r.qty>=1);
    assert.ok(Math.abs(r.amount - r.price*r.qty) <= 0.01);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r.license, r.license.toLowerCase());
  }
});

test('卷烟画像：去重状态按轮重置，重跑结果一致', () => {
  const raw = createMock(profile.mock).generate();
  const a = Validator.run(raw, profile.rules);
  const b = Validator.run(raw, profile.rules);
  assert.equal(a.clean.length, b.clean.length);
  assert.equal(a.issues.length, b.issues.length);
});

test('卷烟画像：黄金问数集（规则通道）10/10', () => {
  const env = makeEnv();
  const nlu = createNLU(profile.nlu), query = createQueryEngine(profile.nlu);
  const store = { rawRows: env.raw, cleanRows: env.clean, issues: env.issues,
    mart: env.mart, enumCache: env.enums, chat: [], arbCount: 0 };
  const r = createEvalRunner({ store, llm: null, nlu, query, cases: cigaretteCases }).run();
  if(r.fails.length) console.error(r.fails.join('\n'));
  assert.equal(r.pass, r.total, `${r.pass}/${r.total}`);
});

test('卷烟画像：本地渲染使用主题标签与单位', () => {
  const env = makeEnv();
  const nlu = createNLU(profile.nlu), query = createQueryEngine(profile.nlu);
  const spec = nlu.sanitizeSpec(nlu.ruleParse('各品牌销量对比', env.enums), env.enums);
  const text = query.renderLocal(spec, query.run(spec, env.clean, env.mart), env.mart);
  assert.match(text, /按品牌统计的总销量/);
  assert.match(text, /条/);
  const cmpSpec = nlu.sanitizeSpec(nlu.ruleParse('2月销售额环比增长多少？', env.enums), env.enums);
  const cmpText = query.renderLocal(cmpSpec, query.run(cmpSpec, env.clean, env.mart), env.mart);
  assert.match(cmpText, /2025-02 销售金额/);
  assert.match(cmpText, /环比（对比 2025-01）/);
});
