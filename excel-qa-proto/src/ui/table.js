/* 表格视图：修复前标注表 / 修复后表 / 表头排序 / 门店品类筛选弹层 */
import { Store } from '../core/store.js';
import { $ } from './dom.js';

/* ---- 表头构建：可排序列（日期/单价/数量/销售额）+ 可筛选列（门店/品类） ---- */
function headHtml(){
  const t = Store.tblState;
  const arrow = k => t.sortKey===k ? `<span class="arr">${t.sortDir>0?'▲':'▼'}</span>` : '';
  const funnel = (k,on) => `<svg class="funnel${on?' on':''}" data-filter="${k}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;
  return `<thead><tr><th>#</th>
    <th class="sortable" data-sort="date">日期${arrow('date')}</th>
    <th>门店${funnel('store',t.fStore)}</th>
    <th>品类${funnel('category',t.fCat)}</th>
    <th class="sortable" data-sort="price">单价(元)${arrow('price')}</th>
    <th class="sortable" data-sort="qty">数量(件)${arrow('qty')}</th>
    <th class="sortable" data-sort="amount">销售额(元)${arrow('amount')}</th></tr></thead>`;
}

/* 应用筛选 + 排序 */
function tblRows(rows){
  const t = Store.tblState;
  let out = rows.filter(r=> (!t.fStore || t.fStore.has(String(r.store??'(空)'))) && (!t.fCat || t.fCat.has(String(r.category??'(空)'))) );
  if(t.sortKey){
    const k = t.sortKey, d = t.sortDir;
    out = out.slice().sort((a,b)=>{
      const na = parseFloat(a[k]), nb = parseFloat(b[k]);
      if(!isNaN(na) && !isNaN(nb)) return (na-nb)*d;
      return String(a[k]??'').localeCompare(String(b[k]??''))*d;
    });
  }
  return out;
}

export function renderCurrentTable(){ Store.view==='clean' ? renderTable() : renderRawTable(); }

/* 列筛选弹层 */
export function openColFilter(kind, anchor){
  const pop = $('colFilter');
  const key = kind==='store' ? 'fStore' : 'fCat';
  const rows = Store.view==='clean' ? Store.cleanRows : Store.rawRows;
  const values = [...new Set(rows.map(r=>String(r[kind]??'(空)')))].sort();
  const cur = Store.tblState[key];
  pop.innerHTML = `<div style="font-size:12px;color:var(--text-sub);margin-bottom:6px">筛选「${kind==='store'?'门店':'品类'}」</div>` +
    values.map(v=>`<label class="opt"><input type="checkbox" value="${v}" ${(!cur||cur.has(v))?'checked':''}>${v}</label>`).join('') +
    `<div class="foot"><button class="btn primary sm" data-act="ok">确定</button><button class="btn sm" data-act="reset">重置</button></div>`;
  const rc = anchor.getBoundingClientRect();
  pop.style.display = 'block';
  pop.style.top = Math.min(rc.bottom+4, innerHeight-pop.offsetHeight-10)+'px';
  pop.style.left = Math.min(rc.left, innerWidth-210)+'px';
  pop.querySelector('[data-act="ok"]').onclick = ()=>{
    const checked = [...pop.querySelectorAll('input:checked')].map(i=>i.value);
    Store.tblState[key] = checked.length===values.length ? null : new Set(checked);
    pop.style.display = 'none'; renderCurrentTable();
  };
  pop.querySelector('[data-act="reset"]').onclick = ()=>{ Store.tblState[key]=null; pop.style.display='none'; renderCurrentTable(); };
}

/* ---- 原始数据表（标注模式：橙色=将修正，红色=将剔除，悬浮查看规则与处置） ---- */
const COLS = [['date','日期'],['store','门店'],['category','品类'],['price','单价'],['qty','数量'],['amount','销售额']];
export function renderRawTable(){
  const w = $('tableWrap');
  const issues = Store.pending ? Store.pending.issues : [];
  const mark = {};
  issues.forEach(i=>{ (mark[i.rowId]=mark[i.rowId]||{})[i.field]=i; });
  let rows = tblRows(Store.rawRows);
  /* 问题行默认置顶（剔除优先于修正），用户点击表头排序后按用户排序展示 */
  if(!Store.tblState.sortKey){
    const rank = r => { const m = mark[r.id]; if(!m) return 2; return Object.values(m).some(i=>i.action==='removed') ? 0 : 1; };
    rows = rows.slice().sort((a,b)=>rank(a)-rank(b));
  }
  w.innerHTML = `<div class="legend">
      <span><i style="background:#f3d9ae"></i>将修正</span>
      <span><i style="background:#f3b8b8"></i>将剔除</span>
      <span style="margin-left:auto">问题行已置顶 · 悬浮彩色单元格查看原因 · 点击表头可排序/筛选 · 共 ${Store.rawRows.length} 行</span>
    </div>
    <table>
    ${headHtml()}
    <tbody>${rows.map(r=>{
      const del = mark[r.id] && Object.values(mark[r.id]).some(i=>i.action==='removed');
      return `<tr${del?' style="opacity:.62"':''}><td style="color:var(--text-sub)">${r.id}</td>` +
        COLS.map(([k])=>{
          const mk = mark[r.id] && mark[r.id][k];
          const v = (r[k]===undefined||r[k]===null||r[k]==='') ? '(空)' : String(r[k]);
          const cls = ['price','qty','amount','date'].includes(k)?'num':'';
          if(mk) return `<td class="${cls} ${mk.action==='fixed'?'mk-fix':'mk-del'}" title="[${mk.action==='fixed'?'将修正':'将剔除'}] ${mk.rule}&#10;原值：${String(mk.before)} → 处置：${String(mk.after)}">${v}</td>`;
          return `<td class="${cls}">${v}</td>`;
        }).join('') + '</tr>';
    }).join('')}</tbody>
    <tfoot><tr><td colspan="7">原始数据预览（含标注）· 点击左侧「开始校验修复」生成清洗后表单</td></tr></tfoot>
  </table>`;
  $('tblTitle').textContent = '修复前数据表单';
  $('tblTag').textContent = `模块 ② · 原始数据 ${Store.rawRows.length} 行`;
}

export function renderTable(){
  const w = $('tableWrap');
  if(!Store.cleanRows.length){ return; }
  const all = tblRows(Store.cleanRows);
  const rows = all.slice(0,200);
  w.innerHTML = `<table>
    ${headHtml()}
    <tbody>${rows.map(r=>`<tr>
      <td style="color:var(--text-sub)">${r.id}</td><td class="num">${r.date}</td>
      <td>${r.store}</td><td>${r.category}</td>
      <td class="num">${r.price.toFixed(1)}</td><td class="num">${r.qty}</td>
      <td class="num">${r.amount.toLocaleString()}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="7">显示 ${rows.length} / ${all.length} 行${Store.cleanRows.length>all.length?'（已筛选）':all.length>200?'（预览前 200 行）':''} · 问数基于全量清洗后数据</td></tr></tfoot>
  </table>`;
  $('tblTitle').textContent = '修复后数据表单';
  $('tblTag').textContent = `模块 ② · ${Store.cleanRows.length} 行`;
}

/* 表头排序/筛选事件（委托）+ 弹层外点关闭 */
export function bindTableEvents(){
  $('tableWrap').addEventListener('click', e=>{
    const s = e.target.closest('[data-sort]');
    if(s){
      const k = s.dataset.sort, t = Store.tblState;
      if(t.sortKey!==k){ t.sortKey=k; t.sortDir=1; }
      else if(t.sortDir===1){ t.sortDir=-1; }
      else { t.sortKey=null; }
      renderCurrentTable(); return;
    }
    const f = e.target.closest('[data-filter]');
    if(f){ e.stopPropagation(); openColFilter(f.dataset.filter, f); }
  });
  document.addEventListener('click', e=>{
    const pop = $('colFilter');
    if(pop.style.display==='block' && !e.target.closest('#colFilter') && !e.target.closest('[data-filter]')) pop.style.display='none';
  });
}
