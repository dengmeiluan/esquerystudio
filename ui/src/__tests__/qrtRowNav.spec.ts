/**
 * R130 第五十五批：QueryResultTable 键盘行导航守卫（useRowNav 共享内核接入）。
 * 锁定：
 * 1) 容器获焦后 ↑↓/Home/End 移动高亮行（qrt-row-focus 随 focusIdx 移动）；
 * 2) 失焦清高亮（暗状态不残留）；
 * 3) 获焦时 kbd 提示徽标可见、失焦隐藏（49 批可见性口径；prefsOn=false 无 bar 也有提示）；
 * 4) 滚动跟随：focusIdx 变化触发目标行 scrollIntoView（420px 滚动区深结果集场景）；
 * 5) useRowNav 内核：行集缩小时 focusIdx 自动钳位（防悬空高亮）。
 * 挂载样板照抄 rtRowNav.spec（裸 createApp + pinia）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
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

import QueryResultTable from '../components/QueryResultTable.vue';
import { useRowNav } from '../composables/useRowNav';

const HITS = [
  { _id: 'a', _index: 'i1', _source: { name: 'x' } },
  { _id: 'b', _index: 'i1', _source: { name: 'y' } },
  { _id: 'c', _index: 'i1', _source: { name: 'z' } },
];

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountQrt(props: Record<string, any> = {}) {
  const app = createApp({
    setup() {
      return () => h(QueryResultTable as any, { hits: HITS, ...props });
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

const pressKey = (key: string) => {
  const qrt = host.querySelector('.qrt') as HTMLElement;
  qrt.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

const focusRowIdx = () => {
  const rows = Array.from(host.querySelectorAll('.qrt-tbl tbody tr'));
  return rows.findIndex(r => r.classList.contains('qrt-row-focus'));
};

describe('QueryResultTable 键盘行导航', () => {
  it('获焦后 ArrowDown/ArrowUp 移动高亮行，Home/End 跳首末；未聚焦无高亮', async () => {
    await mountQrt();
    const qrt = host.querySelector('.qrt') as HTMLElement;
    expect(focusRowIdx()).toBe(-1);
    qrt.focus();
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(1);
    pressKey('End');
    await nextTick();
    expect(focusRowIdx()).toBe(2);
    pressKey('Home');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
    pressKey('ArrowUp');
    await nextTick();
    expect(focusRowIdx()).toBe(0); // 首行再 ↑ 不越界
  });

  it('失焦清高亮（暗状态不残留）', async () => {
    await mountQrt();
    const qrt = host.querySelector('.qrt') as HTMLElement;
    qrt.focus();
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
    qrt.blur();
    await nextTick();
    expect(focusRowIdx()).toBe(-1);
  });

  it('获焦时 kbd 提示徽标可见（prefsOn=false 无工具行也显示）、失焦隐藏', async () => {
    await mountQrt(); // 不传 storageKey → prefsOn=false，无 qrt-bar
    const qrt = host.querySelector('.qrt') as HTMLElement;
    expect(host.querySelector('.qrt-kbd-hint')).toBeNull();
    qrt.focus();
    await nextTick();
    expect(host.querySelector('.qrt-kbd-hint')).not.toBeNull();
    qrt.blur();
    await nextTick();
    expect(host.querySelector('.qrt-kbd-hint')).toBeNull();
  });

  it('Esc 退出导航态：高亮清零、kbd 提示消失（56 批口径）', async () => {
    await mountQrt();
    const qrt = host.querySelector('.qrt') as HTMLElement;
    qrt.focus();
    pressKey('ArrowDown');
    await nextTick();
    expect(focusRowIdx()).toBe(0);
    expect(host.querySelector('.qrt-kbd-hint')).not.toBeNull();
    pressKey('Escape');
    await nextTick();
    expect(focusRowIdx()).toBe(-1);
    expect(host.querySelector('.qrt-kbd-hint')).toBeNull();
  });

  it('滚动跟随：focusIdx 移动触发目标行 scrollIntoView（block:nearest）', async () => {
    const calls: { arg: any; el: HTMLElement }[] = [];
    (HTMLElement.prototype as any).scrollIntoView = function (this: HTMLElement, arg: any) { calls.push({ arg, el: this }); };
    await mountQrt();
    const qrt = host.querySelector('.qrt') as HTMLElement;
    qrt.focus();
    pressKey('ArrowDown');
    await nextTick();
    pressKey('ArrowDown');
    await nextTick();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1].arg).toEqual({ block: 'nearest' });
    // 滚动目标正是高亮行（第 2 行，focusIdx=1）
    const rows = Array.from(host.querySelectorAll('.qrt-tbl tbody tr')) as HTMLElement[];
    expect(calls[calls.length - 1].el).toBe(rows[1]);
  });
});

describe('useRowNav 内核：行集变化钳位', () => {
  it('行集缩小时 focusIdx 自动钳到末行（防悬空高亮）', async () => {
    const rowCount = ref(5);
    const { focusIdx, onRowNavKey } = useRowNav(rowCount);
    focusIdx.value = 4;
    rowCount.value = 2;
    await nextTick();
    expect(focusIdx.value).toBe(1);
    // 空表按键不接管（focusIdx 原地不动），随后钳位 watch 归 -1
    rowCount.value = 0;
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    onRowNavKey(ev);
    expect(focusIdx.value).toBe(1);
    await nextTick();
    expect(focusIdx.value).toBe(-1);
  });
});
