/* 黄金集 headless 回归：规则通道 25/25 必须全过 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvalRunner } from '../src/qa/eval.js';
import { makeEnv, makeStore } from './helpers.js';

test('EvalRunner 黄金集（规则通道）全过', () => {
  const env = makeEnv();
  const runner = createEvalRunner({ store: makeStore(env), llm: null });
  const r = runner.run();
  if(r.fails.length) console.error(r.fails.join('\n'));
  assert.equal(r.pass, r.total, `${r.pass}/${r.total}`);
});
