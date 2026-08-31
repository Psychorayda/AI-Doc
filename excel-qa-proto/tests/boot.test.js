/* 启动冒烟：以最小 DOM stub 加载 main.js，验证模块装配与画像文案注入可执行 */
import test from 'node:test';
import assert from 'node:assert/strict';

function mkEl(){
  return { textContent:'', innerHTML:'', value:'', disabled:false, style:{}, dataset:{},
    classList:{ add(){}, remove(){}, toggle(){} },
    addEventListener(){}, appendChild(){}, querySelectorAll:()=>[],
    set onclick(f){}, set onchange(f){}, set ondragover(f){}, set ondragleave(f){}, set ondrop(f){} };
}

test('main.js 装配可执行且画像文案注入 DOM', async () => {
  const els = {};
  const created = [];
  globalThis.document = {
    title:'',
    getElementById: id => els[id] ?? (els[id] = mkEl()),
    createElement: () => { const e = mkEl(); created.push(e); return e; },
    querySelectorAll: () => ({ forEach(){} }),
    addEventListener(){},
  };
  globalThis.window = globalThis;
  await import('../src/ui/main.js');
  assert.equal(window.__BOOTED, true);
  assert.equal(document.title, '数净 · Excel 数据校验与智能问数原型');
  assert.equal(els['brand'].textContent, '数净 DataClean QA');
  assert.match(els['dropHint'].textContent, /日期\/门店\/品类/);
  assert.match(els['hintDir'].innerHTML, /哪个门店销售额最高/);
  assert.match(created.find(e=>e.textContent.includes('问数助手'))?.textContent || '', /各门店销售额对比/);
});
