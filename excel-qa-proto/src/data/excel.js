/* ExcelIO —— Excel 解析 / 模拟文件生成（依赖 SheetJS 全局 XLSX）+ 表头门禁校验 */
const REQUIRED = [['日期','date'],['门店','store'],['品类','category'],['单价','price'],['数量','qty'],['销售额','amount']];
const ALIAS = { '销售日期':'日期','交易日期':'日期','订单日期':'日期','时间':'日期',
  '店铺':'门店','门店名称':'门店','分店':'门店','网点':'门店',
  '类别':'品类','分类':'品类','商品类别':'品类','产品类别':'品类',
  '价格':'单价','单价(元)':'单价','单价（元）':'单价',
  '销量':'数量','件数':'数量','数量(件)':'数量',
  '金额':'销售额','流水':'销售额','销售额(元)':'销售额','销售额（元）':'销售额','营收':'销售额' };

function suggest(h){
  if(ALIAS[h]) return ALIAS[h];
  const cands = REQUIRED.map(r=>r[0]).concat(Object.keys(ALIAS));
  const hit = cands.find(c=>c.includes(h)||(h.length>=2&&h.includes(c)));
  return hit ? (ALIAS[hit]||hit) : null;
}

/* 表头校验：返回 {map} 或抛出带 details 的错误（UI 层据 details 弹窗） */
function validateHeaders(headRow){
  const map = headRow.map(h=>{
    const s = String(h).trim();
    const std = REQUIRED.find(r=>r[0]===s) ? s : (ALIAS[s]||null);
    const hit = std && REQUIRED.find(r=>r[0]===std);
    return hit ? hit[1] : null;
  });
  const mapped = new Set(map.filter(Boolean));
  const missing = REQUIRED.filter(r=>!mapped.has(r[1])).map(r=>r[0]);
  const unknown = headRow.map((h,i)=>({h:String(h).trim(),i})).filter(x=>x.h && !map[x.i]);
  if(missing.length){
    const details = [];
    details.push(`缺失必需字段：${missing.map(m=>'「'+m+'」').join('、')}`);
    unknown.forEach(u=>{
      const s = suggest(u.h);
      details.push(s
        ? `无法识别的字段名「${u.h}」——是否为「${s}」？（若为同义字段请重命名为标准字段名）`
        : `无法识别的字段名「${u.h}」（与所有标准字段均不匹配）`);
    });
    details.push(`标准表头应为：${REQUIRED.map(r=>r[0]).join(' / ')}（支持同义别名，如 店铺→门店、金额→销售额）`);
    const err = new Error('表头校验失败');
    err.details = details;
    throw err;
  }
  return { map };
}

function parse(file){
  return new Promise((resolve,reject)=>{
    if(typeof XLSX==='undefined') return reject(new Error('SheetJS 未加载（需联网）'));
    const rd = new FileReader();
    rd.onload = e=>{
      try{
        const wb = XLSX.read(e.target.result,{type:'array'});
        const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
        if(!arr.length) throw new Error('文件为空');
        const headRow = arr[0];
        const { map } = validateHeaders(headRow);
        const rows = arr.slice(1).filter(r=>r.some(c=>String(c).trim()!==''))
          .map((r,i)=>{ const o={id:i+1}; map.forEach((k,j)=>{ if(k) o[k]=r[j]; }); return o; });
        if(!rows.length) throw new Error('表头之外无数据行');
        resolve(rows);
      }catch(err){ reject(err); }
    };
    rd.onerror = ()=>reject(new Error('文件读取失败'));
    rd.readAsArrayBuffer(file);
  });
}

/* 生成模拟 Excel 文件（SheetJS 缺失时抛错，由调用方提示） */
function downloadMock(rows){
  if(typeof XLSX==='undefined') throw new Error('SheetJS 未加载，无法生成文件');
  const data = rows.map(r=>({ '日期':r.date,'门店':r.store,'品类':r.category,'单价':r.price,'数量':r.qty,'销售额':r.amount }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'销售流水');
  XLSX.writeFile(wb,'模拟销售数据_含错误.xlsx');
}

export const ExcelIO = { parse, downloadMock, validateHeaders };
