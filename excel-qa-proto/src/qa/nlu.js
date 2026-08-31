/* NLU 工厂 —— 问数意图解析（词表/prompt 由画像注入，引擎本身无领域词汇）
 *  A. LLM 抽参（主，低成本：prompt 仅含 schema+枚举，不含数据）
 *  B. 规则引擎（兜底，保证永不无响应）
 *  附加：spec 消毒器 / 追问上下文合并 / 月份消歧 / 模糊问数检测
 *  通用分析语法（环比/同比/占比/季度/前N/最高最低）留在引擎；领域词汇走 lexicon */
import { CN_DIGIT } from '../data/cnnum.js';

export function createNLU(lex){
  const DEF_METRIC = lex.metrics[0];

  function buildExtractPrompt(q, lastQ, enums){
    const latestOf = mm => (enums.months||[]).filter(x=>x.slice(5,7)===mm).pop();
    const M08 = latestOf('08')||'2026-08', M07 = latestOf('07')||'2026-07';
    const P = lex.prompt;
    return [
      { role:'system', content:
`你是查询参数提取器。数据字段：${P.fieldDesc}。
${P.storeLabel}枚举：${enums.stores.join('/')}；${P.catLabel}枚举：${enums.cats.join('/')}；数据覆盖月份：${(enums.months||[]).join('、')}（用户未给年份时按此范围映射）。
把问题转成 JSON，结构：${lex.specHint}。
规则：${P.rules}
示例：
${P.examples.map(e=>e.replaceAll('{{M08}}',M08).replaceAll('{{M07}}',M07)).join('\n')}` },
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
    const spec = { metric:DEF_METRIC, agg:'sum', groupBy:null, filters:{}, topN:null, order:'desc' };
    if(s && typeof s==='object'){
      if(lex.metrics.includes(s.metric)) spec.metric=s.metric;
      if(['sum','avg','max','min','count'].includes(s.agg)) spec.agg=s.agg;
      if(lex.dims.concat(['month','quarter','year']).includes(s.groupBy)) spec.groupBy=s.groupBy;
      const f=s.filters||{};
      const matchEnum=(v,list)=>{ if(!v) return null; v=String(v).trim();
        return list.find(e=>e===v)||list.find(e=>e.includes(v))||list.find(e=>v.length>=2&&v.includes(e))||null; };
      const st=matchEnum(f.store,enums.stores); if(st) spec.filters.store=st;
      const ct=matchEnum(f.category,enums.cats); if(ct) spec.filters.category=ct;
      const mm=String(f.month||'').match(/(20\d{2})\D?(\d{1,2})/); if(mm) spec.filters.month=`${mm[1]}-${mm[2].padStart(2,'0')}`;
      const yy=String(f.year||'').match(/(20\d{2})/); if(yy && !spec.filters.month) spec.filters.year=yy[1];
      const qq=String(f.quarter||'').match(/(20\d{2})\D?Q?([1-4])/i); if(qq && !spec.filters.month) spec.filters.quarter=`${qq[1]}-Q${qq[2]}`;
      if(f.range && lex.metrics.includes(f.range.field)){
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
    const R = lex.rule;
    const spec = { metric:DEF_METRIC, agg:'sum', groupBy:null, filters:{}, topN:null };
    if(/占比|比例|占了/.test(q)) spec.ratio=true;
    /* 阈值过滤（匹配片段从指标识别中剔除） */
    let metricQ = q;
    for(const [re,fld,mm] of R.rangePatterns){ const m=q.match(re); if(m){ spec.filters.range={field:fld}; spec.filters.range[mm]=+m[1]; metricQ=q.replace(m[0],' '); break; } }
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
    for(const [re,m] of R.metricWords){ if(re.test(metricQ)){ spec.metric=m; break; } }
    if(/平均|均值/.test(q)) spec.agg='avg';
    else if(/最高|最大|最多|第一|最厉害/.test(q)){ spec.agg='sum'; spec.topN=spec.topN||1; }
    else if(/最低|最少/.test(q)){ spec.agg='sum'; spec.order='asc'; }
    if(/多少条|几笔|几条|记录数/.test(q)) spec.agg='count';
    for(const [re,g] of R.groupWords){ if(re.test(q)){ spec.groupBy=g; break; } }
    const dimNoun = `(?:${lex.prompt.storeLabel}|${lex.prompt.catLabel})`;
    const top = q.match(/前\s*([三3二2五5十10]|\d+)\s*(个|名|家)?/) || q.match(new RegExp(`([三3二2五5十10]|\\d+)\\s*(个|名|家)\\s*${dimNoun}`));
    if(top) spec.topN = {'三':3,'二':2,'五':5,'十':10}[top[1]]||parseInt(top[1]);
    if(!spec.groupBy && /(最高|最低|最多|最少|前)/.test(q)){
      for(const [word,g] of R.groupInfer){ if(q.includes(word)){ spec.groupBy=g; break; } }
    }
    enums.stores.forEach(s=>{ if(q.includes(s)||q.includes(s.slice(0,2))) spec.filters.store=s; });
    enums.cats.forEach(c=>{ if(q.includes(c)||(R.catStrip && q.includes(c.replace(R.catStrip,'')))) spec.filters.category=c; });
    const toMonth = s => /^\d+$/.test(s) ? +s : CN_DIGIT[s];
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
    if(/最高|最低/.test(q) && !spec.groupBy){ spec.groupBy=R.defaultTopGroup; spec.topN=spec.topN||1; }
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
    return !lex.rule.vagueSignal.test(q);
  }
  function vagueReply(enums){
    const range = enums.months && enums.months.length ? `${enums.months[0]} ~ ${enums.months[enums.months.length-1]}` : '';
    return `这个问题有点宽泛，我不确定你想看什么。可以按这些方向问（数据范围：${range}）：\n`+
      lex.vague.examples.join('\n')+'\n'+lex.vague.footer;
  }

  return { buildExtractPrompt, parseSpecJSON, sanitizeSpec, ruleParse, mergeContext, resolveMonth, isVague, vagueReply };
}
