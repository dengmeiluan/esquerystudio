/**
 * 二百二十七批：RT 选区聚合（summarize 合并 + 框选自动聚合）。
 * 锁定：
 * 1) Ctrl+点两格数值 → 状态栏 Σ/avg/min/max/count（aggStats 走 summarize 的行为回归）；
 * 2) 框选区域 → 浮动条直读 Σ 与数值占比（无需 Ctrl+点击）；
 * 3) 全非数值框选 → 无 Σ（不显示空壳聚合）。
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
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(ResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

const cellAt = (ri: number, col: string) => [...host.querySelectorAll('td.rt-cell')]
  .find(td => (td as HTMLElement).dataset.col === col && (td as HTMLElement).dataset.ri === String(ri)) as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 选区聚合（227 批）', () => {
  it('Ctrl+点两格数值 → 状态栏 Σ/avg/min/max/count', async () => {
    await mountTbl({ hits: HITS, total: 2, index: 'agg1' });
    cellAt(0, 'age').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await tick();
    cellAt(1, 'age').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await tick();
    const stat = (host.querySelector('.rt-status') as HTMLElement).textContent || '';
    expect(stat).toContain('Σ 5');
    expect(stat).toContain('avg 2.50');
    expect(stat).toContain('min 2');
    expect(stat).toContain('max 3');
    expect(stat).toContain('count 2');
  });

  it('框选区域 → 浮动条直读 Σ 与数值占比', async () => {
    await mountTbl({ hits: HITS, total: 2, index: 'agg2' });
    cellAt(0, 'age').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    cellAt(1, 'name').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await tick();
    const float = host.querySelector('.rt-float') as HTMLElement;
    expect(float, '框选结束应出浮动栏').toBeTruthy();
    const text = float.textContent || '';
    expect(text).toContain('4 格');           // 2 行 × 2 列
    expect(text).toContain('数值 2/4');        // age 两格数值、name 两格字符串
    expect(text).toContain('Σ 5');
    expect(text).toContain('avg 2.50');
  });

  it('全非数值框选 → 不显示 Σ 空壳', async () => {
    await mountTbl({ hits: HITS, total: 2, index: 'agg3' });
    cellAt(0, 'name').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    cellAt(1, 'name').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await tick();
    const text = (host.querySelector('.rt-float') as HTMLElement).textContent || '';
    expect(text).toContain('数值 0/2');
    expect(text).not.toContain('Σ');
  });
});
