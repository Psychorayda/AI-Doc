/* MockData 工厂 —— 按画像参数生成含典型错误的模拟数据
 * spec: { rowCount, dateRange:{from:[y,m,d],to:[y,m,d]},
 *         row:(randDate)=>行对象,          // 画像提供：生成一行正常数据（标准字段名）
 *         bad:[{patch, fixOn?:[field,mul]}] }  // patch 覆盖字段；fixOn 将字段值乘倍数注入不一致 */
const rnd = (a,b)=>a+Math.random()*(b-a);
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
      rows.push({ id:id++, date:randDate(), ...spec.row(randDate) });
    }
    // ---- 注入错误 ----
    spec.bad.forEach(b=>{
      const r = { id:id++, date:randDate(), ...spec.row(randDate) };
      Object.assign(r, b.patch);
      if(b.fixOn){ const [f,mul]=b.fixOn; r[f] = Math.round(r[f]*mul*100)/100; }
      rows.push(r);
    });
    return rows;
  }

  return { generate };
}
