/* Mart —— 修复后数据的预计算层（标准化结构，供问数直接命中）
 * 预计算：月/季/年 × 全局 的合计/均值/计数；门店/品类维度排行；
 *        门店×月交叉；月度环比/同比增量与增幅 */
const round = v => Math.round(v*100)/100;
const qOf = m => `${m.slice(0,4)}-Q${Math.ceil(+m.slice(5,7)/3)}`;
const prevMonth = m => { let [y,mo]=m.split('-').map(Number); mo--; if(mo<1){mo=12;y--;} return `${y}-${String(mo).padStart(2,'0')}`; };
const prevYear  = m => `${+m.slice(0,4)-1}${m.slice(4)}`;

function aggOf(list){
  const amount = round(list.reduce((a,r)=>a+r.amount,0));
  const qty = list.reduce((a,r)=>a+r.qty,0);
  return { amount, qty, priceAvg: qty? round(amount/qty):0, count:list.length };
}

function build(rows){
  const bucket = { month:{}, quarter:{}, year:{}, store:{}, category:{}, storeMonth:{} };
  const add = (o,k,r)=>{ (o[k]=o[k]||[]).push(r); };
  rows.forEach(r=>{
    const mo = r.date.slice(0,7);
    add(bucket.month,mo,r); add(bucket.quarter,qOf(mo),r); add(bucket.year,mo.slice(0,4),r);
    add(bucket.store,r.store,r); add(bucket.category,r.category,r); add(bucket.storeMonth,r.store+'|'+mo,r);
  });
  const aggMap = o => Object.fromEntries(Object.entries(o).map(([k,l])=>[k,aggOf(l)]));
  const mart = {
    n: rows.length, total: aggOf(rows),
    month: aggMap(bucket.month), quarter: aggMap(bucket.quarter), year: aggMap(bucket.year),
    store: aggMap(bucket.store), category: aggMap(bucket.category), storeMonth: aggMap(bucket.storeMonth)
  };
  /* 月度环比/同比：增量 + 增幅% */
  mart.monthCmp = {};
  Object.keys(mart.month).sort().forEach(m=>{
    const cur = mart.month[m], pm = mart.month[prevMonth(m)], py = mart.month[prevYear(m)];
    const cmp = ref => ref ? {
      amountDelta: round(cur.amount-ref.amount),
      amountPct: ref.amount ? round((cur.amount-ref.amount)/ref.amount*100) : null,
      qtyDelta: cur.qty-ref.qty,
      qtyPct: ref.qty ? round((cur.qty-ref.qty)/ref.qty*100) : null
    } : null;
    mart.monthCmp[m] = { mom: cmp(pm), yoy: cmp(py), refMom: prevMonth(m), refYoy: prevYear(m) };
  });
  /* 维度排行（按销售额降序，升序由查询层反转即可） */
  const rankOf = o => Object.entries(o).map(([key,v])=>({key,...v})).sort((a,b)=>b.amount-a.amount);
  mart.rank = { store: rankOf(mart.store), category: rankOf(mart.category) };
  return mart;
}

export const Mart = { build, prevMonth, prevYear, qOf };
