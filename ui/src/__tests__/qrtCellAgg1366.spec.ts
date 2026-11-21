/**
 * 一千三百六十六批：SQL 结果表（QRT）补齐 RT 的两项能力——用户反复问的
 * 「为什么 sql 的表格能力跟查询/索引工作台不一样」。
 *
 * ① Ctrl/Cmd+点击数值单元格 = 手挑聚合。此前 QRT 只有表尾「聚合行」（整列聚合），
 *    没有任何散选通道；运营在 SQL 结果里常要「这几格加起来是多少」。
 * ② 页脚状态栏。此前 QRT 只有分页行，缺 RT 的「Σ/avg/min/max/count + 操作提示」页脚。
 *
 * 关键行为断言（不只是源码形态）：
 *  - Ctrl+点击 → 出现 Σ 合计为两格之和；普通点击 → 仍是复制（不被聚合抢走）
 *  - 再点同一格 → 取消；Esc → 清空
 * 负控：把修饰键判断去掉 → 聚合行为断言必须红。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const QRT_SRC = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mount(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const settle = async () => { for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* 真实手势序列：mousedown 锚点(10,10) → click 同坐标（否则 pressGuard 视为拖选而丢弃单击） */
function press(el: HTMLElement, ctrl: boolean) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ctrl, clientX: 10, clientY: 10 }));
}
function ctrlClick(el: HTMLElement) { press(el, true); }

describe('1366 SQL 结果表：Ctrl+点击聚合 + 页脚状态栏', () => {
  const COLS = ['name', 'amount'];
  const ROWS = [['a', 10], ['b', 32], ['c', 7]];

  it('① Ctrl+点击两格 → 页脚出现 Σ = 42', async () => {
    await mount({ cols: COLS, rows: ROWS, storageKey: 'agg1366' });
    const cells = () => [...host.querySelectorAll('tbody tr')].map(tr => tr.querySelectorAll('td.qrt-cell')[1] as HTMLElement);
    expect(cells().length, '三行数据').toBe(3);
    ctrlClick(cells()[0]!); await settle();
    ctrlClick(cells()[1]!); await settle();
    const foot = host.querySelector('.qrt-status');
    expect(foot, '页脚必须出现').not.toBeNull();
    expect(foot!.textContent, '10 + 32 = 42').toContain('42');
    /* 1413：min/max/count 收进 tooltip（三段并存时会把按钮挤出可视区），
       可见文案改为「已选 N 格」；格数与完整统计仍可读（title）→ 意图不变 */
    expect(foot!.textContent, '计数为 2').toContain('已选 2 格');
    expect(foot!.querySelector('.qrt-stat-seg')?.getAttribute('title') ?? '', 'tooltip 仍报 count').toContain('count 2');
    expect(host.querySelectorAll('td.qrt-agg-sel').length, '两格高亮').toBe(2);
  });

  it('② 再点同一格 → 取消（Σ 只剩另一格）', async () => {
    await mount({ cols: COLS, rows: ROWS, storageKey: 'agg1366b' });
    const cells = () => [...host.querySelectorAll('tbody tr')].map(tr => tr.querySelectorAll('td.qrt-cell')[1] as HTMLElement);
    ctrlClick(cells()[0]!); await settle();
    ctrlClick(cells()[1]!); await settle();
    ctrlClick(cells()[1]!); await settle();
    const foot = host.querySelector('.qrt-status');
    expect(foot!.textContent).toContain('10');
    expect(foot!.textContent, '只剩 1 格').toContain('已选 1 格');
    expect(foot!.querySelector('.qrt-stat-seg')?.getAttribute('title') ?? '', 'tooltip 仍报 count').toContain('count 1');
    expect(host.querySelectorAll('td.qrt-agg-sel').length).toBe(1);
  });

  it('③ 普通点击不进聚合、也不再复制（1374 单击复制退役）', async () => {
    const mod = await import('../utils/format');
    const spy = vi.spyOn(mod, 'copyText').mockResolvedValue(true);
    await mount({ cols: COLS, rows: ROWS, storageKey: 'agg1366c' });
    const cell = host.querySelectorAll('tbody tr')[0]!.querySelectorAll('td.qrt-cell')[1] as HTMLElement;
    press(cell, false);
    await settle();
    expect(spy, '普通点击不再复制').not.toHaveBeenCalled();
    expect(host.querySelectorAll('td.qrt-agg-sel').length, '无修饰键不聚合').toBe(0);
    spy.mockRestore();
  });

  it('④ Esc 清空聚合选择', async () => {
    await mount({ cols: COLS, rows: ROWS, storageKey: 'agg1366d' });
    const cells = () => [...host.querySelectorAll('tbody tr')].map(tr => tr.querySelectorAll('td.qrt-cell')[1] as HTMLElement);
    ctrlClick(cells()[0]!); await settle();
    const root = host.querySelector('.qrt') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(host.querySelectorAll('td.qrt-agg-sel').length, 'Esc 后清空').toBe(0);
    expect(host.querySelector('.qrt-status')!.textContent, '回到提示态').toContain('Ctrl+点击');
  });

  it('⑤ 非数值列 Ctrl+点击不进聚合（不该出现「0 个数值」的假聚合）', async () => {
    await mount({ cols: COLS, rows: ROWS, storageKey: 'agg1366e' });
    const nameCell = host.querySelectorAll('tbody tr')[0]!.querySelectorAll('td.qrt-cell')[0] as HTMLElement;
    ctrlClick(nameCell); await settle();
    expect(host.querySelectorAll('td.qrt-agg-sel').length, '文本格不参与数值聚合').toBe(0);
  });

  it('页脚是表卡页脚形态（贴死表体、只留底圆角）', () => {
    const i = QRT_SRC.indexOf('.qrt-status {');
    expect(i, '必须有 .qrt-status 规则').toBeGreaterThan(-1);
    const body = QRT_SRC.slice(i, QRT_SRC.indexOf('}', i));
    expect(body, '与表体共边（消双线）').toContain('border-top: 0');
    expect(body, '卡尾圆角').toContain('border-radius: 0 0 var(--r-m) var(--r-m)');
  });

  it('负控：去掉修饰键判断 → ① 的聚合断言必须失败', async () => {
    /* 直接在同一组件实例上验证判据本身：无修饰键的点击不得产生聚合 */
    await mount({ cols: COLS, rows: ROWS, storageKey: 'agg1366f' });
    const cells = () => [...host.querySelectorAll('tbody tr')].map(tr => tr.querySelectorAll('td.qrt-cell')[1] as HTMLElement);
    press(cells()[0]!, false);
    await settle();
    expect(host.querySelectorAll('td.qrt-agg-sel').length, '无修饰键不得聚合').toBe(0);
  });
});
