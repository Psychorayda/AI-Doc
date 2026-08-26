/* LLM 配置持久化：localStorage 优先，Node 环境（测试）自动降级内存存储 */
const DEFAULT = { url:'https://api.deepseek.com/v1', key:'', model:'deepseek-chat', verify:false };
const KEY = 'qa_cfg';
const mem = {};
const storage = typeof localStorage !== 'undefined'
  ? localStorage
  : { getItem:k=>mem[k]??null, setItem:(k,v)=>{mem[k]=v;} };

export function cfg(){
  try{ return Object.assign({}, DEFAULT, JSON.parse(storage.getItem(KEY)||'{}')); }
  catch(e){ return {...DEFAULT}; }
}
export function save(c){ storage.setItem(KEY, JSON.stringify(c)); }
export function ready(){ return !!cfg().key; }
