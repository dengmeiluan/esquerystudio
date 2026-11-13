/**
 * 二百三十批 P0-3/P0-4/P1-7：RT 组件级接线（跳转到列 / 列筛选 / totalGte）。
 * 锁定：
 * 1) locate-col：th 闪烁 class + scrollIntoView + 隐藏列先自动显示；
 * 2) 列筛选：漏斗钮→弹层→勾选→行过滤+「已筛选」提示；筛选清框选（坐标键联动）；
 *    隐藏列自动清筛选；右键「筛选此列」直达；
 * 3) totalGte：计数后加 + 与「命中数为下界」标注。
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
import { clearTablesForTest, visibleTables } from '../utils/tableRegistry';
import { findMenuItem } from './helpers/ctxMenu'; /* 1142：二级菜单取项 */
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', level: 'warn' } },
  { _id: 'b', _source: { name: 'apple', level: 'warn' } },
  { _id: 'c', _source: { name: 'cherry', level: 'info' } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 3, index: 'lc1', ...props }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

/* happy-dom 无布局引擎（offsetParent 恒 undefined=不可见）——实例级 defineProperty 模拟可见 */
function markVisible() {
  const root = host.querySelector('.rt') as any;
  Object.defineProperty(root, 'offsetParent', { value: document.body, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearTablesForTest();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 跳转到列（230 批 P0-3）', () => {
  it('table-cmd locate-col：th 闪烁+scrollIntoView；隐藏列先自动显示；注册表可见性接通', async () => {
    const siv = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = siv;
    try {
      await mountTbl();
      markVisible();
      expect(visibleTables().length).toBe(1);
      /* 隐藏列 level 先显示再跳 */
      localStorage.setItem('es_cols:lc1', JSON.stringify(['name']));
      apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
      apps.length = 0;
      host.innerHTML = '';
      await mountTbl();
      markVisible();
      expect(visibleTables()[0].entry.cols()).toEqual(['name']);
      visibleTables()[0].entry.locate('level'); /* 788 改写：locateInTable 退役，跳列现役=entry.locate 直连（CmdPalette 同形态） */
      await tick();
      /* level 列被自动加回（显示） */
      const th = [...host.querySelectorAll('thead th.rt-th')].find(t => (t as HTMLElement).dataset.col === 'level') as HTMLElement;
      expect(th, '隐藏列应自动显示').toBeTruthy();
      expect(th.classList.contains('rt-col-flash'), '目标列头闪烁').toBe(true);
      expect(siv).toHaveBeenCalled();
      /* 1.4s 后闪烁自动熄灭（真实等待——fake/real 混用会让真 timer 在 fake 时钟里失联） */
      await new Promise(r => setTimeout(r, 1600));
      await tick();
      expect(th.classList.contains('rt-col-flash')).toBe(false);
    } finally {
      delete (HTMLElement.prototype as any).scrollIntoView;
    }
  });
}, 40000);

describe('RT 列值筛选（230 批 P0-4）', () => {
  it('漏斗钮→弹层→勾选值→行过滤+已筛选提示条', async () => {
    await mountTbl();
    const funnel = [...host.querySelectorAll('.rt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 level 列') as HTMLElement;
    funnel.click();
    await tick();
    const rows = [...document.body.querySelectorAll('.cfp-row')] as HTMLElement[];
    expect(rows.length).toBe(2); // warn / info
    /* 勾选 warn（含计数徽标） */
    const warnRow = rows.find(r => r.textContent?.includes('warn'))!;
    expect(warnRow.querySelector('.cfp-n')?.textContent?.trim()).toBe('2');
    (warnRow.querySelector('input') as HTMLInputElement).click();
    await tick();
    /* 行过滤：3 → 2 行（warn 行），提示条出现 */
    expect(host.querySelectorAll('tbody tr').length).toBe(2);
    const bar = host.querySelector('.rt-filtered') as HTMLElement;
    expect(bar.textContent).toContain('已筛选 1 列');
    expect(bar.textContent).toContain('2/3 行');
  });

  it('筛选清框选（坐标键联动）；隐藏列自动清筛选', async () => {
    await mountTbl();
    /* 框选：从 (0,name) 拖到 (1,level) */
    const cellAt = (ri: number, col: string) => [...host.querySelectorAll('td.rt-cell')]
      .find(td => (td as HTMLElement).dataset.col === col && (td as HTMLElement).dataset.ri === String(ri)) as HTMLElement;
    cellAt(0, 'name').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    cellAt(1, 'level').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await tick();
    expect(host.querySelector('.rt-float'), '框选浮动条应出现').toBeTruthy();
    /* 打开筛选弹层并勾选 → 框选应被连带清除（断言框选格 class——浮动条有
       transition 离场动画，happy-dom 不触发 transitionend 会悬挂在 leave 态） */
    const funnel = [...host.querySelectorAll('.rt-funnel')].find(b => b.getAttribute('aria-label') === '筛选 level 列') as HTMLElement;
    funnel.click();
    await tick();
    const warnRow = [...document.body.querySelectorAll('.cfp-row')].find(r => r.textContent?.includes('warn'))!;
    (warnRow.querySelector('input') as HTMLInputElement).click();
    await tick();
    expect(host.querySelectorAll('td.rt-region').length, '筛选变化应连带清框选（坐标键）').toBe(0);
    expect(host.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('右键「筛选此列」直达弹层', async () => {
    await mountTbl();
    const td = host.querySelector('td.rt-cell') as HTMLElement;
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick();
    /* 1142：筛选动作住「筛选与排序…」二级 */
    const btn = await findMenuItem('筛选此列');
    expect(btn, '右键菜单应有「筛选此列」').toBeTruthy();
    (btn as HTMLElement).click();
    await tick();
    expect(document.body.querySelector('.cfp'), '应打开筛选弹层').toBeTruthy();
  });
});

describe('RT totalGte 下界标注（230 批 P1-7）', () => {
  it('totalGte=true 时计数加 + 与「命中数为下界」标注；默认不加', async () => {
    await mountTbl({ total: 12345, totalGte: true });
    const info = host.querySelector('.rt-info') as HTMLElement;
    expect(info.textContent).toContain('12,345+');
    expect(info.textContent).toContain('命中数为下界');
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl({ total: 12345 });
    expect((host.querySelector('.rt-info') as HTMLElement).textContent).not.toContain('+');
  });
});
