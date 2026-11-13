/**
 * 二百三十四批 P2-7/P2-9：编辑链增强——pending 导出 bulk NDJSON + Ctrl+Z 栈式撤销。
 * 锁定：
 * 1) buildBulkNdjson 纯函数：动作行+文档行成对、末尾换行、空集空串；
 * 2) RT：两次编辑 → Ctrl+Z 一次撤销栈尾（.rt-old 少一个）；再 Ctrl+Z 撤空；
 * 3) 编辑框内 Ctrl+Z 不接管（target=INPUT 时放行文本撤销）。
 * 挂载样板照抄 rtImeEdit（裸 createApp + pinia + api mock；me=null 时 can()=true）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { buildBulkNdjson } from '../utils/bulkNdjson';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
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

describe('buildBulkNdjson 纯函数（234 批 P2-7）', () => {
  it('动作行+文档行成对；末尾换行；空集空串', () => {
    const out = buildBulkNdjson('idx1', [{ id: 'a', fields: { name: 'x', age: 3 } }]);
    const lines = out.split('\n');
    expect(lines[0]).toBe(JSON.stringify({ update: { _index: 'idx1', _id: 'a' } }));
    expect(lines[1]).toBe(JSON.stringify({ doc: { name: 'x', age: 3 } }));
    expect(out.endsWith('\n') && lines[lines.length - 1] === '').toBe(true);
    expect(buildBulkNdjson('idx1', [])).toBe('');
  });
});

describe('RT Ctrl+Z 撤销待提交（234 批 P2-9）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);

  async function mountTbl() {
    const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 1, index: 'u1' }) });
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
  const oldCount = () => host.querySelectorAll('.rt-old').length;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
  });

  it('两次编辑 → Ctrl+Z 撤销栈尾 → 再 Ctrl+Z 撤空', async () => {
    await mountTbl();
    await editField('name', 'x1');
    await editField('age', '9');
    expect(oldCount()).toBe(2);
    rt().focus();
    keyOn('z', { ctrlKey: true });
    await tick();
    expect(oldCount()).toBe(1);
    keyOn('z', { ctrlKey: true });
    await tick();
    expect(oldCount()).toBe(0);
    /* 空栈再按不炸 */
    keyOn('z', { ctrlKey: true });
    await tick();
    expect(oldCount()).toBe(0);
  });

  it('编辑框内 Ctrl+Z 不接管（文本撤销语义优先）', async () => {
    await mountTbl();
    await editField('name', 'x1');
    expect(oldCount()).toBe(1);
    /* 打开 age 编辑框但不提交，处于编辑态：Ctrl+Z target=INPUT → RT 不接管 pending 撤销 */
    const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === 'age') as HTMLElement;
    td.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick();
    const inp = host.querySelector('input.rt-edit') as HTMLInputElement;
    expect(inp, '编辑框应打开').toBeTruthy();
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, ctrlKey: true }));
    await tick();
    expect(oldCount()).toBe(1);
  });
});
