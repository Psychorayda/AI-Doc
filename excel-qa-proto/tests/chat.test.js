/* Chat 编排层 headless 测试：stub LLM + 内存 view，验证双通道仲裁与兜底 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChat } from '../src/qa/chat.js';
import { makeEnv, makeStore, makeNQ } from './helpers.js';

function mkView(){
  const msgs = [];
  return { msgs,
    addMsg:(role,text,isErr,meta)=>{ msgs.push({role,text,meta}); },
    addThinking:()=>({remove(){}}),
    setArb(){} };
}
function mkLLM(spec){
  const calls = [];
  return { calls, cfg:()=>({verify:false}), ready:()=>true,
    chat: async (messages)=>{ calls.push(messages);
      if(messages[0].content.includes('提取器')) return JSON.stringify(spec);
      return '这是组织后的回答，含数据范围 2025-06 ~ 2026-08。'; } };
}

test('Chat：双通道一致时不仲裁', async () => {
  const env = makeEnv(); const store = makeStore(env);
  const llm = mkLLM({groupBy:'store', topN:1});   // 与规则通道对「哪个门店销售额最高？」的解析一致
  const view = mkView();
  const chat = createChat({ store, llm, view, ...makeNQ() });
  await chat.ask('哪个门店销售额最高？');
  const ai = view.msgs.filter(m=>m.role==='ai').pop();
  assert.match(ai.meta, /双通道一致/);
  assert.equal(store.arbCount, 0);
});

test('Chat：LLM 抽参 0 命中时仲裁回退规则通道', async () => {
  const env = makeEnv(); const store = makeStore(env);
  const llm = mkLLM({filters:{month:'2024-01'}});  // LLM 给了无数据月份
  const view = mkView();
  const chat = createChat({ store, llm, view, ...makeNQ() });
  await chat.ask('八月份总销售额是多少？');
  const ai = view.msgs.filter(m=>m.role==='ai').pop();
  assert.match(ai.meta, /双通道仲裁/);
  assert.equal(store.arbCount, 1);
  assert.match(ai.text, /2026-08/);  // 回退到规则通道的正确月份
});

test('Chat：LLM 异常时本地规则引擎兜底，必有回答', async () => {
  const env = makeEnv(); const store = makeStore(env);
  const llm = { cfg:()=>({verify:false}), ready:()=>true, chat: async ()=>{ throw new Error('HTTP 500'); } };
  const view = mkView();
  const chat = createChat({ store, llm, view, ...makeNQ() });
  await chat.ask('各品类销量分别是多少？');
  const ai = view.msgs.filter(m=>m.role==='ai').pop();
  assert.match(ai.meta, /本地规则引擎/);
  assert.ok(ai.text.includes('现制饮品'));
});

test('Chat：模糊问数走预设模板，不调 LLM', async () => {
  const env = makeEnv(); const store = makeStore(env);
  const llm = mkLLM({});
  const view = mkView();
  const chat = createChat({ store, llm, view, ...makeNQ() });
  await chat.ask('怎么样？');
  const ai = view.msgs.filter(m=>m.role==='ai').pop();
  assert.match(ai.text, /有点宽泛/);
  assert.equal(llm.calls.length, 0);
});
