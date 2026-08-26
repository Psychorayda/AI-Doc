/* LLMClient —— OpenAI 兼容调用（超时控制 + 低成本参数 + JSON mode 自动降级）
 * 工厂模式：fetch 可注入 stub，Node 测试不触网 */
import { cfg, save, ready } from '../core/config.js';

export function createLLMClient({ fetchImpl } = {}){
  const doFetch = fetchImpl || fetch;

  async function chat(messages, {maxTokens=300, timeout=15000, jsonMode=false}={}){
    const c = cfg();
    if(!c.key) throw new Error('NO_KEY');
    const ctl = new AbortController();
    const timer = setTimeout(()=>ctl.abort(), timeout);
    async function once(jm){
      const body = { model:c.model, messages, temperature:0.1, max_tokens:maxTokens, stream:false };
      if(jm) body.response_format = { type:'json_object' };
      const res = await doFetch(c.url.replace(/\/+$/,'')+'/chat/completions', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+c.key },
        body: JSON.stringify(body),
        signal: ctl.signal
      });
      if(!res.ok){ const err = new Error('HTTP '+res.status); err.status=res.status; throw err; }
      return res.json();
    }
    try{
      let data;
      try{ data = await once(jsonMode); }
      catch(e){ if(jsonMode && (e.status===400||e.status===422)) data = await once(false); else throw e; }  // 个别网关不支持 json_mode 时自动降级
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if(!text) throw new Error('空响应');
      return text.trim();
    } finally { clearTimeout(timer); }
  }
  return { chat, cfg, save, ready };
}
