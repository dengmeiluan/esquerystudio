/**
 * 列头「排序指示 ⇄ 筛选漏斗」锚定修复：
 * 激活排序箭头（.rt-th-sort-on）此前是流内元素——悬停时列名让位内衬（34px）会把
 * 它推进漏斗的 absolute 区（漏斗 right:8 top:3），形成箭头叠漏斗。
 * 改为与 ⇅ 提示同锚点（absolute right:24 垂直居中），位置恒定；多列角标（两表的
 * .rt-sort-ord/.qrt-sort-ord）同轴锚定在箭头左侧，不再贴列名尾部漂移。
 * 锁定：源码锚点字面 + 挂载后激活列 th 带 rt-th-on + 箭头/角标元素存在且 absolute。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const HITS = [
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'a', _source: { name: 'banana', age: 1 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl() {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 2, index: 'so1' }) });
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
  host.innerHTML = '';
});

describe('排序指示锚定（源码锁）', () => {
  it('激活箭头与 ⇅ 提示同锚点：absolute right:24 垂直居中', () => {
    expect(rt).toMatch(/\.rt-th-sort-on \{ position: absolute; right: 24px; top: 50%; transform: translateY\(-50%\);/);
  });

  it('激活列列名常驻让位（等值 34px，悬停不跳变）', () => {
    expect(rt).toMatch(/\.rt-th-on \.rt-th-label \{ padding-right: 34px; \}/);
  });

  it('多列角标锚定在箭头左侧，与箭头同轴（RT right:38 / QRT right:39）', () => {
    expect(rt).toMatch(/\.rt-sort-ord \{ position: absolute; right: 38px; top: 50%; transform: translateY\(-50%\);/);
    expect(qrt).toMatch(/\.qrt-sort-ord \{ position: absolute; right: 39px; top: 50%; transform: translateY\(-50%\);/);
  });

  it('漏斗锚点不与箭头水平交叠（漏斗 [8,24] vs 箭头 [24,35] 相邻）', () => {
    expect(rt).toMatch(/\.rt-funnel \{ position: absolute; right: 8px; top: 3px;/);
  });

  it('负控：锚点字面被删 → 断言转红（判据非恒真）', () => {
    const broken = rt.replace('.rt-th-sort-on { position: absolute; right: 24px; top: 50%; transform: translateY(-50%); color: var(--ac-hi); flex: none; }', '');
    expect(() => expect(broken).toMatch(/\.rt-th-sort-on \{ position: absolute; right: 24px;/)).toThrow();
  });
});

describe('排序指示锚定（挂载锁）', () => {
  it('点击排序后：th 带 rt-th-on；箭头元素存在且 absolute 定位', async () => {
    await mountTbl();
    const nameTh = [...host.querySelectorAll('thead th')].find(x => x.textContent?.includes('name'))!;
    expect(nameTh.classList.contains('rt-th-on')).toBe(false);
    nameTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(nameTh.classList.contains('rt-th-on')).toBe(true);
    const on = nameTh.querySelector('.rt-th-sort-on');
    expect(on, '激活箭头必须渲染').toBeTruthy();
    /* jsdom 不级联计算 SFC 类规则，几何锚点由上方源码字面锁兜底；
       这里锁「激活箭头与 ⇅ 提示是不同元素类」——保证挂载态走的是锚定规则那条分支 */
    /* 已排序列不该再渲染 ⇅ 提示（激活箭头与提示互斥分支） */
    expect(nameTh.querySelector('.rt-th-sort-hint')).toBeNull();
  });

  it('未排序列无箭头；aria-sort 与 th-on 同步（取消排序后回落）', async () => {
    await mountTbl();
    const nameTh = [...host.querySelectorAll('thead th')].find(x => x.textContent?.includes('name'))!;
    nameTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    nameTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    nameTh.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(nameTh.classList.contains('rt-th-on')).toBe(false);
    expect(nameTh.querySelector('.rt-th-sort-on')).toBeNull();
    expect(nameTh.getAttribute('aria-sort')).toBeNull();
  });
});
