/* 画像：零售销售（默认主题）—— 全部领域硬编码的唯一落点
 * 核心代码（core/data/qa/ui）不含本主题词汇；换主题时复制本文件改内容即可 */
import { defineProfile } from '../core/profile.js';
import { Rules } from '../data/validator.js';

const DIM_FIELDS = ['store','category'];

export const RANGE = { price:[0.01,1000], qty:[1,500], amount:[0.01,1e7] };

export const profile = defineProfile({
  id: 'retail-sales',

  schema: {
    required: [['日期','date'],['门店','store'],['品类','category'],['单价','price'],['数量','qty'],['销售额','amount']],
    alias: { '销售日期':'日期','交易日期':'日期','订单日期':'日期','时间':'日期',
      '店铺':'门店','门店名称':'门店','分店':'门店','网点':'门店',
      '类别':'品类','分类':'品类','商品类别':'品类','产品类别':'品类',
      '价格':'单价','单价(元)':'单价','单价（元）':'单价',
      '销量':'数量','件数':'数量','数量(件)':'数量',
      '金额':'销售额','流水':'销售额','销售额(元)':'销售额','销售额（元）':'销售额','营收':'销售额' },
    mock: {
      sheetName: '销售流水',
      fileName: '模拟销售数据_含错误.xlsx',
      rowMap: r => ({ '日期':r.date,'门店':r.store,'品类':r.category,'单价':r.price,'数量':r.qty,'销售额':r.amount }),
    },
  },

  rules: [
    Rules.dateNorm('date'),
    Rules.requiredText('store'),
    Rules.fillDefault('category', '未分类'),
    Rules.numeric('price',  { range: RANGE.price }),
    Rules.numeric('qty',    { range: RANGE.qty }),
    Rules.numeric('amount', { range: RANGE.amount, nullable: true }),
    Rules.productConsistency('amount', 'price', 'qty', '销售额≠单价×数量'),
  ],

  dims: {
    stores: { field:'store',    label:'门店' },
    cats:   { field:'category', label:'品类' },
  },

  /* Mart 可选段：派生均值（均价 = 销售额 ÷ 数量） */
  mart: { avgOf: ['amount','qty'], avgKey: 'priceAvg' },

  nlu: {
    metrics: ['amount','qty','price'],
    dims: DIM_FIELDS,
    specHint: `{"metric":"amount|qty|price","agg":"sum|avg|max|min|count","groupBy":"store|category|month|quarter|year|null","filters":{"store":"门店名或null","category":"品类名或null","month":"YYYY-MM或null","year":"YYYY或null","quarter":"YYYY-Qn或null","range":{"field":"price|qty|amount","min":数或null,"max":数或null}或null},"topN":"数字或null","order":"desc|asc","compare":"mom|yoy|null","ratio":"true|false"}`,
    prompt: {
      fieldDesc: 'date(日期), store(门店), category(品类), price(单价元), qty(数量件), amount(销售额元)',
      storeLabel: '门店',
      catLabel: '品类',
      rules: `默认 metric=amount, agg=sum, order=desc, compare=null, ratio=false；问法出现"销量/件数/多少件"时 metric=qty（即使同时提到销售额相关字眼，以销量为准）；"各/每/分别/对比/哪个/前几"→设置 groupBy；"最高/最多/第一"→order=desc 且 topN=1；"最低/最少"→order=asc；"平均"→agg=avg；"多少条/几笔"→agg=count；含"环比"→compare=mom 且提取 month；含"同比"→compare=yoy 且提取 month；"各年/逐年/按年"→groupBy=year；含"占比/比例"→ratio=true 且提取对应维度过滤；"X以上/超过/大于"→range.min，"X以下/以内"→range.max；"Q3/三季度/第3季度"→filters.quarter；只有年份没有月份→填 year；月份缺少年份→映射到数据中该月份的最近一次出现（通常是最新年份）；数据中没有的年份照实填写（查询层会如实返回0条）；无法确定的字段填 null。只输出 JSON。`,
      examples: [
        `问：八月份总销售额 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":"{{M08}}"},"topN":null,"order":"desc","compare":null}`,
        `问：哪个门店销售额最高 → {"metric":"amount","agg":"sum","groupBy":"store","filters":{"store":null,"category":null,"month":null},"topN":1,"order":"desc","compare":null}`,
        `问：各品类销量分别是多少 → {"metric":"qty","agg":"sum","groupBy":"category","filters":{"store":null,"category":null,"month":null},"topN":null,"order":"desc","compare":null}`,
        `问：销量最低的三个门店 → {"metric":"qty","agg":"sum","groupBy":"store","filters":{"store":null,"category":null,"month":null},"topN":3,"order":"asc","compare":null}`,
        `问：销量最高的前三个品类 → {"metric":"qty","agg":"sum","groupBy":"category","filters":{"store":null,"category":null,"month":null},"topN":3,"order":"desc","compare":null}`,
        `问：8月销售额环比增长多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":"{{M08}}"},"topN":null,"order":"desc","compare":"mom"}`,
        `问：7月华东旗舰店烘焙点心卖了多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":"华东旗舰店","category":"烘焙点心","month":"{{M07}}","year":null},"topN":null,"order":"desc","compare":null}`,
        `问：2024年销售额是多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":"2024"},"topN":null,"order":"desc","compare":null}`,
        `问：现制饮品销售额占比多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":"现制饮品","month":null,"year":null},"topN":null,"order":"desc","compare":null,"ratio":true}`,
        `问：单价30元以上的销量 → {"metric":"qty","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":null,"range":{"field":"price","min":30,"max":null}},"topN":null,"order":"desc","compare":null,"ratio":false}`,
        `问：三季度销售额 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":null,"quarter":"2026-Q3"},"topN":null,"order":"desc","compare":null,"ratio":false}`,
      ],
    },
    rule: {
      metricWords: [
        [/销量|数量|多少件|几件/, 'qty'],
        [/单价|均价|价格/, 'price'],
      ],
      rangePatterns: [
        [/(?:单价|价格)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以上|超过|大于|高于)/,'price','min'],
        [/(?:销量|数量)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:件)?\s*(?:以上|超过|大于|高于)/,'qty','min'],
        [/销售额[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以上|超过|大于|高于)/,'amount','min'],
        [/(?:单价|价格)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以下|以内|小于|低于)/,'price','max'],
        [/(?:销量|数量)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:件)?\s*(?:以下|以内|小于|低于)/,'qty','max'],
        [/销售额[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:元)?\s*(?:以下|以内|小于|低于)/,'amount','max'],
        [/(?:单价|价格)(?:超过|大于|高于|多于|超)[^\d]{0,2}(\d+(?:\.\d+)?)/,'price','min'],
        [/(?:销量|数量)(?:超过|大于|高于|多于|超)[^\d]{0,2}(\d+(?:\.\d+)?)/,'qty','min'],
        [/销售额(?:超过|大于|高于|多于|超)[^\d]{0,2}(\d+(?:\.\d+)?)/,'amount','min'],
        [/(?:单价|价格)(?:低于|小于|不足|不到)[^\d]{0,2}(\d+(?:\.\d+)?)/,'price','max'],
        [/(?:销量|数量)(?:低于|小于|不足|不到)[^\d]{0,2}(\d+(?:\.\d+)?)/,'qty','max'],
        [/销售额(?:低于|小于|不足|不到)[^\d]{0,2}(\d+(?:\.\d+)?)/,'amount','max'],
      ],
      groupWords: [
        [/各门店|每个门店|按门店|门店.*对比|哪个门店/, 'store'],
        [/各品类|每个品类|按品类|品类.*对比|哪类/, 'category'],
        [/各月|每月|按月|月度|趋势/, 'month'],
      ],
      groupInfer: [['品类','category'],['门店','store']],
      defaultTopGroup: 'store',
      catStrip: /^现制|^轻食|^周边/,
      vagueSignal: /销售额|销量|单价|数量|多少|几|最高|最低|平均|对比|趋势|占比|比例|记录|排行/,
    },
    labels: {
      metric: { amount:'销售额', qty:'销量', price:'单价' },
      agg:    { sum:'总', avg:'平均', max:'最高', min:'最低', count:'记录数' },
      group:  { store:'门店', category:'品类', month:'月份', quarter:'季度', year:'年度' },
      range:  { price:'单价', qty:'销量', amount:'销售额' },
    },
    units: { qty:' 件', amount:' 元' },
    vague: {
      examples: [
        '· 汇总：「八月份总销售额是多少？」',
        '· 排行：「哪个门店销售额最高？」「销量前三的品类」',
        '· 对比：「各品类销量对比」「各年销售额对比」',
        '· 占比/阈值：「现制饮品占比多少？」「单价30以上的销量」',
        '· 趋势：「各月销售额趋势」「8月环比增长多少？」',
      ],
      footer: '也可以直接点击下方问数方向提示。',
    },
  },

  table: {
    cols: [
      { key:'date',     label:'日期',       num:true, sortable:true },
      { key:'store',    label:'门店',       filter:true },
      { key:'category', label:'品类',       filter:true },
      { key:'price',    label:'单价(元)',   num:true, sortable:true, fmt:v=>v.toFixed(1) },
      { key:'qty',      label:'数量(件)',   num:true, sortable:true },
      { key:'amount',   label:'销售额(元)', num:true, sortable:true, fmt:v=>v.toLocaleString() },
    ],
  },

  copy: {
    title: '数净 · Excel 数据校验与智能问数原型',
    brand: '数净 DataClean QA',
    subtitle: 'Excel 校验修复 · 自然语言问数 · 功能原型',
    headerHint: '支持 .xlsx / .xls / .csv · 需含表头：日期/门店/品类/单价/数量/销售额',
    greeting: '你好，我是问数助手。数据加载后即可提问，例如「各门店销售额对比」。支持多轮追问，如「那 8 月呢」。',
    hints: [
      '2026年7月总销售额是多少？',
      '哪个门店销售额最高？',
      '各品类销量分别是多少？',
      '8月销售额环比增长多少？',
      '销售额前三的门店',
    ],
  },

  mock: {
    rowCount: 220,
    dateRange: { from:[2025,5,1], to:[2026,7,18] },   // 2025-06-01 ~ 2026-08-18
    stores: ['华东旗舰店','华北中心店','华南天河店','西南锦江店'],
    cats: [['现制饮品',12,28],['烘焙点心',8,38],['轻食简餐',25,58],['周边零售',49,129]],
    /* 注入错误（覆盖各类校验规则）：patch 覆盖正常行；amountFix 为不一致倍数 */
    bad: [
      {patch:{store:''}},                 // 门店空值 → 剔除
      {patch:{qty:''}},                   // 数量空值 → 剔除
      {patch:{amount:''}},                // 销售额空值 → 重算修复
      {patch:{qty:-3}},                   // 数量超范围(负) → 剔除
      {patch:{qty:99999}},                // 数量超范围(极大) → 剔除
      {patch:{price:0}},                  // 单价超范围(0) → 剔除
      {patch:{price:'２５．５'}},          // 全角符号 → 修复
      {patch:{price:'¥32.5'}},            // 货币符号 → 修复
      {patch:{qty:'6件'}},                // 单位混入 → 修复
      {patch:{amount:'1,280'}},           // 千分位符号 → 修复
      {patch:{price:'45.0'}},             // 数值转文字 → 修复
      {patch:{qty:'十五'}},               // 中文数字 → 修复
      {patch:{date:'2026/7/15'}},         // 日期格式 → 修复
      {patch:{}, amountFix:3.7},          // 销售额≠单价×数量 → 重算修复
    ],
  },
});
