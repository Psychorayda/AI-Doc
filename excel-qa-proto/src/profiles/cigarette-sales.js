/* 画像：卷烟销售流水（test-1 主题）—— 市级烟草营销中心销售监测场景
 * 核心代码（core/data/qa/ui）不含本主题词汇；清洗口径按题目 A 组规则组合 Rules.*：
 *   日期归一 → 字符规范化 → 关键字段剔除 → 数值规整 → 缺失推导 → 正数门禁 → 金额对账 → 去重
 * 边界（B 组）：数量/单价/金额不设业务上界，金额畸高与价格偏离的记录一律保留（属异常检出对象） */
import { defineProfile } from '../core/profile.js';
import { Rules } from '../data/validator.js';

const DIM_FIELDS = ['store','category'];

/* 零售户样例：[名称, 许可证号, 类型]；许可证号为唯一标识（关联/去重以它为准） */
const STORES = [
  ['张记便利店','sm2025001a','便利店'], ['汇鑫商超','sm2025002b','商超'],
  ['云天烟酒专卖','sm2025003c','专卖店'], ['临江大酒店','sm2025004d','酒店'],
  ['老街口便利店','sm2025005e','便利店'], ['万家福超市','sm2025006f','商超'],
  ['金叶专卖店','sm2025007g','专卖店'], ['悦来酒店','sm2025008h','酒店'],
  ['晨光便利店','sm2025009i','便利店'], ['百汇商超','sm2025010j','商超'],
  ['诚信烟酒行','sm2025011k','专卖店'], ['望江楼酒店','sm2025012l','酒店'],
];
/* 品牌与标准零售指导价（元/条）：价格类异常的判定基准 */
const BRANDS = [['中华',650],['芙蓉王',300],['黄山',250],['玉溪',230],['利群',180],['红塔山',90]];
const PAYMENTS = ['微信','支付宝','现金','银行卡','转账'];

