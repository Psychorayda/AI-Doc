/* EvalRunner —— 黄金问数集回归评测
 * 规则通道离线零成本；LLM 通道逐条真实调用（耗 token），带进度回调
 * 依赖注入 {store, llm, nlu, query, cases}：store 提供 cleanRows/mart/enumCache；cases 为画像黄金集 */

function check(spec, e){
  for(const k of ['metric','agg','groupBy','compare','order']){
    if(e[k]!==undefined && (spec[k]||null)!==e[k]) return `期望 ${k}=${e[k]}，实际 ${spec[k]||'空'}`;
  }
  if(e.topN!==undefined && spec.topN!==e.topN) return `期望 topN=${e.topN}，实际 ${spec.topN}`;
  if(e.ratio && !spec.ratio) return '期望 ratio=true，实际未识别';
  const f = spec.filters||{};
  for(const k of ['month','year','store','category','quarter']){
    if(e[k]!==undefined && f[k]!==e[k]) return `期望 filters.${k}=${e[k]}，实际 ${f[k]||'空'}`;
  }
  if(e.range){
    const r = f.range||{};
    if(r.field!==e.range.field || (e.range.min!==undefined&&r.min!==e.range.min) || (e.range.max!==undefined&&r.max!==e.range.max))
      return `期望 range ${JSON.stringify(e.range)}，实际 ${JSON.stringify(f.range||null)}`;
  }
  return null;
}

/* 单条用例判定：spec 字段 + 命中行为 */
function judge(c, spec, res){
  const specErr = check(spec, c.e);
  const mOk = c.m==='pos' ? res.matched>0 : res.matched===0;
  if(!specErr && mOk) return null;
  return `「${c.q}」${[specErr, mOk?null:`命中期望${c.m==='pos'?'>0':'=0'}，实际${res.matched}`].filter(Boolean).join('；')}`;
}

export function createEvalRunner({ store, llm, nlu, query, cases: CASES }){
  function run(){
    const rows = store.cleanRows, mart = store.mart, enums = store.enumCache;
    let pass = 0; const fails = [];
    for(const c of CASES){
      let spec, res;
      try{
        spec = nlu.sanitizeSpec(nlu.ruleParse(c.q, enums), enums);
        if(c.prev) spec = nlu.mergeContext(spec, nlu.sanitizeSpec(c.prev, enums), c.q);
        spec = nlu.resolveMonth(spec, enums, c.q);
        res = query.run(spec, rows, mart);
      }catch(err){ fails.push(`「${c.q}」执行异常：${err.message}`); continue; }
      const errMsg = judge(c, spec, res);
      if(errMsg) fails.push(errMsg); else pass++;
    }
    return { pass, total: CASES.length, fails };
  }
  /* LLM 通道评测：逐条真实调用抽参接口（消耗 token），带进度回调 */
  async function runLLM(onProgress){
    const rows = store.cleanRows, mart = store.mart, enums = store.enumCache;
    let pass = 0; const fails = [];
    for(let i=0;i<CASES.length;i++){
      const c = CASES[i];
      if(onProgress) onProgress(i+1, CASES.length);
      try{
        const raw = await llm.chat(nlu.buildExtractPrompt(c.q, c.prevQ||null, enums), {maxTokens:280, jsonMode:true});
        const spec = nlu.resolveMonth(nlu.sanitizeSpec(nlu.parseSpecJSON(raw), enums), enums, c.q);
        const res = query.run(spec, rows, mart);
        const errMsg = judge(c, spec, res);
        if(errMsg) fails.push(errMsg); else pass++;
      }catch(err){ fails.push(`「${c.q}」LLM 调用异常：${err.message}`); }
    }
    return { pass, total: CASES.length, fails };
  }
  return { run, runLLM };
}
