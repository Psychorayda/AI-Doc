/* 纯逻辑层单测：Validator / Mart / QueryEngine / NLU / ExcelIO 表头门禁 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Validator } from '../src/data/validator.js';
import { Mart } from '../src/data/mart.js';
import { createExcelIO } from '../src/data/excel.js';
import { makeEnv, makeNQ, profile } from './helpers.js';

const ExcelIO = createExcelIO(profile.schema);
const { nlu: NLU, query: QueryEngine } = makeNQ();

test('Validator：清洗后金额一致性零违规', () => {
  const { clean } = Validator.run(makeEnv().raw, profile.rules);
  assert.equal(clean.filter(r=>Math.abs(r.amount-r.price*r.qty)>0.01).length, 0);
});

test('Validator：规则覆盖空值/超范围/符号/单位/中文数字/日期/一致性', () => {
  const { issues } = makeEnv();
  const rules = new Set(issues.map(i=>i.rule.split('；')[0]));
  ['关键字段空值','超范围 [1,500]','全角转半角','去除单位/货币/千分位符号','中文数字转数值','日期格式归一','销售额≠单价×数量，已重算']
    .forEach(r=>assert.ok(rules.has(r), `缺规则 ${r}`));
});

test('ExcelIO 表头门禁：标准/别名/乱序通过，缺字段抛错带建议', () => {
  assert.deepEqual(ExcelIO.validateHeaders(['日期','门店','品类','单价','数量','销售额']).map.join(','), 'date,store,category,price,qty,amount');
  assert.deepEqual(ExcelIO.validateHeaders(['销售日期','店铺','类别','价格','销量','金额']).map.join(','), 'date,store,category,price,qty,amount');
  assert.deepEqual(ExcelIO.validateHeaders(['门店','日期','销售额','品类','数量','单价','']).map.slice(0,6).join(','), 'store,date,amount,category,qty,price');
  assert.throws(()=>ExcelIO.validateHeaders(['日期','门店','品类','单价','数量','销售']),
    e => e.details && e.details[0].includes('缺失必需字段：「销售额」') && e.details.some(d=>d.includes('「销售」')));
});

test('Mart：季度/年度桶 + 环比同比 + 排行', () => {
  const { mart } = makeEnv();
  assert.ok(mart.quarter['2026-Q3'] && mart.year['2026'] && mart.year['2025']);
  assert.ok(typeof mart.monthCmp['2026-07'].mom.amountPct === 'number');
  assert.ok(mart.rank.store[0].amount >= mart.rank.store[1].amount);
});

test('NLU 月份消歧：裸月份归一最近一次出现，显式年份不动', () => {
  const { enums } = makeEnv();
  const mk = m => NLU.sanitizeSpec({filters:{month:m}}, enums);
  assert.equal(NLU.resolveMonth(mk('2025-08'), enums, '八月份总销售额').filters.month, '2026-08');
  assert.equal(NLU.resolveMonth(mk('2025-12'), enums, '十二月份有数据吗').filters.month, '2025-12');
  assert.equal(NLU.resolveMonth(mk('2025-07'), enums, '2025年7月销售额').filters.month, '2025-07');
});

test('NLU 追问合并：追问继承条件，非追问不污染', () => {
  const { enums } = makeEnv();
  const last = NLU.sanitizeSpec({filters:{month:'2026-07'}}, enums);
  const follow = NLU.mergeContext(NLU.sanitizeSpec(NLU.ruleParse('那华南天河店呢？', enums), enums), last, '那华南天河店呢？');
  assert.deepEqual(follow.filters, {store:'华南天河店', month:'2026-07'});
  const plain = NLU.mergeContext(NLU.sanitizeSpec(NLU.ruleParse('销售额是多少', enums), enums), last, '销售额是多少');
  assert.deepEqual(plain.filters, {});
});

test('NLU 模糊检测：宽泛问法触发，正常问法不误伤', () => {
  const { enums } = makeEnv();
  assert.ok(NLU.isVague('怎么样？', NLU.sanitizeSpec(NLU.ruleParse('怎么样？', enums), enums)));
  const s = NLU.sanitizeSpec(NLU.ruleParse('西南锦江店销售额', enums), enums);
  assert.ok(!NLU.isVague('西南锦江店销售额', s));
});

test('QueryEngine：环比/同比/占比/阈值/季度/年度 端到端', () => {
  const { clean, mart, enums } = makeEnv();
  const run = q => { const s = NLU.resolveMonth(NLU.sanitizeSpec(NLU.ruleParse(q, enums), enums), enums, q); return { s, r: QueryEngine.run(s, clean, mart) }; };
  assert.equal(run('8月销售额环比增长多少？').r.type, 'compare');
  assert.ok(run('2026年7月销售额同比增长多少？').r.ref !== null);
  assert.ok(run('现制饮品销售额占比多少？').r.pct > 0);
  assert.ok(run('单价30元以上的总销售额').r.matched > 0);
  assert.ok(run('2026年三季度销售额').r.matched > 0);
  assert.ok(run('各年销售额对比').r.rows.length >= 2);
});
