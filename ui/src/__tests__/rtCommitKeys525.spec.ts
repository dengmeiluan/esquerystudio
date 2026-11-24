/**
 * 五百二十五批：RT 待提交一键提交（键盘路径 + 迷你钮）——此前提交必须鼠标两击
 * （点 chip 开气泡→点「提交全部」）。
 * 锁定：
 * 1) 表格聚焦且有 pending 时 Ctrl+S / Ctrl+Enter 直提 commitPending（api.updatePartial 调用、
 *    成功后 pending 清空 + refresh 事件）；
 * 2) 输入态让路：行内编辑框开着时按键 target=INPUT，走既有输入守卫早退不接管（历史坑：
 *    查找框 Backspace 被网格语义截胡——守卫必须先于提交分支）；
 * 3) chip 旁「提交」迷你钮存在且点击提交。
 * 挂载样板照抄 rtBulkUndo234（裸 createApp + pinia + api mock；me=null 时 can()=true）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const updatePartialFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      updatePartial: (...a: any[]) => updatePartialFn(...a),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
] as any;

describe('RT 一键提交（五百二十五批）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  let refreshed = 0;

  async function mountTbl() {
    const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 1, index: 'ck1', onRefresh: () => { refreshed++; } }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
  }
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
  async function editField(col: string, val: string) {
    const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === col) as HTMLElement;
    td.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const inp = host.querySelector('input.rt-edit') as HTMLInputElement;
    inp.value = val;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
  }
  const rt = () => host.querySelector('.rt') as HTMLElement;
  const keyOn = (key: string, mods: KeyboardEventInit = {}) =>
    rt().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  const pendingCount = () => host.querySelectorAll('.rt-old').length;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    updatePartialFn.mockReset().mockResolvedValue({});
    refreshed = 0;
  });

  it('Ctrl+S 直提：updatePartial 按待提交文档调用，成功后 pending 清空并 refresh', async () => {
    await mountTbl();
    await editField('name', 'x1');
    expect(pendingCount()).toBe(1);
    rt().focus();
    keyOn('s', { ctrlKey: true });
    await tick();
    expect(updatePartialFn).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);
    expect(refreshed).toBe(1);
  }, 30000);

  it('Ctrl+Enter 同效直提', async () => {
    await mountTbl();
    await editField('age', '9');
    rt().focus();
    keyOn('Enter', { ctrlKey: true });
    await tick();
    expect(updatePartialFn).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);
  }, 30000);

  it('输入态让路：编辑框开着时 Ctrl+S 不接管（输入守卫先于提交分支）', async () => {
    await mountTbl();
    await editField('name', 'x1');
    /* 打开 age 编辑框（不提交），处于编辑态 */
    const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === 'age') as HTMLElement;
    td.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const inp = host.querySelector('input.rt-edit') as HTMLInputElement;
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true, ctrlKey: true }));
    await tick();
    expect(updatePartialFn).not.toHaveBeenCalled();
    /* 源码锁：输入守卫（onGridKeydown 的 tgt 早退）在提交分支之前 */
    const v = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
    const guardAt = v.indexOf('const tgt = e.target as HTMLElement | null;');
    const commitAt = v.indexOf('直提 commitPending');
    expect(guardAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(guardAt);
  }, 30000);

  it('chip 旁「提交」迷你钮存在，点击提交', async () => {
    await mountTbl();
    await editField('name', 'x1');
    const btn = host.querySelector('.pend-mini-commit') as HTMLButtonElement | null;
    expect(btn, 'pending>0 时迷你提交钮应出现').toBeTruthy();
    expect(btn!.textContent).toContain('提交');
    btn!.click();
    await tick();
    expect(updatePartialFn).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);
    /* 提交完成后 chip 与迷你钮一起移除 */
    expect(host.querySelector('.pend-mini-commit')).toBeNull();
  }, 30000);
});
