/* 对话视图：消息渲染 / typing 指示 / 清空 */
import { $ } from './dom.js';

export function addMsg(role, text, isErr=false, meta=''){
  const d = document.createElement('div');
  d.className = 'msg '+role+(isErr?' err':'');
  d.textContent = text;
  if(meta){ const m=document.createElement('span'); m.className='meta'; m.textContent=meta; d.appendChild(m); }
  $('chatLog').appendChild(d);
  $('chatLog').scrollTop = 1e9;
  return d;
}

export function addThinking(){
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('chatLog').appendChild(d);
  $('chatLog').scrollTop = 1e9;
  return d;
}

export function clearChat(greeting){
  $('chatLog').innerHTML = '';
  addMsg('ai', greeting || '你好，我是问数助手。数据加载后即可提问，例如「各门店销售额对比」。支持多轮追问，如「那 8 月呢」。');
}
