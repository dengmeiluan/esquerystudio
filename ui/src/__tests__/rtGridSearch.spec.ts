/**
 * 二百二十九批 P0-1：RT 结果内查找（Ctrl+F）组件接线。
 * 锁定：Ctrl+F 打开搜索框；命中格 .rt-hit 高亮 + mark 切分；计数与回绕；
 * 当前命中 .hit-cur 落位（scrollIntoView）；Esc 关闭搜索（不误触 clearSel 同根竞态）。
 * 防抖走真实 220ms 等待（fake timers 的同步 advance 不 flush Vue 渲染微任务链，不可用）。
 * 挂载样板照抄 multiSort（裸 createApp + pinia + api mock）。
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
  { _id: 'b', _source: { name: 'apple', age: 31 } },
  { _id: 'c', _source: { name: 'pineapple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl() {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 3, index: 'gs1' }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const waitDebounce = async () => { await new Promise(r => setTimeout(r, 220)); await tick(); };
const keyOn = (sel: string, key: string, mods: KeyboardEventInit = {}) => {
  (host.querySelector(sel) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 结果内查找（229 批 P0-1）', () => {
  it('Ctrl+F 打开搜索框并聚焦；输入命中词→命中格高亮+mark 切分+计数', async () => {
    await mountTbl();
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    keyOn('.rt', 'f', { ctrlKey: true });
    await tick(2);
    const inp = host.querySelector('.hn-inp') as HTMLInputElement;
    expect(inp, 'Ctrl+F 应打开搜索输入框').toBeTruthy();
    inp.value = 'an';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await waitDebounce();
    /* 'an' 仅 banana 含（pineapple 是 ne/an? 无——i-n-e、e-a 相邻，无 'an'）→ 1 格 */
    expect(host.querySelectorAll('td.rt-hit').length).toBe(1);
    expect(host.querySelector('mark.rt-mark'), '命中格应 mark 切分高亮').toBeTruthy();
    expect(host.querySelector('.hn-count')?.textContent).toContain('1/1');
  });

  it('Enter 落位当前命中（.hit-cur + scrollIntoView）；Shift+Enter 回绕；Esc 关闭清除', async () => {
    const siv = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = siv;
    try {
      await mountTbl();
      const rt = host.querySelector('.rt') as HTMLElement;
      rt.focus();
      keyOn('.rt', 'f', { ctrlKey: true });
      await tick(2);
      const inp = host.querySelector('.hn-inp') as HTMLInputElement;
      inp.value = 'apple';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await waitDebounce();
      /* 'apple'：apple(b) + pineapple(c) → 2 格 */
      expect(host.querySelectorAll('td.rt-hit').length).toBe(2);
      /* useHitNav 语义：出结果即归位 current=1（计数 1/2），Enter=下一个 → 第 2 命中 */
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await tick();
      let cur = host.querySelector('td.hit-cur') as HTMLElement | null;
      expect(cur, 'Enter 应落位当前命中格').toBeTruthy();
      expect(cur?.dataset.ri).toBe('2'); // current=2 → pineapple 第 3 行
      expect(siv).toHaveBeenCalled();
      /* Shift+Enter：current 1（回绕）→ 第 1 命中 */
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, shiftKey: true }));
      await tick();
      cur = host.querySelector('td.hit-cur') as HTMLElement | null;
      expect(cur?.dataset.ri).toBe('1'); // apple 第 2 行
      /* Esc 关闭搜索：输入框消失 + 高亮清除 */
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await tick();
      expect(host.querySelector('.hn-inp')).toBeNull();
      expect(host.querySelector('td.hit-cur')).toBeNull();
      expect(host.querySelector('td.rt-hit')).toBeNull();
    } finally {
      delete (HTMLElement.prototype as any).scrollIntoView;
    }
  });
});
