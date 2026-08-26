/* NLU —— 问数意图解析
 *  A. LLM 抽参（主，低成本：prompt 仅含 schema+枚举，不含数据）
 *  B. 规则引擎（兜底，保证永不无响应）
 *  附加：spec 消毒器 / 追问上下文合并 / 月份消歧 / 模糊问数检测 */
const SPEC_HINT = `{"metric":"amount|qty|price","agg":"sum|avg|max|min|count","groupBy":"store|category|month|quarter|year|null","filters":{"store":"门店名或null","category":"品类名或null","month":"YYYY-MM或null","year":"YYYY或null","quarter":"YYYY-Qn或null","range":{"field":"price|qty|amount","min":数或null,"max":数或null}或null},"topN":"数字或null","order":"desc|asc","compare":"mom|yoy|null","ratio":"true|false"}`;

function buildExtractPrompt(q, lastQ, enums){
  const latestOf = mm => (enums.months||[]).filter(x=>x.slice(5,7)===mm).pop();
  const M08 = latestOf('08')||'2026-08', M07 = latestOf('07')||'2026-07';
  return [
    { role:'system', content:
`你是查询参数提取器。数据字段：date(日期), store(门店), category(品类), price(单价元), qty(数量件), amount(销售额元)。
门店枚举：${enums.stores.join('/')}；品类枚举：${enums.cats.join('/')}；数据覆盖月份：${(enums.months||[]).join('、')}（用户未给年份时按此范围映射）。
把问题转成 JSON，结构：${SPEC_HINT}。
规则：默认 metric=amount, agg=sum, order=desc, compare=null, ratio=false；问法出现"销量/件数/多少件"时 metric=qty（即使同时提到销售额相关字眼，以销量为准）；"各/每/分别/对比/哪个/前几"→设置 groupBy；"最高/最多/第一"→order=desc 且 topN=1；"最低/最少"→order=asc；"平均"→agg=avg；"多少条/几笔"→agg=count；含"环比"→compare=mom 且提取 month；含"同比"→compare=yoy 且提取 month；"各年/逐年/按年"→groupBy=year；含"占比/比例"→ratio=true 且提取对应维度过滤；"X以上/超过/大于"→range.min，"X以下/以内"→range.max；"Q3/三季度/第3季度"→filters.quarter；只有年份没有月份→填 year；月份缺少年份→映射到数据中该月份的最近一次出现（通常是最新年份）；数据中没有的年份照实填写（查询层会如实返回0条）；无法确定的字段填 null。只输出 JSON。
示例：
问：八月份总销售额 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":"${M08}"},"topN":null,"order":"desc","compare":null}
问：哪个门店销售额最高 → {"metric":"amount","agg":"sum","groupBy":"store","filters":{"store":null,"category":null,"month":null},"topN":1,"order":"desc","compare":null}
问：各品类销量分别是多少 → {"metric":"qty","agg":"sum","groupBy":"category","filters":{"store":null,"category":null,"month":null},"topN":null,"order":"desc","compare":null}
问：销量最低的三个门店 → {"metric":"qty","agg":"sum","groupBy":"store","filters":{"store":null,"category":null,"month":null},"topN":3,"order":"asc","compare":null}
问：销量最高的前三个品类 → {"metric":"qty","agg":"sum","groupBy":"category","filters":{"store":null,"category":null,"month":null},"topN":3,"order":"desc","compare":null}
问：8月销售额环比增长多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":"${M08}"},"topN":null,"order":"desc","compare":"mom"}
问：7月华东旗舰店烘焙点心卖了多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":"华东旗舰店","category":"烘焙点心","month":"${M07}","year":null},"topN":null,"order":"desc","compare":null}
问：2024年销售额是多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":"2024"},"topN":null,"order":"desc","compare":null}
问：现制饮品销售额占比多少 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":"现制饮品","month":null,"year":null},"topN":null,"order":"desc","compare":null,"ratio":true}
问：单价30元以上的销量 → {"metric":"qty","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":null,"range":{"field":"price","min":30,"max":null}},"topN":null,"order":"desc","compare":null,"ratio":false}
问：三季度销售额 → {"metric":"amount","agg":"sum","groupBy":null,"filters":{"store":null,"category":null,"month":null,"year":null,"quarter":"2026-Q3"},"topN":null,"order":"desc","compare":null,"ratio":false}` },
    ...(lastQ ? [{ role:'user', content:`上一轮问题：${lastQ}\n当前问题（可能省略了条件，请结合上一轮补全）：${q}` }] : [{ role:'user', content:q }])
  ];
}

function parseSpecJSON(text){
  const m = text.match(/\{[\s\S]*\}/);
  if(!m) throw new Error('LLM 未返回 JSON');
  return JSON.parse(m[0]);
}

