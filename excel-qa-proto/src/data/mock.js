/* MockData —— 生成含典型错误的模拟销售数据（跨年 2025-06 ~ 2026-08） */
const STORES = ['华东旗舰店','华北中心店','华南天河店','西南锦江店'];
const CATS = [['现制饮品',12,28],['烘焙点心',8,38],['轻食简餐',25,58],['周边零售',49,129]];
const rnd = (a,b)=>a+Math.random()*(b-a);
const pick = a=>a[Math.floor(Math.random()*a.length)];
const pad = n=>String(n).padStart(2,'0');
/* 跨年日期：2025-06-01 ~ 2026-08-18 均匀分布 */
const T0 = new Date(2025,5,1).getTime(), T1 = new Date(2026,7,18).getTime();
function randDate(){
  const d = new Date(T0 + Math.random()*(T1-T0));
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function generate(){
  const rows = [];
  let id = 1;
  // ---- 正常数据 ~220 行（跨年） ----
  for(let i=0;i<220;i++){
    const [cat,pmin,pmax] = pick(CATS);
    const price = Math.round(rnd(pmin,pmax)*2)/2;
    const qty = Math.round(rnd(1,18));
    rows.push({ id:id++, date:randDate(), store:pick(STORES), category:cat, price, qty, amount:Math.round(price*qty*100)/100 });
  }
  // ---- 注入错误（覆盖 5 类校验规则） ----
  const bad = [
    {store:'', note:'门店空值'},                                  // 空值-关键字段→剔除
    {qty:'', note:'数量空值'},                                    // 空值→剔除
    {amount:'', note:'销售额空值(可重算)'},                       // 空值→重算修复
    {qty:-3, note:'数量超范围(负)'},                              // 超范围→剔除
    {qty:99999, note:'数量超范围(极大)'},                         // 超范围→剔除
    {price:0, note:'单价超范围(0)'},                              // 超范围→剔除
    {price:'２５．５', note:'全角符号'},                          // 符号错误→修复
    {price:'¥32.5', note:'货币符号'},                             // 符号错误→修复
    {qty:'6件', note:'单位混入'},                                 // 单位错误→修复
    {amount:'1,280', note:'千分位符号'},                          // 符号错误→修复
    {price:'45.0', note:'数值转文字'},                            // 类型→修复
    {qty:'十五', note:'中文数字'},                                // 数值转文字→修复
    {date:'2026/7/15', note:'日期格式'},                          // 格式→修复
    {amountFix:3.7, note:'销售额与单价×数量不一致'},              // 一致性→重算修复
  ];
  bad.forEach(b=>{
    const [cat,pmin,pmax] = pick(CATS);
    const r = { id:id++, date:randDate(),
      store:pick(STORES), category:cat,
      price:Math.round(rnd(pmin,pmax)*2)/2, qty:Math.round(rnd(1,15)) };
    r.amount = Math.round((Number(r.price)||20)*(Number(r.qty)||5)*100)/100;
    Object.assign(r, b);
    if(b.amountFix) r.amount = Math.round(r.amount*b.amountFix*100)/100;
    if(b.amount==='') r.amount='';
    rows.push(r);
  });
  return rows;
}

export const MockData = { generate, STORES, CATS: CATS.map(c=>c[0]) };
