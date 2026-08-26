/* Validator —— 规则化校验与修复（每条规则独立可插拔）
 * 规则覆盖：空值 / 超范围 / 单位错误 / 符号错误 / 数值转文字 / 日期格式 / 一致性 */
const CN = {'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
const cn2num = s => {                       // 中文数字 → 阿拉伯（≤999）
  if(!/^[零一二两三四五六七八九十百]+$/.test(s)) return NaN;
  let sec=0,num=0;
  for(const ch of s){
    if(CN[ch]!=null) num=CN[ch];
    else if(ch==='十'){ sec+=(num||1)*10; num=0; }
    else if(ch==='百'){ sec+=num*100; num=0; }
  }
  return sec+num;
};
const full2half = s => s.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/．/g,'.');

/* 数值字段流水线：符号→单位→中文数字→类型转换，逐级记录 */
function cleanNumber(v, field, rowId, issues){
  if(v==null || String(v).trim()==='') return {val:null, empty:true};
  let s = String(v).trim(), changed=[];
  const half = full2half(s);
  if(half!==s){ changed.push('全角转半角'); s=half; }
  const stripped = s.replace(/[¥￥,，\s]/g,'').replace(/(元|件|个|笔)$/,'');
  if(stripped!==s){ changed.push('去除单位/货币/千分位符号'); s=stripped; }
  let n = parseFloat(s);
  if(isNaN(n)){
    const cn = cn2num(s);
    if(!isNaN(cn)){ changed.push('中文数字转数值'); n=cn; }
  }
  if(isNaN(n)) return {val:null, empty:true};
  if(typeof v==='string' && String(n)!==v && !changed.length) changed.push('数值型文字转数值');
  if(changed.length) issues.push({rowId, field, rule:changed.join('；'), before:v, after:n, action:'fixed'});
  return {val:n};
}

const RANGE = { price:[0.01,1000], qty:[1,500], amount:[0.01,1e7] };

function run(raw){
  const issues=[], clean=[];
  raw.forEach(row=>{
    let drop=false;
    const r = { id:row.id };
    // 日期：格式归一
    let d = String(row.date??'').trim().replace(/[/.]/g,'-');
    const m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(m){ const nd=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
      if(nd!==d) issues.push({rowId:row.id, field:'date', rule:'日期格式归一', before:row.date, after:nd, action:'fixed'});
      r.date=nd;
    } else { issues.push({rowId:row.id, field:'date', rule:'日期无法解析', before:row.date, after:'—', action:'removed'}); drop=true; }
    // 门店：空值剔除
    r.store = String(row.store??'').trim();
    if(!r.store){ issues.push({rowId:row.id, field:'store', rule:'关键字段空值', before:'(空)', after:'—', action:'removed'}); drop=true; }
    // 品类：空值填充"未分类"
    r.category = String(row.category??'').trim();
    if(!r.category){ r.category='未分类'; issues.push({rowId:row.id, field:'category', rule:'空值填充默认', before:'(空)', after:'未分类', action:'fixed'}); }
    // 数值字段
    ['price','qty','amount'].forEach(f=>{
      const {val, empty} = cleanNumber(row[f], f, row.id, issues);
      r[f]=val;
      if(empty){
        if(f==='amount'){ r[f]=null; }  // 销售额稍后重算
        else { issues.push({rowId:row.id, field:f, rule:'关键字段空值', before:'(空)', after:'—', action:'removed'}); drop=true; }
      } else if(val<RANGE[f][0] || val>RANGE[f][1]){
        issues.push({rowId:row.id, field:f, rule:`超范围 [${RANGE[f]}]`, before:val, after:'—', action:'removed'}); drop=true;
      }
    });
    if(drop) return;
    // 一致性：amount = price × qty
    const expect = Math.round(r.price*r.qty*100)/100;
    if(r.amount==null || Math.abs(r.amount-expect)>0.01){
      issues.push({rowId:row.id, field:'amount', rule:'销售额≠单价×数量，已重算', before:r.amount??'(空)', after:expect, action:'fixed'});
      r.amount = expect;
    }
    clean.push(r);
  });
  return { clean, issues };
}

export const Validator = { run };
