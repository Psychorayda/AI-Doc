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
  /* 日期格式归一：yyyy/m/d、yyyy.m.d、yyyymmdd → yyyy-mm-dd；无法解析则剔除 */
  dateNorm(field){
    return { id:`dateNorm:${field}`, apply(ctx){
      let d = String(ctx.row[field]??'').trim().replace(/[/.]/g,'-');
      let m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if(!m && /^\d{8}$/.test(d)) m = [d, d.slice(0,4), d.slice(4,6), d.slice(6,8)];
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
  /* 一致性：target = a × b（已剔除行跳过；偏差>0.01 重算修复）；label 为画像提供的文案，如 '销售额≠单价×数量' */
  productConsistency(target, a, b, label){
    return { id:`consistency:${target}=${a}*${b}`, apply(ctx){
      if(ctx.dropped) return;
      const expect = Math.round(ctx.out[a]*ctx.out[b]*100)/100;
      if(ctx.out[target]==null || Math.abs(ctx.out[target]-expect)>0.01){
        ctx.issues.push({rowId:ctx.row.id, field:target, rule:`${label||`${target}≠${a}×${b}`}，已重算`, before:ctx.out[target]??'(空)', after:expect, action:'fixed'});
        ctx.out[target] = expect;
      }
    }};
  },
  /* 字符规范化：全角→半角（字母/数字/符号）+ 全角空格、去首尾空格；lower 时统一小写（许可证号等标识键） */
  textNorm(field, { lower=false }={}){
    return { id:`textNorm:${field}`, apply(ctx){
      const s = String(ctx.row[field]??'');
      let t = s.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/　/g,' ').trim();
      if(lower) t = t.toLowerCase();
      if(t!==s) ctx.issues.push({rowId:ctx.row.id, field, rule:'字符规范化（全角/空格/大小写）', before:s||'(空)', after:t, action:'fixed'});
      ctx.out[field] = t;
    }};
  },
  /* 缺失值推导：target 缺失或非正且 a、b 均有效时，target = a÷b（如 单价=销售金额÷数量），推导保留不剔除 */
  deriveDiv(target, a, b){
    return { id:`derive:${target}=${a}/${b}`, apply(ctx){
      if(ctx.dropped) return;
      const t = ctx.out[target], x = ctx.out[a], y = ctx.out[b];
      if((t==null || t<=0) && x>0 && y>0){
        const v = Math.round(x/y*100)/100;
        ctx.issues.push({rowId:ctx.row.id, field:target, rule:`缺失推导 ${target}=${a}÷${b}`, before:t??'(空)', after:v, action:'fixed'});
        ctx.out[target] = v;
      }
    }};
  },
  /* 正数门禁：经推导后仍为 null 或 <=0 的关键数值字段 → 剔除（无法参与计算的行） */
  positiveNum(field){
    return { id:`positive:${field}`, apply(ctx){
      const v = ctx.out[field];
      if(v==null || v<=0){ ctx.issues.push({rowId:ctx.row.id, field, rule:'关键数值缺失或非正', before:v??'(空)', after:'—', action:'removed'}); ctx.drop(); }
    }};
  },
  /* 完全重复去重：业务字段全同仅保留首条；状态经 reset() 由 Validator.run 每轮重置（保证重跑一致） */
  dedupe(fields){
    const seen = new Set();
    return { id:`dedupe:${fields.join('+')}`, reset(){ seen.clear(); }, apply(ctx){
      if(ctx.dropped) return;
      const key = fields.map(f=>String(ctx.out[f]??'')).join('|');
      if(seen.has(key)){ ctx.issues.push({rowId:ctx.row.id, field:fields[0], rule:'完全重复记录，仅保留首条', before:key, after:'—', action:'removed'}); ctx.drop(); }
      else seen.add(key);
    }};
  },
};

/* 规则由画像（profiles/*.js）组合注入，本模块不含任何主题默认值 */
function run(raw, rules){
  const issues=[], clean=[];
  rules.forEach(r=>r.reset && r.reset());   // 有状态规则（如 dedupe）每轮重置，保证重跑一致
  raw.forEach(row=>{
    const ctx = { row, out:{ id:row.id }, issues, dropped:false, drop(){ this.dropped=true; } };
    for(const rule of rules) rule.apply(ctx);
    if(!ctx.dropped) clean.push(ctx.out);
  });
  return { clean, issues };
}

export const Validator = { run };