export const profile = defineProfile({
  id: 'cigarette-sales',

  schema: {
    required: [
      ['销售日期','date'],['零售户名称','store'],['许可证号','license'],['零售户类型','storeType'],
      ['卷烟品牌','category'],['数量(条)','qty'],['单价(元)','price'],['销售金额(元)','amount'],['付款方式','payment'],
    ],
    alias: { '日期':'销售日期','交易日期':'销售日期','时间':'销售日期',
      '零售户':'零售户名称','客户名称':'零售户名称','客户':'零售户名称','店名':'零售户名称',
      '许可证':'许可证号','许可证编号':'许可证号','专卖证号':'许可证号',
      '类型':'零售户类型','客户类型':'零售户类型','业态':'零售户类型',
      '品牌':'卷烟品牌','卷烟':'卷烟品牌','品规':'卷烟品牌',
      '数量':'数量(条)','条数':'数量(条)','销量':'数量(条)','数量（条）':'数量(条)',
      '单价':'单价(元)','价格':'单价(元)','成交价':'单价(元)','单价（元）':'单价(元)',
      '金额':'销售金额(元)','销售金额':'销售金额(元)','销售额':'销售金额(元)','销售金额（元）':'销售金额(元)',
      '付款':'付款方式','支付方式':'付款方式','结算方式':'付款方式' },
    mock: {
      sheetName: '卷烟销售流水',
      fileName: '模拟卷烟销售流水_含错误.xlsx',
      rowMap: r => ({ '销售日期':r.date,'零售户名称':r.store,'许可证号':r.license,'零售户类型':r.storeType,
        '卷烟品牌':r.category,'数量(条)':r.qty,'单价(元)':r.price,'销售金额(元)':r.amount,'付款方式':r.payment }),
    },
  },

  rules: [
    Rules.dateNorm('date'),                                        // A1 日期归一（含 20250304 写法）
    Rules.textNorm('license', { lower:true }),                     // A3 许可证号：全角→半角 + 小写
    Rules.requiredText('store'),                                   // A5 零售户名称为空 → 剔除
    Rules.textNorm('storeType'),                                   // A3 类型去空格/全角
    Rules.fillDefault('category', '未知品牌'),                      // A3 品牌去空格，空值填充（不构成剔除理由）
    Rules.textNorm('payment'),
    Rules.numeric('qty',    { range:[1, 1e8] }),                   // A5 数量≤0 → 剔除（大单不设上界，保留）
    Rules.numeric('price',  { nullable:true }),                    // A2 金额规整；缺失留 null 待推导
    Rules.numeric('amount', { nullable:true }),
    Rules.deriveDiv('price', 'amount', 'qty'),                     // A4 单价缺失/非正且金额数量有效 → 推导保留
    Rules.positiveNum('price'),                                    // A5 推导后单价仍缺失或≤0 → 剔除
    Rules.productConsistency('amount', 'price', 'qty', '销售金额≠单价×数量'), // A4 金额缺失推导 + A7 对账逐条修正
    Rules.dedupe(['date','store','license','storeType','category','qty','price','amount','payment']), // A6 完全重复去重
  ],

  dims: {
    stores: { field:'store',    label:'零售户' },
    cats:   { field:'category', label:'品牌' },
  },

  /* Mart 可选段：派生均价 = 销售金额 ÷ 数量（条） */
  mart: { avgOf: ['amount','qty'], avgKey: 'priceAvg' },

  nlu: {
    metrics: ['amount','qty','price'],
    dims: DIM_FIELDS,
    specHint: `{"metric":"amount|qty|price","agg":"sum|avg|max|min|count","groupBy":"store|category|month|quarter|year|null","filters":{"store":"零售户名称或null","category":"品牌名或null","month":"YYYY-MM或null","year":"YYYY或null","quarter":"YYYY-Qn或null","range":{"field":"price|qty|amount","min":数或null,"max":数或null}或null},"topN":"数字或null","order":"desc|asc","compare":"mom|yoy|null","ratio":"true|false"}`,
    prompt: {
      fieldDesc: 'date(销售日期), store(零售户名称), license(许可证号), storeType(零售户类型), category(卷烟品牌), qty(数量条), price(单价元/条), amount(销售金额元), payment(付款方式)',
      storeLabel: '零售户',
      catLabel: '品牌',
      rules: `默认 metric=amount, agg=sum, order=desc, compare=null, ratio=false；问法出现"销量/条数/多少条烟"时 metric=qty（即使同时提到金额相关字眼，以销量为准）；"各/每/分别/对比/哪个/前几"→设置 groupBy；"最高/最多/第一"→order=desc 且 topN=1；"最低/最少"→order=asc；"平均"→agg=avg；"多少条记录/几笔"→agg=count；含"环比"→compare=mom 且提取 month；含"同比"→compare=yoy 且提取 month；"各年/逐年/按年"→groupBy=year；含"占比/比例"→ratio=true 且提取对应维度过滤；"X以上/超过/大于"→range.min，"X以下/以内"→range.max；"一季度/Q1"→filters.quarter；只有年份没有月份→填 year；月份缺少年份→映射到数据中该月份的最近一次出现；数据中没有的年份照实填写（查询层会如实返回0条）；无法确定的字段填 null。只输出 JSON。`,
      examples: [
        `问：三月份总销售额 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":"2025-03"},"topN":null,"order":"desc","compare":null}`,
        `问：哪个零售户销售额最高 → {"metric":"amount","agg":"sum","groupBy":"store","filters":{"store":null,"category":null,"month":null},"topN":1,"order":"desc","compare":null}`,
        `问：各品牌销量分别是多少 → {"metric":"qty","agg":"sum","groupBy":"category","filters":{"store":null,"category":null,"month":null},"topN":null,"order":"desc","compare":null}`,
        `问：销量最低的三个零售户 → {"metric":"qty","agg":"sum","groupBy":"store","filters":{"store":null,"category":null,"month":null},"topN":3,"order":"asc","compare":null}`,
        `问：2月销售额环比增长多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":"2025-02"},"topN":null,"order":"desc","compare":"mom"}`,
        `问：3月张记便利店中华卖了多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":"张记便利店","category":"中华","month":"2025-03","year":null},"topN":null,"order":"desc","compare":null}`,
        `问：2024年销售额是多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":"2024"},"topN":null,"order":"desc","compare":null}`,
        `问：中华销售额占比多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":"中华","month":null,"year":null},"topN":null,"order":"desc","compare":null,"ratio":true}`,
        `问：单价500元以上的销量 → {"metric":"qty","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":null,"range":{"field":"price","min":500,"max":null}},"topN":null,"order":"desc","compare":null,"ratio":false}`,
        `问：一季度销售额 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":null,"quarter":"2025-Q1"},"topN":null,"order":"desc","compare":null,"ratio":false}`,
      ],
    },
    rule: {
      metricWords: [
        [/销量|销售条数|多少条烟|卖了多少条/, 'qty'],
        [/单价|均价|价格/, 'price'],
      ],
      rangePatterns: [
        [/(?:单价|价格)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以上|超过|大于|高于)/,'price','min'],
        [/(?:销量|数量|条数)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:条)?\s*(?:以上|超过|大于|高于)/,'qty','min'],
        [/(?:销售金额|销售额|金额)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以上|超过|大于|高于)/,'amount','min'],
        [/(?:单价|价格)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以下|以内|小于|低于)/,'price','max'],
        [/(?:销量|数量|条数)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:条)?\s*(?:以下|以内|小于|低于)/,'qty','max'],
        [/(?:销售金额|销售额|金额)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以下|以内|小于|低于)/,'amount','max'],
        [/(?:单价|价格)(?:超过|大于|高于|多于|超)[^\d]{0,2}(\d+(?:\.\d+)?)/,'price','min'],
        [/(?:销量|数量|条数)(?:超过|大于|高于|多于|超)[^\d]{0,2}(\d+(?:\.\d+)?)/,'qty','min'],
        [/(?:销售金额|销售额|金额)(?:超过|大于|高于|多于|超)[^\d]{0,2}(\d+(?:\.\d+)?)/,'amount','min'],
        [/(?:单价|价格)(?:低于|小于|不足|不到)[^\d]{0,2}(\d+(?:\.\d+)?)/,'price','max'],
        [/(?:销量|数量|条数)(?:低于|小于|不足|不到)[^\d]{0,2}(\d+(?:\.\d+)?)/,'qty','max'],
        [/(?:销售金额|销售额|金额)(?:低于|小于|不足|不到)[^\d]{0,2}(\d+(?:\.\d+)?)/,'amount','max'],
      ],
      groupWords: [
        [/各零售户|每个零售户|按零售户|零售户.*对比|哪个零售户|各家|各门店/, 'store'],
        [/各品牌|每个品牌|按品牌|品牌.*对比|哪个品牌|哪种烟|各品类/, 'category'],
        [/各月|每月|按月|月度|趋势/, 'month'],
      ],
      groupInfer: [['品牌','category'],['零售户','store'],['客户','store'],['门店','store']],
      defaultTopGroup: 'store',
      catStrip: null,
      vagueSignal: /销售额|销售金额|销量|单价|数量|条数|多少|几|最高|最低|平均|对比|趋势|占比|比例|记录|排行/,
    },
    labels: {
      metric: { amount:'销售金额', qty:'销量', price:'单价' },
      agg:    { sum:'总', avg:'平均', max:'最高', min:'最低', count:'记录数' },
      group:  { store:'零售户', category:'品牌', month:'月份', quarter:'季度', year:'年度' },
      range:  { price:'单价', qty:'销量', amount:'销售金额' },
    },
    units: { qty:' 条', amount:' 元' },
    vague: {
      examples: [
        '· 汇总：「三月份总销售额是多少？」',
        '· 排行：「哪个零售户销售额最高？」「销量前三的品牌」',
        '· 对比：「各品牌销量对比」「各月销售额趋势」',
        '· 占比/阈值：「中华销售额占比多少？」「单价500元以上的销量」',
        '· 环比：「2月销售额环比增长多少？」',
      ],
      footer: '也可以直接点击下方问数方向提示。',
    },
  },

  table: {
    cols: [
      { key:'date',      label:'销售日期',     num:true, sortable:true },
      { key:'store',     label:'零售户名称',   filter:true },
      { key:'license',   label:'许可证号',     filter:true },
      { key:'storeType', label:'零售户类型',   filter:true },
      { key:'category',  label:'卷烟品牌',     filter:true },
      { key:'qty',       label:'数量(条)',     num:true, sortable:true },
      { key:'price',     label:'单价(元)',     num:true, sortable:true, fmt:v=>v.toFixed(2) },
      { key:'amount',    label:'销售金额(元)', num:true, sortable:true, fmt:v=>v.toLocaleString() },
      { key:'payment',   label:'付款方式',     filter:true },
    ],
  },

  copy: {
    title: '烟鉴 · 卷烟销售数据清洗与智能问数',
    brand: '烟鉴 CigarClean QA',
    subtitle: '卷烟流水清洗修复 · 自然语言问数 · 销售监测原型',
    headerHint: '支持 .xlsx / .xls / .csv · 需含表头：销售日期/零售户名称/许可证号/零售户类型/卷烟品牌/数量(条)/单价(元)/销售金额(元)/付款方式',
    greeting: '你好，我是销售监测问数助手。数据加载并完成校验修复后即可提问，例如「各品牌销量对比」。支持多轮追问，如「那 2 月呢」。',
    hints: [
      '2025年3月总销售额是多少？',
      '哪个零售户销售额最高？',
      '各品牌销量对比',
      '2月销售额环比增长多少？',
      '中华销售额占比多少？',
    ],
  },

  mock: {
    rowCount: 553,                                     // 对齐附件1规模
    dateRange: { from:[2025,0,1], to:[2025,2,31] },    // 2025-01-01 ~ 2025-03-31（JS 月份 0 基）
    /* 行生成器（标准字段）：零售户三元组随机，单价围绕品牌指导价 ±8% 抖动，金额=单价×数量 */
    row: () => {
      const pick = a => a[Math.floor(Math.random()*a.length)];
      const rnd = (a,b) => a+Math.random()*(b-a);
      const [store, license, storeType] = pick(STORES);
      const [category, std] = pick(BRANDS);
      const price = Math.round(std*rnd(0.92,1.08)*2)/2;
      const qty = Math.round(rnd(1,60));
      return { store, license, storeType, category, qty, price,
        amount:Math.round(price*qty*100)/100, payment:pick(PAYMENTS) };
    },
    /* 注入错误（覆盖题目数据质量说明中的各类问题） */
    bad: [
      {patch:{store:''}},                       // 零售户名称空 → 剔除
      {patch:{store:'  晨光便利店  '}},          // 名称首尾空格 → 修复
      {patch:{license:'ＳＭ２０２５００７Ｇ'}},   // 许可证号全角 → 半角+小写
      {patch:{license:'SM2025010J'}},           // 许可证号大写 → 小写
      {patch:{qty:0}},                          // 数量=0 → 剔除
      {patch:{qty:-5}},                         // 数量<0 → 剔除
      {patch:{price:''}},                       // 单价缺失，金额有效 → 推导保留
      {patch:{price:0}},                        // 单价=0，金额有效 → 推导保留
      {patch:{price:'', amount:''}},            // 单价金额双缺 → 无法推导 → 剔除
      {patch:{amount:''}},                      // 金额缺失 → 单价×数量重算
      {patch:{price:'￥320'}},                  // 货币符号 → 修复
      {patch:{amount:'12,800元'}},              // 千分位+单位 → 修复（随后对账重算）
      {patch:{price:'２３０．５'}},              // 全角数字 → 修复
      {patch:{date:'2025/3/2'}},                // 日期格式 → 修复
      {patch:{date:'2025.03.03'}},              // 日期格式 → 修复
      {patch:{date:'20250304'}},                // 8 位日期 → 修复
      {patch:{date:'2025/2/10', store:'张记便利店', license:'sm2025001a', storeType:'便利店',
              category:'中华', qty:10, price:650, amount:6500, payment:'现金'}},   // 完全重复之一
      {patch:{date:'2025/2/10', store:'张记便利店', license:'sm2025001a', storeType:'便利店',
              category:'中华', qty:10, price:650, amount:6500, payment:'现金'}},   // 完全重复之二 → 去重剔除
      {patch:{}, fixOn:['amount',2.5]},         // 销售金额≠单价×数量 → 对账重算
    ],
  },
});
