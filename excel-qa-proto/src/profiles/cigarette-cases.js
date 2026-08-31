/* 卷烟销售画像黄金问数集（10 条）：规则通道离线回归
 * 覆盖：汇总/排行/分组对比/趋势/环比/占比/阈值/季度/维度+月份组合/多轮追问
 * e: 期望 spec 关键字段；m: 期望命中 'pos'(>0) | 'zero'(===0)；prev/prevQ: 追问上下文 */
export const cigaretteCases = [
  { q:'2025年3月总销售额是多少？',   e:{month:'2025-03'},                                  m:'pos' },
  { q:'哪个零售户销售额最高？',      e:{groupBy:'store', topN:1},                           m:'pos' },
  { q:'各品牌销量对比',             e:{metric:'qty', groupBy:'category'},                  m:'pos' },
  { q:'各月销售额趋势',             e:{groupBy:'month'},                                   m:'pos' },
  { q:'2月销售额环比增长多少？',     e:{compare:'mom', month:'2025-02'},                    m:'pos' },
  { q:'中华销售额占比多少？',        e:{ratio:true, category:'中华'},                       m:'pos' },
  { q:'单价500元以上的总销售额',     e:{range:{field:'price', min:500}},                    m:'pos' },
  { q:'一季度销售额',               e:{quarter:'2025-Q1'},                                 m:'pos' },
  { q:'红塔山3月销量是多少？',       e:{metric:'qty', category:'红塔山', month:'2025-03'},  m:'pos' },
  { q:'那2月呢？',                 e:{month:'2025-02'},                                   m:'pos',
    prev:{filters:{month:'2025-01'}}, prevQ:'2025年1月总销售额是多少？' },
];
