/* Profile —— 领域画像契约（换主题 = 新增一个画像文件，核心代码零改动）
 *
 * profile = {
 *   id: string,                        // 画像标识
 *   schema: {                          // Excel 表头门禁（createExcelIO 消费）
 *     required: [[中文标准名, 字段名], ...],
 *     alias:    { 别名: 中文标准名, ... },
 *     mock:     { sheetName, fileName, rowMap: (row)=>({中文表头:值, ...}) }
 *   },
 *   rules: Rule[],                     // 清洗规则流水线（Validator.run 消费，见 data/validator.js Rules 工厂）
 *   dims: {                            // 枚举维度（main.js 构建 enumCache / mock 消费）
 *     stores: { field, label },        // 对应 spec.filters.store / enums.stores
 *     cats:   { field, label }         // 对应 spec.filters.category / enums.cats
 *   },
 *   nlu: {                             // createNLU / createQueryEngine 消费
 *     metrics:  ['amount','qty','price'],      // spec.metric 白名单（首项为默认指标）
 *     dims:     ['store','category'],          // spec.groupBy / filters 维度字段白名单
 *     specHint: string,                        // LLM 抽参的 JSON 结构提示
 *     prompt:   { fieldDesc, storeLabel, catLabel, rules, examples[] },
 *                                           // examples 支持 {{M08}}/{{M07}} 占位（按数据最新该月替换）
 *     rule: {                                // 规则兜底引擎的领域词表
 *       metricWords:   [[RegExp, metric], ...],
 *       rangePatterns: [[RegExp, field, 'min'|'max'], ...],
 *       groupWords:    [[RegExp, groupBy], ...],
 *       groupInfer:    [[关键词, groupBy], ...],   // “最高/前 N”缺维度时按词推断
 *       defaultTopGroup: groupBy,                 // 仍无维度时的默认
 *       catStrip:      RegExp | null,             // 品类枚举匹配时的前缀裁剪
 *       vagueSignal:   RegExp                     // 模糊问数信号词
 *     },
 *     labels: { metric, agg, group, range },   // renderLocal 中文标签
 *     units:  { [metric]: ' 件' | ' 元' },      // renderLocal 单位
 *     vague:  { examples[], footer }            // 模糊问数回复模板
 *   },
 *   copy: { title, brand, subtitle, headerHint, greeting, hints[] },  // UI 文案（main.js 注入 index.html）
 *   table: {                           // 表格视图列定义（createTable 消费，ui/table.js）
 *     cols: [{ key, label,             // 字段名 + 表头/筛选弹层中文标签
 *              num?:bool,              // 数值列（右对齐样式）
 *              sortable?:bool,         // 表头可排序
 *              filter?:bool,           // 表头漏斗筛选（tblState.filters[key]）
 *              fmt?:(v)=>string }],    // 清洗后表的单元格格式化（原始表始终显示原值）
 *   },
 *   mock: { rowCount, dateRange:{from,to}, stores[], cats:[[名,价min,价max]], bad[] }  // createMock 消费
 * }
 *
 * 当前边界（v1）：spec 结构（metric/groupBy/filters/compare/ratio）与 Mart 预计算结构
 * （amount/qty 聚合、月/季/年桶）属核心层，画像不替换；date 字段为时间维固定字段。
 */

/* 校验画像最小完整性，缺关键段时尽早报错（启动期 fail-fast） */
export function defineProfile(p){
  for(const k of ['id','schema','rules','dims','nlu','copy','table','mock'])
    if(!p[k]) throw new Error(`Profile 缺少字段：${k}`);
  return p;
}