/* —— spec 消毒器：白名单字段 + 枚举模糊归位 + 默认值，防止脏 spec 查成 0 条 —— */
function sanitizeSpec(s, enums){
  const spec = { metric:'amount', agg:'sum', groupBy:null, filters:{}, topN:null, order:'desc' };
  if(s && typeof s==='object'){
    if(['amount','qty','price'].includes(s.metric)) spec.metric=s.metric;
    if(['sum','avg','max','min','count'].includes(s.agg)) spec.agg=s.agg;
    if(['store','category','month','quarter','year'].includes(s.groupBy)) spec.groupBy=s.groupBy;
    const f=s.filters||{};
    const matchEnum=(v,list)=>{ if(!v) return null; v=String(v).trim();
      return list.find(e=>e===v)||list.find(e=>e.includes(v))||list.find(e=>v.length>=2&&v.includes(e))||null; };
    const st=matchEnum(f.store,enums.stores); if(st) spec.filters.store=st;
    const ct=matchEnum(f.category,enums.cats); if(ct) spec.filters.category=ct;
    const mm=String(f.month||'').match(/(20\d{2})\D?(\d{1,2})/); if(mm) spec.filters.month=`${mm[1]}-${mm[2].padStart(2,'0')}`;
    const yy=String(f.year||'').match(/(20\d{2})/); if(yy && !spec.filters.month) spec.filters.year=yy[1];
    const qq=String(f.quarter||'').match(/(20\d{2})\D?Q?([1-4])/i); if(qq && !spec.filters.month) spec.filters.quarter=`${qq[1]}-Q${qq[2]}`;
    if(f.range && ['price','qty','amount'].includes(f.range.field)){
      const rg={field:f.range.field};
      if(+f.range.min>0 || +f.range.min===0) rg.min=+f.range.min;
      if(+f.range.max>0) rg.max=+f.range.max;
      if(rg.min!==undefined||rg.max!==undefined) spec.filters.range=rg;
    }
    if(+s.topN>0) spec.topN=Math.min(20,Math.round(+s.topN));
    if(s.order==='asc') spec.order='asc';
    if(['mom','yoy'].includes(s.compare)) spec.compare=s.compare;
    if(s.ratio===true||s.ratio==='true') spec.ratio=true;
  }
  return spec;
}

