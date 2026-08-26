/* EvalRunner —— 黄金问数集回归评测
 * 规则通道离线零成本；LLM 通道逐条真实调用（耗 token），带进度回调
 * 依赖注入 {store, llm}：store 提供 cleanRows/mart/enumCache */
import { NLU } from './nlu.js';
import { QueryEngine } from './query.js';

/* e: 期望 spec 关键字段；m: 期望命中 'pos'(>0) | 'zero'(===0)；prev/prevQ: 追问上下文 */
const CASES = [
  { q:'八月份总销售额是多少？',        e:{metric:'amount', month:'2026-08'},            m:'pos'  },
  { q:'2025年销售额',                 e:{year:'2025'},                                 m:'pos'  },
  { q:'2024年销售额',                 e:{year:'2024'},                                 m:'zero' },
  { q:'哪个门店销售额最高？',          e:{groupBy:'store', topN:1},                     m:'pos'  },
  { q:'销售额最低的三个门店',          e:{groupBy:'store', topN:3, order:'asc'},         m:'pos'  },
  { q:'销量最高的前三个品类',          e:{metric:'qty', groupBy:'category', topN:3},     m:'pos'  },
  { q:'各品类销量分别是多少？',        e:{metric:'qty', groupBy:'category'},             m:'pos'  },
  { q:'各月销售额趋势',               e:{groupBy:'month'},                              m:'pos'  },
  { q:'各季度销售额对比',             e:{groupBy:'quarter'},                            m:'pos'  },
  { q:'8月平均每件单价多少？',         e:{metric:'price', agg:'avg', month:'2026-08'},   m:'pos'  },
  { q:'有多少条记录？',               e:{agg:'count'},                                 m:'pos'  },
  { q:'8月销售额环比增长多少？',        e:{compare:'mom', month:'2026-08'},               m:'pos'  },
  { q:'2026年7月销售额同比增长多少？',  e:{compare:'yoy', month:'2026-07'},               m:'pos'  },
  { q:'现制饮品销售额占比多少？',       e:{ratio:true, category:'现制饮品'},              m:'pos'  },
  { q:'烘焙点心的销量占比',           e:{ratio:true, metric:'qty', category:'烘焙点心'}, m:'pos' },
  { q:'单价30元以上的总销售额',        e:{range:{field:'price', min:30}},                m:'pos'  },
  { q:'销量超过15件的记录有多少条',     e:{agg:'count', range:{field:'qty', min:15}},     m:'pos'  },
  { q:'2026年三季度销售额',           e:{quarter:'2026-Q3'},                            m:'pos'  },
  { q:'华东旗舰店7月卖了多少',        e:{store:'华东旗舰店', month:'2026-07'},           m:'pos'  },
  { q:'烘焙点心2025年销量',           e:{category:'烘焙点心', year:'2025', metric:'qty'},m:'pos' },
  { q:'十二月份有数据吗？',           e:{month:'2025-12'},                              m:'pos'  },
  { q:'西南锦江店销售额',             e:{store:'西南锦江店'},                            m:'pos'  },
  { q:'各年销售额对比',               e:{groupBy:'year'},                               m:'pos'  },
  { q:'那8月呢？',                   e:{month:'2026-08'},                              m:'pos', prev:{filters:{month:'2026-07'}}, prevQ:'2026年7月总销售额是多少？' },
  { q:'那华南天河店呢？',             e:{store:'华南天河店', month:'2026-07'},           m:'pos', prev:{filters:{month:'2026-07'}}, prevQ:'2026年7月总销售额是多少？' }
];

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

export function createEvalRunner({ store, llm }){
  function run(){
    const rows = store.cleanRows, mart = store.mart, enums = store.enumCache;
    let pass = 0; const fails = [];
    for(const c of CASES){
      let spec, res;
      try{
        spec = NLU.sanitizeSpec(NLU.ruleParse(c.q, enums), enums);
        if(c.prev) spec = NLU.mergeContext(spec, NLU.sanitizeSpec(c.prev, enums), c.q);
        spec = NLU.resolveMonth(spec, enums, c.q);
        res = QueryEngine.run(spec, rows, mart);
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
        const raw = await llm.chat(NLU.buildExtractPrompt(c.q, c.prevQ||null, enums), {maxTokens:280, jsonMode:true});
        const spec = NLU.resolveMonth(NLU.sanitizeSpec(NLU.parseSpecJSON(raw), enums), enums, c.q);
        const res = QueryEngine.run(spec, rows, mart);
        const errMsg = judge(c, spec, res);
        if(errMsg) fails.push(errMsg); else pass++;
      }catch(err){ fails.push(`「${c.q}」LLM 调用异常：${err.message}`); }
    }
    return { pass, total: CASES.length, fails };
  }
  return { run, runLLM, CASES };
}
