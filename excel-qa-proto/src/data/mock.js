/* MockData 工厂 —— 按画像参数生成含典型错误的模拟数据
 * spec: { rowCount, dateRange:{from:[y,m,d],to:[y,m,d]}, stores[], cats:[[名,价min,价max]], bad:[{patch,amountFix?}] } */
const rnd = (a,b)=>a+Math.random()*(b-a);
const pick = a=>a[Math.floor(Math.random()*a.length)];
const pad = n=>String(n).padStart(2,'0');

export function createMock(spec){
  const T0 = new Date(...spec.dateRange.from).getTime();
  const T1 = new Date(...spec.dateRange.to).getTime();
  const randDate = ()=>{
    const d = new Date(T0 + Math.random()*(T1-T0));
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };

  function generate(){
    const rows = [];
    let id = 1;
    // ---- 正常数据 ----
    for(let i=0;i<spec.rowCount;i++){
      const [cat,pmin,pmax] = pick(spec.cats);
      const price = Math.round(rnd(pmin,pmax)*2)/2;
      const qty = Math.round(rnd(1,18));
      rows.push({ id:id++, date:randDate(), store:pick(spec.stores), category:cat, price, qty, amount:Math.round(price*qty*100)/100 });
    }
    // ---- 注入错误 ----
    spec.bad.forEach(b=>{
      const [cat,pmin,pmax] = pick(spec.cats);
      const r = { id:id++, date:randDate(),
        store:pick(spec.stores), category:cat,
        price:Math.round(rnd(pmin,pmax)*2)/2, qty:Math.round(rnd(1,15)) };
      r.amount = Math.round((Number(r.price)||20)*(Number(r.qty)||5)*100)/100;
      Object.assign(r, b.patch);
      if(b.amountFix) r.amount = Math.round(r.amount*b.amountFix*100)/100;
      rows.push(r);
    });
    return rows;
  }

  return { generate };
}
