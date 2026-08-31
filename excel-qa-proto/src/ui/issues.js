/* 校验报告视图：统计卡 + 问题清单 + 分类筛选 */
import { Store } from '../core/store.js';
import { $ } from './dom.js';

export function renderIssues(){
  const z = $('issueZone'), list = $('issues');
  if(!Store.issues.length){ z.style.display='none'; $('issueEmpty').style.display='block'; return; }
  z.style.display='block'; $('issueEmpty').style.display='none';
  const f = Store.issueFilter;
  const show = Store.issues.filter(i=>f==='all'||i.action===f);
  list.innerHTML = show.map(i=>`
    <div class="issue ${i.action}">
      <span class="dot"></span>
      <div class="what">#${i.rowId} <code>${i.field}</code> ${i.rule}<br>
        <span style="color:var(--text-sub)">${String(i.before)} → ${String(i.after)}</span></div>
      <span class="act">${i.action==='fixed'?'已修正':'已剔除'}</span>
    </div>`).join('') || '<div class="empty">该分类下无记录</div>';
}

export function renderStats(){
  $('stats').style.display = 'grid';
  $('stRaw').textContent = Store.rawRows.length;
  $('stFixed').textContent = Store.issues.filter(i=>i.action==='fixed').length;
  $('stRemoved').textContent = Store.issues.filter(i=>i.action==='removed').length;
  $('stClean').textContent = Store.cleanRows.length;
  $('stArb').textContent = Store.arbCount||0;
}

export function setArb(n){ const el = $('stArb'); if(el) el.textContent = n; }

export function bindIssueFilter(){
  document.querySelectorAll('.f-chip').forEach(b=>b.onclick = ()=>{
    document.querySelectorAll('.f-chip').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); Store.issueFilter = b.dataset.f; renderIssues();
  });
}

export function resetIssueView(){
  $('stats').style.display = 'none';
  $('issueZone').style.display = 'none';
  $('issueEmpty').style.display = 'block';
  document.querySelectorAll('.f-chip').forEach(x=>x.classList.toggle('on', x.dataset.f==='all'));
}
