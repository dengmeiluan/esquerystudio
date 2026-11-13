/**
 * R130 一百三十五批：焦点行操作键（Enter/Ctrl+C）——useRowNav 内核补回调，RT/QRT 接线。
 * 锁定：
 * 1) 内核：Enter 触发 onEnter、Ctrl+C 触发 onCopy、无高亮行(-1)不触发、编辑中 guard 拦截；
 * 2) RT：Ctrl+C 剪贴板内容=visibleCols 列集行 JSON（所见即所得），Enter 派发 open-doc 事件；
 * 3) QRT：Ctrl+C 同样接线（列=shownCols）。
 * 挂载样板照抄 rtRowNav.spec（裸 createApp + pinia）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

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

import { useRowNav } from '../composables/useRowNav';
import { ref } from 'vue';
import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

describe('useRowNav 内核操作键回调（135 批）', () => {
  function harness(opts: Parameters<typeof useRowNav>[1]) {
    const n = ref(3);
    const nav = useRowNav(n, opts);
    const move = (key: string) => nav.onRowNavKey(new KeyboardEvent('keydown', { key, bubbles: true }));
    return { nav, move };
  }

  it('Enter 触发 onEnter 且带当前索引；无高亮行不触发', () => {
    const onEnter = vi.fn();
    const { nav, move } = harness({ onEnter });
    move('ArrowDown'); move('Enter');
    expect(onEnter).toHaveBeenCalledWith(0);
    nav.focusIdx.value = -1;
    move('Enter');
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+C 触发 onCopy；无修饰键的 c 不触发', () => {
    const onCopy = vi.fn();
    const { nav, move } = harness({ onCopy });
    move('ArrowDown');
    move('c');
    expect(onCopy).not.toHaveBeenCalled();
    nav.onRowNavKey(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    expect(onCopy).toHaveBeenCalledWith(0);
  });

  it('guard()=false 时操作键不接管（行内编辑中）', () => {
    const onEnter = vi.fn();
    const { move } = harness({ onEnter, guard: () => false });
    move('Enter');
    expect(onEnter).not.toHaveBeenCalled();
  });
});

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, { ...props }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const keyOn = (sel: string, key: string, mods: KeyboardEventInit = {}) => {
  (host.querySelector(sel) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
};

describe('RT 焦点行操作键接线（135 批）', () => {
  it('Ctrl+C 剪贴板=高亮行 JSON（列=visibleCols）；Enter 派发 open-doc', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    const docOpens: SearchHit[] = [];
    const app = createApp({
      setup() {
        return () => h(ResultTable as any, {
          hits: HITS, total: 2, index: 'i1',
          onOpenDoc: (hit: SearchHit) => docOpens.push(hit),
        });
      },
    });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    keyOn('.rt', 'ArrowDown');
    await nextTick();
    keyOn('.rt', 'c', { ctrlKey: true });
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(writeText).toHaveBeenCalledTimes(1);
    const obj = JSON.parse(writeText.mock.calls[0][0] as string);
    expect(obj._id).toBe('a');
    expect(obj.name).toBe('banana');
    expect(docOpens).toEqual([]);
    keyOn('.rt', 'Enter');
    await nextTick();
    expect(docOpens.map(d => d._id)).toEqual(['a']);
  });

  it('Delete 未勾选时不派发 batch-delete；勾选后派发（147 批）', async () => {
    const batchDels: string[][] = [];
    const app = createApp({
      setup() {
        return () => h(ResultTable as any, {
          hits: HITS, total: 2, index: 'i1',
          onBatchDelete: (ids: string[]) => batchDels.push(ids),
        });
      },
    });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    keyOn('.rt', 'Delete');
    await nextTick();
    expect(batchDels).toEqual([]);
    const boxes = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    boxes[0].click(); boxes[1].click();
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    keyOn('.rt', 'Delete');
    await nextTick();
    expect(batchDels.length).toBe(1);
    expect([...batchDels[0]].sort()).toEqual(['a', 'b']);
  });
});

describe('QRT 焦点行 Ctrl+C 接线（135 批）', () => {
  it('剪贴板=高亮行 JSON（列=shownCols）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl(QueryResultTable, { cols: ['c1', 'c2'], rows: [['x', 'y']], total: 1 });
    const wrap = host.querySelector('.qrt-wrap, .qrt') as HTMLElement
      ?? (host.querySelector('table') as HTMLElement).parentElement as HTMLElement;
    wrap.focus();
    keyOn('.qrt', 'ArrowDown'); /* 516 批:FS 包根后宽松 div 选择器会命中 fs-body,必须钉 .qrt */
    await nextTick();
    const target = (host.querySelector('[tabindex="0"]') as HTMLElement) ?? wrap;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(writeText).toHaveBeenCalledTimes(1);
    const obj = JSON.parse(writeText.mock.calls[0][0] as string);
    expect(obj).toEqual({ c1: 'x', c2: 'y' });
  });
});