/* —— 规则兜底解析器 —— */
function ruleParse(q, enums){
  const spec = { metric:'amount', agg:'sum', groupBy:null, filters:{}, topN:null };
  if(/占比|比例|占了/.test(q)) spec.ratio=true;
  /* 阈值过滤：单价30以上 / 销量超过15件 / 销售额1000以内（匹配片段从指标识别中剔除） */
  const RANGE_P = [
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
    [/销售额(?:低于|小于|不足|不到)[^\d]{0,2}(\d+(?:\.\d+)?)/,'amount','max']
  ];
  let metricQ = q;
  for(const [re,fld,mm] of RANGE_P){ const m=q.match(re); if(m){ spec.filters.range={field:fld}; spec.filters.range[mm]=+m[1]; metricQ=q.replace(m[0],' '); break; } }
  /* 季度（先于年份匹配，避免"2026年三季度"被吞成仅年份） */
  const QMAP={'一':1,'二':2,'三':3,'四':4};
  if(/各季度|按季度|分季度|季度.*对比/.test(q)) spec.groupBy='quarter';
  else if(/各年|按年|逐年|每年|年度.*对比/.test(q)) spec.groupBy='year';
  const qq = q.match(/(20\d{2})\s*年?\s*(?:第\s*([一二三四1-4])\s*(?:个)?季度|Q([1-4]))/i)
          || q.match(/(?:第\s*)?([一二三四1-4])\s*(?:个)?季度/);
  if(qq){
    const qn = qq[2]||qq[3]||qq[1];
    const n = /^\d$/.test(qn) ? +qn : QMAP[qn];
    const ym2 = qq[0].match(/20\d{2}/);
    spec.filters.quarter = (ym2?ym2[0]:'@DEF@') + '-Q' + n;
  }
  if(/销量|数量|多少件|几件/.test(metricQ)) spec.metric='qty';
  else if(/单价|均价|价格/.test(metricQ)) spec.metric='price';
  if(/平均|均值/.test(q)) spec.agg='avg';
  else if(/最高|最大|最多|第一|最厉害/.test(q)){ spec.agg='sum'; spec.topN=spec.topN||1; }
  else if(/最低|最少/.test(q)){ spec.agg='sum'; spec.order='asc'; }
  if(/多少条|几笔|几条|记录数/.test(q)) spec.agg='count';
  if(/各门店|每个门店|按门店|门店.*对比|哪个门店/.test(q)) spec.groupBy='store';
  else if(/各品类|每个品类|按品类|品类.*对比|哪类/.test(q)) spec.groupBy='category';
  else if(/各月|每月|按月|月度|趋势/.test(q)) spec.groupBy='month';
  const top = q.match(/前\s*([三3二2五5十10]|\d+)\s*(个|名|家)?/) || q.match(/([三3二2五5十10]|\d+)\s*(个|名|家)\s*(门店|品类)/);
  if(top) spec.topN = {'三':3,'二':2,'五':5,'十':10}[top[1]]||parseInt(top[1]);
  if(!spec.groupBy && /(最高|最低|最多|最少|前)/.test(q)){
    if(q.includes('品类')) spec.groupBy='category';
    else if(q.includes('门店')) spec.groupBy='store';
  }
  enums.stores.forEach(s=>{ if(q.includes(s)||q.includes(s.slice(0,2))) spec.filters.store=s; });
  enums.cats.forEach(c=>{ if(q.includes(c)||q.includes(c.replace(/^现制|^轻食|^周边/,''))) spec.filters.category=c; });
  const CNM = {'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12};
  const toMonth = s => /^\d+$/.test(s) ? +s : CNM[s];
  const defYear = (enums.months && enums.months.length) ? enums.months[enums.months.length-1].slice(0,4) : '2026';
  if(spec.filters.quarter && spec.filters.quarter.includes('@DEF@')) spec.filters.quarter = spec.filters.quarter.replace('@DEF@', defYear);
  const ym = q.match(/(20\d{2})\s*年?\s*(\d{1,2})\s*月/) || q.match(/(20\d{2})\s*年\s*(十一|十二|[一二两三四五六七八九十])\s*月/);
  if(ym) spec.filters.month = `${ym[1]}-${String(toMonth(ym[2])).padStart(2,'0')}`;
  else if(!spec.filters.quarter){
    const mm = q.match(/(\d{1,2})\s*月/) || q.match(/(十一|十二|[一二两三四五六七八九十])\s*月/);
    if(mm) spec.filters.month = `${defYear}-${String(toMonth(mm[1])).padStart(2,'0')}`;
    else { const yy = q.match(/(20\d{2})\s*年/); if(yy) spec.filters.year = yy[1]; }  // 仅年份
  }
  if(/环比/.test(q)) spec.compare='mom';
  else if(/同比/.test(q)) spec.compare='yoy';
  if(/最高|最低/.test(q) && !spec.groupBy){ spec.groupBy='store'; spec.topN=spec.topN||1; }
  return spec;
}

/* —— 规则通道上下文合并：追问（那/呢/再/换成…）时继承上一轮缺失的过滤条件 —— */
function mergeContext(spec, lastSpec, q){
  if(!lastSpec || !/(那|呢|再|换成|改为|看看)/.test(q)) return spec;
  const f = spec.filters, pf = lastSpec.filters||{};
  ['month','year','quarter','store','category'].forEach(k=>{ if(!f[k] && pf[k]) f[k]=pf[k]; });
  if(spec.groupBy===null && lastSpec.groupBy && !/(各|每|分别|对比|哪个|前)/.test(q)) spec.groupBy=lastSpec.groupBy;
  return spec;
}

/* —— 月份消歧：用户未给年份时，归一到数据中该月份的最近一次出现（两通道统一执行） —— */
function resolveMonth(spec, enums, q){
  const m = spec.filters && spec.filters.month;
  if(!m || /20\s*\d\s*\d/.test(q)) return spec;   // 明确给了年份 → 尊重用户
  const mo = m.slice(5,7);
  const cands = (enums.months||[]).filter(x=>x.slice(5,7)===mo);
  if(cands.length) spec.filters.month = cands[cands.length-1];
  return spec;
}

/* —— 模糊问数检测：无指标/维度/过滤/聚合任何信号 → 走预设模板，不消耗 token —— */
function isVague(q, spec){
  if(spec.groupBy || spec.compare || spec.ratio || spec.topN) return false;
  const f = spec.filters||{};
  if(f.month || f.year || f.quarter || f.store || f.category || f.range) return false;
  return !/(销售额|销量|单价|数量|多少|几|最高|最低|平均|对比|趋势|占比|比例|记录|排行)/.test(q);
}
function vagueReply(enums){
  const range = enums.months && enums.months.length ? `${enums.months[0]} ~ ${enums.months[enums.months.length-1]}` : '';
  return `这个问题有点宽泛，我不确定你想看什么。可以按这些方向问（数据范围：${range}）：\n`+
    `· 汇总：「八月份总销售额是多少？」\n`+
    `· 排行：「哪个门店销售额最高？」「销量前三的品类」\n`+
    `· 对比：「各品类销量对比」「各年销售额对比」\n`+
    `· 占比/阈值：「现制饮品占比多少？」「单价30以上的销量」\n`+
    `· 趋势：「各月销售额趋势」「8月环比增长多少？」\n`+
    `也可以直接点击下方问数方向提示。`;
}

export const NLU = { buildExtractPrompt, parseSpecJSON, sanitizeSpec, ruleParse, mergeContext, resolveMonth, isVague, vagueReply };
