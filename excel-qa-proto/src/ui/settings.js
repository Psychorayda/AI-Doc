/* 设置与弹窗视图：模型设置 / 通用报错弹窗 / Toast / 顶栏状态芯片 */
import { Store } from '../core/store.js';
import { $ } from './dom.js';

export function toast(msg, type=''){
  const t = document.createElement('div');
  t.className = 'toast '+type; t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transition='.3s'; setTimeout(()=>t.remove(),300); }, 3200);
}

export function showAlert(title, items){
  $('alertTitle').lastChild.textContent = title;
  $('alertBody').innerHTML = items.map(t=>`<div style="margin-bottom:6px">· ${t}</div>`).join('');
  $('alertMask').classList.add('show');
}

export function refreshChip(llm){
  const ok = llm.ready();
  $('llmChip').textContent = ok ? `已接入 ${llm.cfg().model}` : '未配置 API Key · 本地规则引擎兜底';
  $('llmChip').className = 'chip'+(ok?'':' warn');
  $('btnEvalLLM').disabled = !(ok && Store.cleanRows.length);
}

export function bindSettings(llm){
  $('btnSettings').onclick = ()=>{
    const c = llm.cfg();
    $('cfgUrl').value=c.url; $('cfgKey').value=c.key; $('cfgModel').value=c.model;
    $('cfgVerify').checked = !!c.verify;
    $('mask').classList.add('show');
  };
  $('mask').onclick = e=>{ if(e.target===$('mask')) $('mask').classList.remove('show'); };
  $('alertOk').onclick = ()=>$('alertMask').classList.remove('show');
  $('alertMask').onclick = e=>{ if(e.target===$('alertMask')) $('alertMask').classList.remove('show'); };
  $('btnSaveCfg').onclick = ()=>{
    llm.save({ url:$('cfgUrl').value.trim()||'https://api.deepseek.com/v1', key:$('cfgKey').value.trim(), model:$('cfgModel').value.trim()||'deepseek-chat', verify:$('cfgVerify').checked });
    $('mask').classList.remove('show');
    refreshChip(llm); toast('设置已保存','ok');
  };
  $('btnTest').onclick = async ()=>{
    llm.save({ url:$('cfgUrl').value.trim(), key:$('cfgKey').value.trim(), model:$('cfgModel').value.trim(), verify:$('cfgVerify').checked });
    try{ await llm.chat([{role:'user',content:'ping，回复pong'}],{maxTokens:10,timeout:10000}); toast('连接成功','ok'); }
    catch(e){ toast('连接失败：'+e.message,'err'); }
    refreshChip(llm);
  };
}
