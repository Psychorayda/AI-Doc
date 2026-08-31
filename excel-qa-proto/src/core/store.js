/* 全局状态单例（字段直接读写以维持既有行为） */
export const Store = {
  rawRows: [],        // 原始行
  cleanRows: [],      // 修复后行（问数只查这里）
  issues: [],         // {rowId, field, rule, before, after, action:'fixed'|'removed'}
  pending: null,      // 载入时预跑的校验结果 {clean, issues}，供原始表标注；点击「开始校验修复」后转正
  mart: null,         // 修复后数据的预计算标准化结构
  issueFilter: 'all',
  view: 'none',       // 当前中栏视图：'raw' | 'clean'
  tblState: { sortKey:null, sortDir:1, filters:{} },  // 表头排序/筛选状态（filters 按画像列 key）
  arbCount: 0,        // 双通道仲裁计数
  chat: [],           // 多轮记忆 {role, content}
  enumCache: null,    // 供 LLM 抽参的枚举值（画像 dims 两维 + 月份）
};
