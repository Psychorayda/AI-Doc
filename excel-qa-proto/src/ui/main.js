/* main —— 装配入口：实例化模块、绑定事件、数据装载流程 */
import { Store } from '../core/store.js';
import { MockData } from '../data/mock.js';
import { ExcelIO } from '../data/excel.js';
import { Validator } from '../data/validator.js';
import { Mart } from '../data/mart.js';
import { createLLMClient } from '../qa/llm.js';
import { createChat } from '../qa/chat.js';
import { createEvalRunner } from '../qa/eval.js';
import { $ } from './dom.js';
import { renderRawTable, renderTable, bindTableEvents } from './table.js';
import { renderStats, renderIssues, setArb, bindIssueFilter, resetIssueView } from './issues.js';
import { addMsg, addThinking, clearChat } from './chatview.js';
import { toast, showAlert, refreshChip, bindSettings } from './settings.js';

const llm = createLLMClient();
const chat = createChat({ store: Store, llm, view: { addMsg, addThinking, setArb } });
const evalRunner = createEvalRunner({ store: Store, llm });

/* ---- 数据装载：两段式（载入原始数据 → 用户确认后校验修复） ---- */
function resetChat(greeting){
  Store.chat = [];
  chat.reset();
  clearChat(greeting || '数据已更新，对话记录已重置。请先点击「开始校验修复」，完成后即可基于清洗后数据提问。');
}

function loadRaw(raw, sourceName){
  Store.rawRows = raw;
  Store.cleanRows = [];
  Store.issues = [];
  Store.enumCache = null;
  Store.mart = null;
  Store.issueFilter = 'all';
  Store.view = 'raw';
  Store.arbCount = 0;
  Store.tblState = { sortKey:null, sortDir:1, fStore:null, fCat:null };
  Store.pending = Validator.run(raw);   // 预跑规则，仅用于原始表标注，不转正
  resetIssueView();
  renderRawTable();
  $('btnValidate').disabled = false;
  $('btnEval').disabled = true;
  $('btnEvalLLM').disabled = true;
  resetChat();
  toast(`${sourceName}：已载入 ${raw.length} 行，预检出问题 ${Store.pending.issues.length} 处（橙色将修正 / 红色将剔除），请点击「开始校验修复」`, 'ok');
}

function runValidation(){
  if(!Store.rawRows.length) return;
  const { clean, issues } = Store.pending || Validator.run(Store.rawRows);
  Store.pending = null;
  Store.cleanRows = clean;
  Store.issues = issues;
  Store.enumCache = {
    stores: [...new Set(clean.map(r=>r.store))],
    cats:   [...new Set(clean.map(r=>r.category))],
    months: [...new Set(clean.map(r=>r.date.slice(0,7)))].sort()
  };
  Store.mart = Mart.build(clean);   // 预计算标准化结构：月/季/年聚合、维度排行、环比同比
  Store.view = 'clean';
  renderStats(); renderIssues(); renderTable();
  $('btnValidate').disabled = true;
  $('btnEval').disabled = false;
  $('btnEvalLLM').disabled = !llm.ready();
  toast(`校验完成：修正 ${issues.filter(i=>i.action==='fixed').length} 处，剔除 ${issues.filter(i=>i.action==='removed').length} 行，保留 ${clean.length} 行；预计算已就绪`, 'ok');
}

/* ---- 事件绑定 ---- */
function bind(){
  const drop = $('drop'), file = $('file');
  drop.onclick = ()=>file.click();
  drop.ondragover = e=>{ e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = ()=>drop.classList.remove('over');
  drop.ondrop = e=>{ e.preventDefault(); drop.classList.remove('over'); if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  file.onchange = ()=>{ if(file.files[0]) handleFile(file.files[0]); file.value=''; };

  async function handleFile(f){
    try{ const rows = await ExcelIO.parse(f); loadRaw(rows, f.name); }
    catch(e){
      if(e.details) showAlert(`上传失败：${f.name} 表头校验未通过`, e.details);
      else toast('解析失败：'+e.message, 'err');
    }
  }

  $('btnMockLoad').onclick = ()=>loadRaw(MockData.generate(), '模拟数据');
  $('btnMockDl').onclick = ()=>{
    try{ ExcelIO.downloadMock(MockData.generate()); }
    catch(e){ toast(e.message, 'err'); }
  };
  $('btnValidate').onclick = runValidation;
  $('btnEval').onclick = ()=>{
    const r = evalRunner.run();
    const pct = Math.round(r.pass/r.total*100);
    showAlert(`问数评测（规则通道）：通过 ${r.pass}/${r.total}（${pct}%）`,
      r.fails.length ? r.fails.concat('—— 以上为失败用例，可据此修订规则或 prompt ——') : ['全部用例通过，规则通道表现稳定。']);
  };
  $('btnEvalLLM').onclick = async ()=>{
    $('btnEvalLLM').disabled = true;
    try{
      const r = await evalRunner.runLLM((i,n)=>{ $('btnEvalLLM').textContent = `LLM 评测中 ${i}/${n}…`; });
      const pct = Math.round(r.pass/r.total*100);
      showAlert(`问数评测（LLM 通道）：通过 ${r.pass}/${r.total}（${pct}%）`,
        r.fails.length ? r.fails.concat('—— 失败用例可用于优化 few-shot 示例或规则 ——') : ['全部用例通过，LLM 抽参稳定。']);
    }finally{
      $('btnEvalLLM').textContent = 'LLM 通道评测（耗 token）';
      $('btnEvalLLM').disabled = !(llm.ready() && Store.cleanRows.length);
    }
  };

  bindTableEvents();
  bindIssueFilter();

  document.querySelectorAll('.hint').forEach(b=>b.onclick = ()=>{ $('q').value=b.textContent; chat.ask(b.textContent); });

  const send = ()=>{ const v=$('q').value.trim(); if(!v) return; $('q').value=''; chat.ask(v); };
  $('btnAsk').onclick = send;
  $('q').addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });

  bindSettings(llm);
  refreshChip(llm);
}

bind();
window.__BOOTED = true;   // 启动看护标志：index.html 内联脚本据此判断模块图是否成功执行
