/**
 * 二百三十一批：RT 组件级三件——P1-6 列拖拽重排 / P1-3 多行转置 / P1-5 dot-path 列展平。
 * 锁定：
 * 1) 拖拽：合成 dragstart/dragover/drop → 列序变化+es_cols 落盘+drop 后 click 不改排序；
 * 2) 转置：hits=3 + N=2 → 转置表头 2 个 _id、行数=allCols+1（含 _id 行）；档位落盘；
 *    单行自动开关；hits=1 旧行为不回归；
 * 3) dot-path：嵌套 _source 子列「meta.x」进列集，勾选后取值正确（显示/搜索同口径）。
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
  { _id: 'a', _source: { name: 'banana', level: 'warn', meta: { x: 'x1', y: 1 } } },
  { _id: 'b', _source: { name: 'apple', level: 'info', meta: { x: 'x2', y: 2 } } },
  { _id: 'c', _source: { name: 'cherry', level: 'warn', meta: { x: 'x3', y: 3 } } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 3, index: 'bt1', ...props }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const thOf = (t: string) => [...host.querySelectorAll('thead th.rt-th')].find(x => (x as HTMLElement).dataset.col === t)!;
const dragOn = (th: Element, type: string, clientX = 0) =>
  th.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 列拖拽重排（231 批 P1-6）', () => {
  it('dragstart(name)→dragover(level 右半)→drop(level)：列序变化+es_cols 落盘+click 抑制', async () => {
    await mountTbl();
    const nameTh = thOf('name'), levelTh = thOf('level');
    /* dragstart 派发在 draggable 宿主（name span）；dragover/drop 派发在目标列 th（drop 目标=光标下列头） */
    const nameSpan = nameTh.querySelector('.rt-th-name') as HTMLElement;
    nameSpan.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await tick(2);
    /* level 列右半边（clientX 越过中点）→ after */
    levelTh.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 500 }));
    levelTh.dispatchEvent(new Event('drop', { bubbles: true }));
    await tick();
    /* 列序：name 移到 level 之后 */
    const colOrder = [...host.querySelectorAll('thead th.rt-th')].map(th => (th as HTMLElement).dataset.col);
    expect(colOrder.indexOf('level')).toBeLessThan(colOrder.indexOf('name'));
    /* 落盘（useTablePrefs watch 自动写 es_cols） */
    const saved = JSON.parse(localStorage.getItem('es_cols:bt1') || '[]');
    expect(saved.indexOf('level')).toBeLessThan(saved.indexOf('name'));
    /* drop 后的 click 不改排序（抑制窗口）：无排序箭头激活态 */
    nameTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    expect(nameTh.getAttribute('aria-sort')).toBe(null);
  });
});

describe('RT 多行转置（231 批 P1-3）', () => {
  it('hits=3 + 档位 5（>行数取全部）：转置表头字段+3 文档、行数=allCols+1（含 _id 行）；N 落盘', async () => {
    await mountTbl();
    /* 开转置 */
    (host.querySelector('.rt-transpose input') as HTMLInputElement).click();
    await tick();
    /* 切档位 5（档位表 1/5/10/20；hits 仅 3 → 渲染全部 3 条） */
    const sel = host.querySelector('.rt-t-n') as HTMLSelectElement;
    expect(sel, '转置开启后应出现档位选择').toBeTruthy();
    sel.value = '5';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    /* 表头：字段列 + 3 个文档列 */
    const heads = [...host.querySelectorAll('.rt-transposed thead th')].map(th => th.textContent?.trim());
    expect(heads[0]).toBe('字段');
    expect(heads.length).toBe(4);
    /* 行数：_id 行 + 5 数据列（name/level/meta/meta.x/meta.y）= 6 行 */
    const bodyRows = host.querySelectorAll('.rt-transposed tbody tr').length;
    expect(bodyRows).toBe(6);
    /* 档位落盘 */
    expect(localStorage.getItem('es_tbl_transpose_n:bt1')).toBe('5');
  });

  it('单行自动开关：hits=1 且开关开 → 自动进转置', async () => {
    await mountTbl({ hits: [HITS[0]] as any, total: 1 });
    expect(host.querySelector('.rt-transposed')).toBeNull();
    const sws = [...host.querySelectorAll('.rt-transpose input')] as HTMLInputElement[];
    sws[sws.length - 1].click(); // 单行自动
    await tick();
    expect(host.querySelector('.rt-transposed')).toBeTruthy();
  });

  it('hits=1 手动转置旧行为不回归（N=1 默认）', async () => {
    await mountTbl({ hits: [HITS[0]] as any, total: 1 });
    (host.querySelector('.rt-transpose input') as HTMLInputElement).click();
    await tick();
    const heads = [...host.querySelectorAll('.rt-transposed thead th')];
    expect(heads.length).toBe(2); // 字段 + 1 文档
  });
});

describe('RT dot-path 嵌套列展平（231 批 P1-5）', () => {
  it('子列 meta.x/meta.y 进列集（默认前 8 含子列）；点路径取值正确', async () => {
    await mountTbl();
    /* allCols=顶层(name/level/meta)+子列(meta.x/meta.y)——默认前 8 全显，meta.x 列头直接在 */
    const th = thOf('meta.x');
    expect(th, '子列 meta.x 应按点路径命名进列集').toBeTruthy();
    const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === 'meta.x') as HTMLElement;
    expect(td.textContent?.trim()).toBe('x1');
    /* 跨行取值正确（b 行 x2） */
    const td2 = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === 'meta.x' && (td as HTMLElement).dataset.ri === '1') as HTMLElement;
    expect(td2.textContent?.trim()).toBe('x2');
  });
});
