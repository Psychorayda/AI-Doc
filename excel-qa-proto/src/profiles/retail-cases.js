/* 零售画像黄金问数集（25 条）：规则通道离线回归 + LLM 通道抽参评测
 * e: 期望 spec 关键字段；m: 期望命中 'pos'(>0) | 'zero'(===0)；prev/prevQ: 追问上下文 */
export const retailCases = [
  { q:'八月份总销售额是多少？',        e:{metric:'amount', month:'2026-08'},            m:'pos'  },
  { q:'2025年销售额',                 e:{year:'2025'},                                 m:'pos'  },
  { q:'2024年销售额',                 e:{year:'2024'},                                 m:'zero' },
  { q:'哪个门店销售额最高？',          e:{groupBy:'store', topN:1},                     m:'pos'  },
  { q:'销售额最低的三个门店',          e:{groupBy:'store', topN:3, order:'asc'},         m:'pos'  },
  { q:'销量最高的前三个品类',          e:{metric:'qty', groupBy:'category', topN:3},     m:'pos'  },
  { q:'各品类销量分别是多少？',        e:{metric:'qty', groupBy:'category'},             m:'pos'  },
  { q:'各月销售额趋势',               e:{groupBy:'month'},                              m:'pos'  },
  { q:'各季度销售额对比',             e:{groupBy:'quarter'},                            m:'pos'  },
  { q:'8月平均每件单价多少？',         e:{metric:'price', agg:'avg', month:'2026-08'},   m:'pos'  },
  { q:'有多少条记录？',               e:{agg:'count'},                                 m:'pos'  },
  { q:'8月销售额环比增长多少？',        e:{compare:'mom', month:'2026-08'},               m:'pos'  },
  { q:'2026年7月销售额同比增长多少？',  e:{compare:'yoy', month:'2026-07'},               m:'pos'  },
  { q:'现制饮品销售额占比多少？',       e:{ratio:true, category:'现制饮品'},              m:'pos'  },
  { q:'烘焙点心的销量占比',           e:{ratio:true, metric:'qty', category:'烘焙点心'}, m:'pos' },
  { q:'单价30元以上的总销售额',        e:{range:{field:'price', min:30}},                m:'pos'  },
  { q:'销量超过15件的记录有多少条',     e:{agg:'count', range:{field:'qty', min:15}},     m:'pos'  },
  { q:'2026年三季度销售额',           e:{quarter:'2026-Q3'},                            m:'pos'  },
  { q:'华东旗舰店7月卖了多少',        e:{store:'华东旗舰店', month:'2026-07'},           m:'pos'  },
  { q:'烘焙点心2025年销量',           e:{category:'烘焙点心', year:'2025', metric:'qty'},m:'pos' },
  { q:'十二月份有数据吗？',           e:{month:'2025-12'},                              m:'pos'  },
  { q:'西南锦江店销售额',             e:{store:'西南锦江店'},                            m:'pos'  },
  { q:'各年销售额对比',               e:{groupBy:'year'},                               m:'pos'  },
  { q:'那8月呢？',                   e:{month:'2026-08'},                              m:'pos', prev:{filters:{month:'2026-07'}}, prevQ:'2026年7月总销售额是多少？' },
  { q:'那华南天河店呢？',             e:{store:'华南天河店', month:'2026-07'},           m:'pos', prev:{filters:{month:'2026-07'}}, prevQ:'2026年7月总销售额是多少？' }
];
