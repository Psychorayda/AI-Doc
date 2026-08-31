/* Validator —— 规则流水线：每条规则是独立可插拔对象，run() 仅编排
 * 规则对象：{ id, apply(ctx) }；ctx = { row(原始行), out(清洗行), issues, dropped, drop() }
 * 规则工厂（Rules.*）供各主题画像按需组合；默认规则集 DEFAULT_RULES 为零售销售主题 */
import { cn2num } from './cnnum.js';

const full2half = s => s.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/．/g,'.');

/* 数值字段流水线：符号→单位→中文数字→类型转换，逐级记录（导出供自定义规则复用） */
export function cleanNumber(v, field, rowId, issues){
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

/* —— 规则工厂 —— */
export const Rules = {
  /* 日期格式归一：yyyy/m/d、yyyy.m.d → yyyy-mm-dd；无法解析则剔除 */
  dateNorm(field){
    return { id:`dateNorm:${field}`, apply(ctx){
      let d = String(ctx.row[field]??'').trim().replace(/[/.]/g,'-');
      const m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if(m){ const nd=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        if(nd!==d) ctx.issues.push({rowId:ctx.row.id, field, rule:'日期格式归一', before:ctx.row[field], after:nd, action:'fixed'});
        ctx.out[field]=nd;
      } else { ctx.issues.push({rowId:ctx.row.id, field, rule:'日期无法解析', before:ctx.row[field], after:'—', action:'removed'}); ctx.drop(); }
    }};
  },
  /* 关键文本字段：空值剔除 */
  requiredText(field){
    return { id:`requiredText:${field}`, apply(ctx){
      ctx.out[field] = String(ctx.row[field]??'').trim();
      if(!ctx.out[field]){ ctx.issues.push({rowId:ctx.row.id, field, rule:'关键字段空值', before:'(空)', after:'—', action:'removed'}); ctx.drop(); }
    }};
  },
  /* 文本字段：空值填充默认值 */
  fillDefault(field, fillValue){
    return { id:`fillDefault:${field}`, apply(ctx){
      ctx.out[field] = String(ctx.row[field]??'').trim();
      if(!ctx.out[field]){ ctx.out[field]=fillValue; ctx.issues.push({rowId:ctx.row.id, field, rule:'空值填充默认', before:'(空)', after:fillValue, action:'fixed'}); }
    }};
  },
  /* 数值字段：清洗 + 空值/超范围处理；nullable 字段空值留 null（供后续一致性规则重算） */
  numeric(field, { range, nullable=false }={}){
    return { id:`numeric:${field}`, apply(ctx){
      const {val, empty} = cleanNumber(ctx.row[field], field, ctx.row.id, ctx.issues);
      ctx.out[field]=val;
      if(empty){
        if(nullable){ ctx.out[field]=null; }
        else { ctx.issues.push({rowId:ctx.row.id, field, rule:'关键字段空值', before:'(空)', after:'—', action:'removed'}); ctx.drop(); }
      } else if(range && (val<range[0] || val>range[1])){
        ctx.issues.push({rowId:ctx.row.id, field, rule:`超范围 [${range}]`, before:val, after:'—', action:'removed'}); ctx.drop();
      }
    }};
  },
  /* 一致性：target = a × b（已剔除行跳过；偏差>0.01 重算修复） */
  productConsistency(target, a, b){
    return { id:`consistency:${target}=${a}*${b}`, apply(ctx){
      if(ctx.dropped) return;
      const expect = Math.round(ctx.out[a]*ctx.out[b]*100)/100;
      if(ctx.out[target]==null || Math.abs(ctx.out[target]-expect)>0.01){
        ctx.issues.push({rowId:ctx.row.id, field:target, rule:'销售额≠单价×数量，已重算', before:ctx.out[target]??'(空)', after:expect, action:'fixed'});
        ctx.out[target] = expect;
      }
    }};
  },
};

/* 规则由画像（profiles/*.js）组合注入，本模块不含任何主题默认值 */
function run(raw, rules){
  const issues=[], clean=[];
  raw.forEach(row=>{
    const ctx = { row, out:{ id:row.id }, issues, dropped:false, drop(){ this.dropped=true; } };
    for(const rule of rules) rule.apply(ctx);
    if(!ctx.dropped) clean.push(ctx.out);
  });
  return { clean, issues };
}

export const Validator = { run };
