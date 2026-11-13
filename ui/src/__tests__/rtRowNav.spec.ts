/**
 * R130 第四十八批：ResultTable 键盘行导航守卫（Xmigrate 范式合并）。
 * 锁定：
 * 1) 容器获焦后 ArrowDown/ArrowUp 移动高亮行（rt-row-focus class 随 focusIdx 移动）；
 * 2) Home/End 跳首末行；
 * 3) 失焦清高亮（暗状态不残留）；
 * 4) 输入框聚焦时按键不接管（防与行内搜索/编辑抢键）。
 * 挂载样板照抄 resultTableMemory.spec（裸 createApp + pinia）。
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

import ResultTable from '../components/ResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'cherry', age: 1 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any> = {}) {
  const app = createApp({
    setup() {
      return () => h(ResultTable as any, { hits: HITS, total: HITS.length, ...props });
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

const pressKey = (key: string) => {
  const rt = host.querySelector('.rt') as HTMLElement;
  rt.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

const focusRowIdx = () => {
  const rows = Array.from(host.querySelectorAll('.rt tbody tr'));
  return rows.findIndex(r => r.classList.contains('rt-row-focus'));
};

describe('ResultTable 键盘行导航', () => {
  it('获焦后 ArrowDown/ArrowUp 移动高亮行，未聚焦时无高亮', async () => {
    await mountTbl();
    const rt = host.querySelector('.rt') as HTMLElement;
    expect(focusRowIdx()).toBe(-1);
    rt.focus();
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(1);
    pressKey('ArrowUp');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
  });

  it('Home/End 跳首末行', async () => {
    await mountTbl();
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    pressKey('End');
    await nextTick();
    expect(focusRowIdx()).toBe(2);
    pressKey('Home');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
  });

  it('失焦清高亮（暗状态不残留）', async () => {
    await mountTbl();
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
    rt.blur();
    await nextTick();
    expect(focusRowIdx()).toBe(-1);
  });


  it('获焦时 rt-bar 显示行导航 kbd 提示、失焦隐藏（第四十九批可见性）', async () => {
    await mountTbl();
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    await nextTick();
    expect(host.querySelector('.rt-kbd-hint')).not.toBeNull();
    rt.blur();
    await nextTick();
    expect(host.querySelector('.rt-kbd-hint')).toBeNull();
  });

  it('第五十五批：勾选框带可达名（aria-label 含行号与 _id）', async () => {
    await mountTbl();
    const boxes = Array.from(host.querySelectorAll('.rt tbody .rt-chk input[type=checkbox]'));
    expect(boxes.length).toBe(3);
    expect(boxes[0].getAttribute('aria-label')).toBe('选中第 1 行（a）');
    expect(boxes[2].getAttribute('aria-label')).toBe('选中第 3 行（c）');
  });

  it('输入框聚焦时按键不接管（防抢键）', async () => {
    await mountTbl();
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    // 在容器内插入一个 input 并聚焦（模拟行内搜索/编辑焦点）
    const inp = document.createElement('input');
    rt.appendChild(inp);
    inp.focus();
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(-1);
  });
});
