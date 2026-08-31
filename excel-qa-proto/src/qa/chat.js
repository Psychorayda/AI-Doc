/* Chat —— 多轮对话编排：双通道抽参 → 仲裁 → 本地查询 → 组织回答（全程有反馈）
 * 依赖注入：store / llm / view（addMsg/addThinking/setArb），Node 可 headless 测仲裁 */
import { NLU } from './nlu.js';
import { QueryEngine } from './query.js';

export function createChat({ store, llm, view }){
  let lastUserQ = null;
  let lastSpec = null;   // 上一轮最终执行的 spec，供规则通道追问继承

  function reset(){ lastUserQ = null; lastSpec = null; }

  async function ask(q){
    if(!store.cleanRows.length){
      view.addMsg('ai', store.rawRows.length
        ? '数据已载入但尚未校验，请先点击左侧「开始校验修复」，完成后我才能基于清洗后数据回答。'
        : '请先在左侧上传 Excel 或点击「一键加载模拟数据」，并完成校验修复后再提问。', true);
      return;
    }
    view.addMsg('user', q);
    const thinking = view.addThinking();
    const t0 = performance.now();
    const enums = store.enumCache;

    /* ① 双通道抽参：规则（本地零成本，含追问上下文合并）与 LLM 并行，消毒+月份消歧后结构比对 */
    const ruleSpec = NLU.resolveMonth(NLU.mergeContext(NLU.sanitizeSpec(NLU.ruleParse(q, enums), enums), lastSpec, q), enums, q);
    /* 模糊问数：直接回预设模板（零成本、不猜 spec） */
    if(NLU.isVague(q, ruleSpec)){
      thinking.remove();
      view.addMsg('ai', NLU.vagueReply(enums), false, '预设模板 · 0ms');
      lastUserQ = q;
      return;
    }
    let llmSpec = null;
    if(llm.ready()){
      try{
        const msgs = NLU.buildExtractPrompt(q, lastUserQ, enums);
        const raw = await llm.chat(msgs, {maxTokens:280, jsonMode:true});
        try{
          llmSpec = NLU.parseSpecJSON(raw);
        }catch(e){
          const fixed = await llm.chat([...msgs,
            { role:'assistant', content:raw },
            { role:'user', content:'上面的输出不是合法 JSON，请修正后只输出 JSON，不要任何解释。' }
          ], {maxTokens:280, jsonMode:true});
          llmSpec = NLU.parseSpecJSON(fixed);
        }
        llmSpec = NLU.resolveMonth(NLU.sanitizeSpec(llmSpec, enums), enums, q);
      }catch(e){ llmSpec = null; }
    }

    /* ② 仲裁与查询：一致直接执行；不一致则 LLM 优先、0 命中时回退规则（不打扰用户） */
    let spec, res, engine;
    const runQ = s => QueryEngine.run(s, store.cleanRows, store.mart);
    try{
      if(llmSpec){
        if(JSON.stringify(llmSpec)===JSON.stringify(ruleSpec)){ spec=llmSpec; res=runQ(spec); engine='双通道一致'; }
        else{
          const rL = runQ(llmSpec), rR = runQ(ruleSpec);
          if(rL.matched>0 || rR.matched===0){ spec=llmSpec; res=rL; }
          else{ spec=ruleSpec; res=rR; }
          engine='双通道仲裁';
          store.arbCount = (store.arbCount||0)+1;
          view.setArb && view.setArb(store.arbCount);
        }
      }else{
        spec=ruleSpec; res=runQ(spec); engine='本地规则引擎';
      }
    }catch(e){
      thinking.remove();
      view.addMsg('ai','查询执行出错：'+e.message+'。请换个问法试试。', true);
      return;
    }

    /* ③ 组织回答：LLM 优先，失败用本地模板；可选二次校验（校验员复核数字一致性） */
    const brief = JSON.stringify(res).slice(0, 1200);
    let answer;
    if(llmSpec){
      try{
        const mem = store.chat.slice(-4);
        const dr = enums.months && enums.months.length ? `${enums.months[0]} ~ ${enums.months[enums.months.length-1]}` : '';
        answer = await llm.chat([
          { role:'system', content:`你是数据分析助手。根据给定查询结果，用简体中文简洁回答（≤100字），列出关键数字，不要编造结果之外的数据。硬性要求：若问题未限定时间范围，回答必须注明数据时间范围（${dr}）；若问题已限定时间，回答中也要带上该时间。` },
          ...mem,
          { role:'user', content:`问题：${q}\n查询结果(JSON)：${brief}` }
        ], {maxTokens:220});
      }catch(e){ engine='本地模板'; answer = QueryEngine.renderLocal(spec, res, store.mart); }
    } else {
      answer = QueryEngine.renderLocal(spec, res, store.mart);
    }
    /* ③.5 二次校验（同模型分步自检；可在设置中开关） */
    if(llmSpec && engine!=='本地模板' && llm.cfg().verify){
      try{
        const verdict = await llm.chat([
          { role:'system', content:'你是结果校验员。核对「回答」中的数字是否与「查询结果JSON」一致、是否正面回应了问题。一致只输出 PASS；不一致输出 FAIL: 简要原因。' },
          { role:'user', content:`问题：${q}\n查询结果(JSON)：${brief}\n回答：${answer}` }
        ], {maxTokens:80});
        if(!/^PASS/i.test(verdict.trim())){
          engine = '大模型(校验未通过→模板)';
          answer = QueryEngine.renderLocal(spec, res, store.mart);
        }
      }catch(e){ /* 校验调用失败不阻断主流程，沿用原回答 */ }
    }

    thinking.remove();
    const ms = Math.round(performance.now()-t0);
    view.addMsg('ai', answer, false, `引擎：${engine} · 命中 ${res.matched} 条 · ${ms}ms`);
    lastUserQ = q;
    lastSpec = spec;
    store.chat.push({role:'user', content:q}, {role:'assistant', content:answer});
    if(store.chat.length>12) store.chat = store.chat.slice(-12);  // 控制记忆长度=控制成本
  }
  return { ask, reset };
}
