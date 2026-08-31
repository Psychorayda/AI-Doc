/* QueryEngine 工厂 —— 本地结构化查询（问数的执行层，零成本）
 * 优先命中 Mart 预计算结果；行级计算兜底；支持环比/同比、占比、阈值、季度/年度
 * 标签/单位/维度字段由画像注入（lex.labels / lex.units / lex.dims） */
import { Mart } from '../data/mart.js';
import { round } from '../core/num.js';

export function createQueryEngine(lex){
  const METRIC_NAME = lex.labels.metric, AGG_NAME = lex.labels.agg,
        GROUP_NAME = lex.labels.group, RANGE_NAME = lex.labels.range;
  const DIMS = lex.dims;
  const unitOf = m => lex.units[m] || '';

  function aggregate(rows, metric, agg){
    if(agg==='count') return rows.length;
    const vals = rows.map(r=>r[metric]).filter(v=>typeof v==='number');
    if(!vals.length) return 0;
    if(agg==='sum') return vals.reduce((a,b)=>a+b,0);
    if(agg==='avg') return vals.reduce((a,b)=>a+b,0)/vals.length;
    if(agg==='max') return Math.max(...vals);
    if(agg==='min') return Math.min(...vals);
    return 0;
  }

  /* spec: {metric, agg, groupBy, filters:{store,category,month,year,quarter,range}, topN, order, compare, ratio} */
  function run(spec, rows, mart){
    /* 环比/同比：直接命中 Mart 预计算 */
    if(spec.compare && spec.filters && spec.filters.month && mart){
      const m = spec.filters.month;
      const cur = mart.month[m];
      const cmp = (mart.monthCmp[m]||{})[spec.compare];
      const refM = spec.compare==='mom' ? Mart.prevMonth(m) : Mart.prevYear(m);
      const field = spec.metric==='qty' ? 'qty' : 'amount';
      return { type:'compare', compare:spec.compare, metric:spec.metric, month:m, refMonth:refM,
        cur: cur ? cur[field] : null,
        ref: cmp ? (field==='qty' ? mart.month[refM].qty : mart.month[refM].amount) : null,
        delta: cmp ? (field==='qty' ? cmp.qtyDelta : cmp.amountDelta) : null,
        pct: cmp ? (field==='qty' ? cmp.qtyPct : cmp.amountPct) : null,
        matched: cur ? cur.count : 0 };
    }
    let r = rows.slice();
    const f = spec.filters||{};
    DIMS.forEach(d=>{ if(f[d]) r = r.filter(x=>String(x[d]).includes(f[d])); });
    if(f.month)   r = r.filter(x=>x.date.startsWith(f.month));
    else if(f.year) r = r.filter(x=>x.date.startsWith(f.year));
    if(f.quarter) r = r.filter(x=>Mart.qOf(x.date.slice(0,7))===f.quarter);
    if(f.range)   r = r.filter(x=>(f.range.min===undefined||x[f.range.field]>=f.range.min)&&(f.range.max===undefined||x[f.range.field]<=f.range.max));
    const metric = spec.metric||lex.metrics[0], agg = spec.agg||'sum';
    /* 占比：子集 ÷ 时间范围总体（时间过滤外的其余过滤构成子集） */
    if(spec.ratio){
      const timeRows = rows.filter(x=>(!f.month||x.date.startsWith(f.month))&&(!f.year||x.date.startsWith(f.year))&&(!f.quarter||Mart.qOf(x.date.slice(0,7))===f.quarter));
      const part = r.reduce((a,x)=>a+(+x[metric]||0),0);
      const whole = timeRows.reduce((a,x)=>a+(+x[metric]||0),0);
      return { type:'ratio', metric, part:round(part), whole:round(whole),
        pct: whole? round(part/whole*100):0, matched:r.length, scopeN:timeRows.length,
        label: DIMS.map(d=>f[d]).find(Boolean)||'所选范围' };
    }
    if(spec.groupBy){
      const g = {};
      r.forEach(row=>{ const mo = row.date.slice(0,7);
        const k = spec.groupBy==='month' ? mo : spec.groupBy==='quarter' ? Mart.qOf(mo) : spec.groupBy==='year' ? mo.slice(0,4) : row[spec.groupBy];
        (g[k]=g[k]||[]).push(row); });
      let out = Object.entries(g).map(([k,list])=>({key:k, value:round(aggregate(list,metric,agg)), n:list.length}));
      out.sort((a,b)=> spec.order==='asc' ? a.value-b.value : b.value-a.value);
      if(spec.topN) out = out.slice(0,spec.topN);
      return { type:'group', groupBy:spec.groupBy, metric, agg, rows:out, matched:r.length };
    }
    return { type:'scalar', metric, agg, value:round(aggregate(r,metric,agg)), matched:r.length,
      month: f.month||null };
  }

  /* 数据范围注记：问题未限定时间时强制附上（返回无括号文本由调用方拼接） */
  function rangeNote(spec, mart){
    const f = spec.filters||{};
    if(f.month || f.year || f.quarter || !mart) return '';
    const ks = Object.keys(mart.month).sort();
    return ks.length ? `数据范围：${ks[0]} ~ ${ks[ks.length-1]}` : '';
  }

  /* 本地模板化回答（LLM 不可用时的兜底输出） */
  function renderLocal(spec, res, mart){
    const mName = METRIC_NAME[res.metric], aName = AGG_NAME[res.agg]||'';
    const f = spec.filters||{};
    const note = rangeNote(spec, mart);
    const scope = [f.month, f.year, f.quarter, ...DIMS.map(d=>f[d]),
      f.range?`${RANGE_NAME[f.range.field]}${f.range.min!==undefined?'≥'+f.range.min:''}${f.range.max!==undefined?'≤'+f.range.max:''}`:null
    ].filter(Boolean).join('·') || '全部数据';
    if(res.type==='ratio'){
      const unit = unitOf(res.metric);
      if(!res.scopeN) return '当前时间范围内没有数据，无法计算占比。';
      if(!res.matched) return `「${res.label}」在该范围内没有匹配记录，占比为 0%。`;
      return `${res.label}的${METRIC_NAME[res.metric]}为 ${res.part.toLocaleString()}${unit}，占${f.month||f.year||f.quarter||'全部'}总量 ${res.whole.toLocaleString()}${unit} 的 ${res.pct}%（命中 ${res.matched} 条${note?'，'+note:''}）。`;
    }
    if(res.type==='compare'){
      const label = res.compare==='mom' ? '环比' : '同比';
      const unit = unitOf(res.metric);
      if(!res.matched) return `${res.month} 没有匹配的数据记录。`;
      if(res.ref==null) return `${res.month} ${METRIC_NAME[res.metric]}为 ${res.cur.toLocaleString()}${unit}，但缺少${label}基期（${res.refMonth}）数据，无法计算${label}。`;
      const dir = res.delta>=0 ? '增长' : '下降';
      return `${res.month} ${METRIC_NAME[res.metric]}为 ${res.cur.toLocaleString()}${unit}，${label}（对比 ${res.refMonth}）${dir} ${Math.abs(res.delta).toLocaleString()}${unit}，${dir}幅 ${Math.abs(res.pct)}%。`;
    }
    if(res.matched===0) return `在「${scope}」范围内没有匹配的数据记录${note?'（'+note+'）':''}。`;
    if(res.type==='scalar'){
      let base = res.agg==='count'
        ? `${scope}共有 ${res.value} 条记录${note?'（'+note+'）':''}。`
        : `${scope}的${aName}${mName}为 ${res.value.toLocaleString()}${unitOf(res.metric)}（基于 ${res.matched} 条记录${note?'，'+note:''}）。`;
      /* 月度标量查询附赠 Mart 预计算的环比信息（按当前度量取 <m>Delta/<m>Pct） */
      if(res.month && mart && mart.monthCmp[res.month] && mart.monthCmp[res.month].mom){
        const c = mart.monthCmp[res.month].mom;
        const d = c[res.metric+'Delta'], p = c[res.metric+'Pct'];
        if(p!=null) base += `（环比 ${mart.monthCmp[res.month].refMom}：${d>=0?'+':''}${d.toLocaleString()}${unitOf(res.metric)}，${p>=0?'+':''}${p}%）`;
      }
      return base;
    }
    const unit = unitOf(res.metric);
    const lines = res.rows.map((x,i)=>`${i+1}. ${x.key}：${x.value.toLocaleString()}${unit}（${x.n}条）`);
    return `按${GROUP_NAME[res.groupBy]}统计的${aName}${mName}（${scope}${note?'，'+note:''}）：\n${lines.join('\n')}`;
  }

  return { run, renderLocal };
}
