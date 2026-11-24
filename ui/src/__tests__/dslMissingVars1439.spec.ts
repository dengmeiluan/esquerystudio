/**
 * 1439：未定义变量的发送前拦截。
 *
 * `missingVars` 一直有实现与单测，但 DSL 工作台**从未调用**——
 * 注释写着「执行前必须能告诉用户你引用了未定义的变量」，实际 `${x}` 被原样发给 ES，
 * 要么当字面量静默 0 命中、要么 400，用户看不出是变量没定义。
 * DevTools 的 execSend 早已接线，这里是补齐同口径。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf8');
const DT = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf8');

function problems(dq: string, dt: string): string[] {
  const out: string[] = [];
  /* DSL 工作台：执行体里必须在 applyVars 之前拦未定义变量 */
  if (!dq.includes('missingVars(dsl.value)')) out.push('DSL 页未调用 missingVars');
  if (!/const missing = missingVars\(dsl\.value\);[\s\S]{0,600}?return;/.test(dq)) out.push('拦截后必须 return（不能继续发送）');
  if (!dq.includes('已阻止发送')) out.push('提示未说明已阻止发送');
  if (!dq.includes("action: { label: '去定义变量'")) out.push('缺「去定义变量」动作');
  /* 同口径：DevTools 已有 */
  if (!dt.includes('missingVars([t.path || \'\', bodyOut].join')) out.push('DevTools 的变量拦截不见了');
  return out;
}

describe('1439 未定义变量拦截', () => {
  it('两个执行面都接线（DSL 工作台 + DevTools）', () => {
    expect(problems(DQ, DT)).toEqual([]);
  });

  it('负控：删掉 DSL 页的拦截 → 判据点名', () => {
    const broken = DQ.replace('const missing = missingVars(dsl.value);', 'const missing: string[] = [];');
    expect(broken).not.toBe(DQ);
    expect(problems(broken, DT)).not.toEqual([]);
  });
});
