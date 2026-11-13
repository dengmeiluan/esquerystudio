/**
 * 二百四十六批：notify 动作数组化 + 查询失败 toast 行动化。
 * 锁定：
 * 1) opts.actions 追加跳转类动作；单 action 入参保持兼容并进数组头；
 * 2) 错误类友好化后（shown!==msg）自动附「复制原始」，与调用方 actions 并存（不再互斥）；
 * 3) 已显式给出「复制原始」时不重复注入；success 不注入；
 * 4) DslQueryView 失败路径源码锁：msg 传原始错误（吃 friendlyEsError 管线）+「查看诊断」
 *    直达 /diag——旧文案「查询失败」经友好化原样返回 shown===msg，恰好绕过自动 action
 *    （全站唯一光杆错误 toast），根治。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
 
void vi;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import { useAppStore } from '../stores/app';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
});

describe('notify 动作数组化（246 批）', () => {
  it('actions 并入 action 头部；错误类自动「复制原始」共存', () => {
    const store = useAppStore();
    const jump = { label: '查看诊断', onClick: () => {} };
    store.notify('error', '{"error":{"root_cause":[{"reason":"boom"}],"reason":"boom"}}', { actions: [jump] });
    const item: any = store.notifyQueue[store.notifyQueue.length - 1];
    expect(item.actions.map((a: any) => a.label)).toEqual(['查看诊断', '复制原始']);
    expect(item.action.label, '旧 action 字段=首个动作（向后兼容）').toBe('查看诊断');
  });

  it('已显式给「复制原始」时不重复注入；success 不注入', () => {
    const store = useAppStore();
    const labels = (it: any) => (it.actions ?? (it.action ? [it.action] : [])).map((a: any) => a.label);
    const raw = { label: '复制原始', onClick: () => {} };
    store.notify('error', '{"error":{"reason":"dup"}}', { actions: [raw] });
    let item: any = store.notifyQueue[store.notifyQueue.length - 1];
    expect(labels(item).filter((l: string) => l === '复制原始').length).toBe(1);
    store.notify('success', 'ok done');
    item = store.notifyQueue[store.notifyQueue.length - 1];
    expect(labels(item), 'success 无自动动作').toEqual([]);
  });

  it('DslQueryView 失败路径源码锁：原始错误进管线+「查看诊断」直达 /diag，且不再弹遮挡结果的 toast', () => {
    const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
    /* msg 必须传原始错误本体（friendlyEsError 才能翻译+自动「复制原始」才会触发） */
    expect(src).toMatch(/store\.notify\('error', queryErr\.value/);
    expect(src).toMatch(/label: '查看诊断', onClick: \(\) => \{ router\.push\('\/diag'\); \}/);
    /* 原位 .dq-err 面板是主界面：右下角 toast 盖住结果表正文，改为只落历史 */
    expect(src).toMatch(/store\.notify\('error', queryErr\.value, \{\s*logOnly: true,/);
    /* 旧光杆文案不得回归 */
    expect(src).not.toMatch(/notify\('error', '查询失败'\)/);
  });
});
