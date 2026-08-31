/* Mart —— 修复后数据的预计算层（标准化结构，供问数直接命中）
 * cfg = { metrics:[度量字段...], dims:[枚举维度字段...], avgOf?:[a,b], avgKey?:string }
 * 预计算：月/季/年 × 全局 的各度量合计/计数；各维度桶与排行（按首度量排序）；
 *        首维度×月交叉；月度环比/同比增量与增幅（按度量逐一生成 <m>Delta/<m>Pct） */
import { round } from '../core/num.js';

const qOf = m => `${m.slice(0,4)}-Q${Math.ceil(+m.slice(5,7)/3)}`;
const prevMonth = m => { let [y,mo]=m.split('-').map(Number); mo--; if(mo<1){mo=12;y--;} return `${y}-${String(mo).padStart(2,'0')}`; };
const prevYear  = m => `${+m.slice(0,4)-1}${m.slice(4)}`;

/* 从画像提取 Mart 配置：nlu.metrics / nlu.dims + 可选 profile.mart（avgOf/avgKey） */
function cfgOf(p){
  return { metrics: p.nlu.metrics, dims: p.nlu.dims, ...(p.mart||{}) };
}

function aggOf(list, cfg){
  const out = { count: list.length };
  cfg.metrics.forEach(m=>{ out[m] = round(list.reduce((a,r)=>a+(+r[m]||0),0)); });
  if(cfg.avgOf){ const [a,b] = cfg.avgOf; out[cfg.avgKey||'avg'] = out[b] ? round(out[a]/out[b]) : 0; }
  return out;
}

function build(rows, cfg){
  const bucket = { month:{}, quarter:{}, year:{}, dimMonth:{} };
  cfg.dims.forEach(d=>{ bucket[d]={}; });
  const add = (o,k,r)=>{ (o[k]=o[k]||[]).push(r); };
  rows.forEach(r=>{
    const mo = r.date.slice(0,7);
    add(bucket.month,mo,r); add(bucket.quarter,qOf(mo),r); add(bucket.year,mo.slice(0,4),r);
    cfg.dims.forEach(d=> add(bucket[d], r[d], r));
    add(bucket.dimMonth, r[cfg.dims[0]]+'|'+mo, r);
  });
  const aggMap = o => Object.fromEntries(Object.entries(o).map(([k,l])=>[k,aggOf(l,cfg)]));
  const mart = {
    n: rows.length, total: aggOf(rows,cfg),
    month: aggMap(bucket.month), quarter: aggMap(bucket.quarter), year: aggMap(bucket.year),
    dimMonth: aggMap(bucket.dimMonth)
  };
  cfg.dims.forEach(d=>{ mart[d] = aggMap(bucket[d]); });
  /* 月度环比/同比：按度量逐一生成 <m>Delta / <m>Pct */
  mart.monthCmp = {};
  Object.keys(mart.month).sort().forEach(m=>{
    const cur = mart.month[m], pm = mart.month[prevMonth(m)], py = mart.month[prevYear(m)];
    const cmp = ref => {
      if(!ref) return null;
      const o = {};
      cfg.metrics.forEach(k=>{
        o[k+'Delta'] = round(cur[k]-ref[k]);
        o[k+'Pct'] = ref[k] ? round((cur[k]-ref[k])/ref[k]*100) : null;
      });
      return o;
    };
    mart.monthCmp[m] = { mom: cmp(pm), yoy: cmp(py), refMom: prevMonth(m), refYoy: prevYear(m) };
  });
  /* 维度排行（按首度量降序，升序由查询层反转即可） */
  const m0 = cfg.metrics[0];
  const rankOf = o => Object.entries(o).map(([key,v])=>({key,...v})).sort((a,b)=>b[m0]-a[m0]);
  mart.rank = Object.fromEntries(cfg.dims.map(d=>[d, rankOf(mart[d])]));
  return mart;
}

export const Mart = { build, cfgOf, prevMonth, prevYear, qOf };
