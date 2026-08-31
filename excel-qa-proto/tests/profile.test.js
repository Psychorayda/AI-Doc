/* 画像可替换性验证：核心模块（ExcelIO/Validator/NLU/QueryEngine）在第二主题下零改动工作
 * 微型主题「食堂档口」：与零售不同的表头、别名、词表、标签、清洗规则 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExcelIO } from '../src/data/excel.js';
import { Validator, Rules } from '../src/data/validator.js';
import { Mart } from '../src/data/mart.js';
import { createNLU } from '../src/qa/nlu.js';
import { createQueryEngine } from '../src/qa/query.js';

const schema = {
  required: [['日期','date'],['摊位','store'],['菜品','category'],['单价','price'],['份数','qty'],['营业额','amount']],
  alias: { '档口':'摊位', '菜名':'菜品', '收入':'营业额' },
  mock: { sheetName:'档口流水', fileName:'x.xlsx', rowMap: r=>({'日期':r.date}) },
};
const rules = [
  Rules.dateNorm('date'),
  Rules.requiredText('store'),
  Rules.fillDefault('category', '其他'),
  Rules.numeric('price', { range:[0.5,500] }),
  Rules.numeric('qty', { range:[1,200] }),
  Rules.numeric('amount', { nullable:true }),
  Rules.productConsistency('amount', 'price', 'qty'),
];
const lex = {
  metrics: ['amount','qty','price'],
  dims: ['store','category'],
  specHint: '{"metric":"amount|qty|price"}',
  prompt: { fieldDesc:'date(日期), store(摊位), category(菜品), price(单价), qty(份数), amount(营业额)',
    storeLabel:'摊位', catLabel:'菜品', rules:'默认 metric=amount。只输出 JSON。', examples:[] },
  rule: {
    metricWords: [[/份数/,'qty'],[/单价/,'price']],
    rangePatterns: [[/营业额[^\d]{0,5}(\d+(?:\.\d+)?)\s*以上/,'amount','min']],
    groupWords: [[/各摊位|哪个摊位|摊位.*对比/,'store'],[/各菜品|菜品.*对比/,'category']],
    groupInfer: [['菜品','category'],['摊位','store']],
    defaultTopGroup: 'store',
    catStrip: null,
    vagueSignal: /营业额|份数|多少/,
  },
  labels: { metric:{amount:'营业额',qty:'份数',price:'单价'}, agg:{sum:'总',avg:'平均',count:'记录数'},
    group:{store:'摊位',category:'菜品',month:'月份',quarter:'季度',year:'年度'},
    range:{price:'单价',qty:'份数',amount:'营业额'} },
  units: { qty:' 份', amount:' 元' },
  vague: { examples:['· 汇总：「今天营业额多少？」'], footer:'也可以换个问法。' },
};

const rows = [
  { id:1, date:'2026-08-01', store:'一号档口', category:'面条', price:12,  qty:100, amount:1200 },
  { id:2, date:'2026-08-01', store:'二号档口', category:'米饭', price:10,  qty:80,  amount:800 },
  { id:3, date:'2026-08-02', store:'一号档口', category:'面条', price:12,  qty:120, amount:1440 },
];

test('第二画像：ExcelIO 表头门禁按自定义 schema + 别名工作', () => {
  const io = createExcelIO(schema);
  assert.deepEqual(io.validateHeaders(['日期','摊位','菜品','单价','份数','营业额']).map.join(','), 'date,store,category,price,qty,amount');
  assert.deepEqual(io.validateHeaders(['日期','档口','菜名','单价','份数','收入']).map.join(','), 'date,store,category,price,qty,amount');
  assert.throws(()=>io.validateHeaders(['日期','摊位','菜品']), e=>e.details[0].includes('缺失必需字段'));
});

test('第二画像：Validator 按自定义规则集清洗（剔除/填充/重算）', () => {
  const raw = [
    { id:1, date:'2026/8/1', store:'一号档口', category:'', price:12, qty:'九十', amount:'' },  // 日期修复+品类填充+中文数字+重算
    { id:2, date:'2026-08-01', store:'', category:'米饭', price:10, qty:80, amount:800 },        // 摊位空 → 剔除
    { id:3, date:'2026-08-01', store:'二号档口', category:'米饭', price:10, qty:999, amount:9990 }, // 份数超范围 [1,200] → 剔除
  ];
  const { clean, issues } = Validator.run(raw, rules);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].date, '2026-08-01');
  assert.equal(clean[0].category, '其他');
  assert.equal(clean[0].qty, 90);
  assert.equal(clean[0].amount, 1080);
  assert.ok(issues.some(i=>i.rule.startsWith('超范围 [1,200]')));
});

test('第二画像：NLU 按自定义词表解析 + QueryEngine 按自定义标签渲染', () => {
  const nlu = createNLU(lex), query = createQueryEngine(lex);
  const enums = { stores:['一号档口','二号档口'], cats:['面条','米饭'], months:['2026-08'] };
  const mart = Mart.build(rows);

  let spec = nlu.sanitizeSpec(nlu.ruleParse('各摊位营业额对比', enums), enums);
  assert.equal(spec.groupBy, 'store');
  assert.equal(spec.metric, 'amount');
  spec = nlu.sanitizeSpec(nlu.ruleParse('份数最多的摊位', enums), enums);
  assert.equal(spec.metric, 'qty');
  assert.equal(spec.topN, 1);
  spec = nlu.sanitizeSpec(nlu.ruleParse('营业额500以上的记录', enums), enums);
  assert.deepEqual(spec.filters.range, { field:'amount', min:500 });

  const res = query.run(nlu.sanitizeSpec(nlu.ruleParse('各摊位营业额对比', enums), enums), rows, mart);
  assert.equal(res.type, 'group');
  assert.equal(res.rows[0].key, '一号档口');
  const text = query.renderLocal(spec, query.run(spec, rows, mart), mart);
  assert.match(text, /营业额≥500/);

  const grpText = query.renderLocal(
    nlu.sanitizeSpec(nlu.ruleParse('各摊位营业额对比', enums), enums), res, mart);
  assert.match(grpText, /按摊位统计的总营业额/);
  assert.match(grpText, /一号档口：2,640 元/);
});
