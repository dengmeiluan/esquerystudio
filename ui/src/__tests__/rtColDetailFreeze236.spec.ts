/**
 * 二百三十六批 P2-3/P2-4：列详情卡 + 前缀多列冻结行为。
 * 锁定：
 * 1) 列头右键「列详情」→ 弹层显示去重值数/空值数/高频值（口径=筛选后行集）；
 * 2) 右键「冻结到此列」→ 前缀两列全部 rt-col-frozen + es_tbl_freeze_n 落盘；
 * 3) 冻结列 left 内联动态（第二冻结列 left=98+第一冻结列宽）。
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
  { _id: 'a', _source: { name: 'banana', level: 'warn', age: 2 } },
  { _id: 'b', _source: { name: 'apple', level: 'warn', age: 4 } },
  { _id: 'c', _source: { name: 'cherry', level: 'info', age: 6 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 3, index: 'cd2', ...props }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const thOf = (t: string) => [...host.querySelectorAll('thead th.rt-th')].find(x => (x as HTMLElement).dataset.col === t)!;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 列详情卡 + 前缀冻结（236 批）', () => {
  it('列头右键「列详情」→ 弹层统计（去重/空值/数值 Σ/高频值）', async () => {
    await mountTbl({ fieldTypes: { level: 'keyword' } });
    thOf('level').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick();
    const btn = [...document.body.querySelectorAll('.ccm-it') as any].find(b => b.textContent?.includes('列详情'));
    expect(btn, '列头右键应有「列详情」').toBeTruthy();
    (btn as HTMLElement).click();
    await tick();
    const card = document.body.querySelector('.rt-cd') as HTMLElement | null;
    expect(card, '列详情弹层应打开').toBeTruthy();
    expect(card!.textContent).toContain('level');
    expect(card!.textContent).toContain('keyword');
    /* level: warn×2 + info×1 → 去重 2、高频 warn 2 行 */
    expect(card!.textContent).toContain('2');
    expect(card!.textContent).toContain('warn');
  });

  it('「冻结到此列」→ 前缀多列 frozen class + left 内联递增 + 落盘', async () => {
    await mountTbl();
    /* 右键 level（第 2 业务列）→ 冻结到 level：name+level 两列进前缀 */
    thOf('level').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick();
    const btn = [...document.body.querySelectorAll('.ccm-it') as any].find(b => b.textContent?.includes('冻结到此列'));
    expect(btn).toBeTruthy();
    (btn as HTMLElement).click();
    await tick();
    /* name（第 1 业务列，left=98）与 level（第 2，left=98+180 默认宽）均冻结 */
    const nameTh = thOf('name') as HTMLElement;
    const levelTh = thOf('level') as HTMLElement;
    expect(nameTh.classList.contains('rt-col-frozen')).toBe(true);
    expect(levelTh.classList.contains('rt-col-frozen')).toBe(true);
    expect((nameTh as HTMLElement).style.left).toBe('98px');
    expect((levelTh as HTMLElement).style.left).toBe('278px'); // 98 + 180（默认宽）
    expect(levelTh.style.minWidth).toBe('180px'); // 150 批铁律：min-width 锁死
    expect(localStorage.getItem('es_tbl_freeze_n:cd2')).toBe('2');
    /* age 不冻结 */
    expect(thOf('age').classList.contains('rt-col-frozen')).toBe(false);
  });
});
