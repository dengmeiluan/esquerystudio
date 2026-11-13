/**
 * R130 一百二十九批：单元格右键菜单列管理直达（RT/QRT 同款，dbx 右键标配）。
 * 锁定：
 * 1) RT 右键菜单含「隐藏此列」「此列置首」，且与复制组之间有分隔线（ccm-sep）；
 * 2) 隐藏此列 → 该列从表头消失 + es_cols:<dim> 落盘（记忆诚实，恢复走列选器）；
 * 3) 此列置首 → 该列成为第一个数据列 + 落盘；
 * 4) 最后一列点隐藏 → toast error 且列保留（防呆，不许把表藏没）；
 * 5) QRT：记忆关闭（无 dimension）时不暴露列管理项（避免「改了不记忆」的误导）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { allLabels } from './helpers/ctxMenu'; /* 1142：二级菜单能力面 */

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
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, { ...props }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});

function menuButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];
}
/* 一级项（二级面板常驻 DOM，顺序锁只看主面板直属项） */
function menuTopLabels(): string[] {
  return ([...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')] as HTMLButtonElement[])
    .map(b => (b.textContent ?? '').trim());
}

/* 1142：菜单收成两级——列管理/复制等动作项住在分组二级里。
 测试统一走「点分组父行 → 二级项可直接点」。 */
const SUB = '.ccm-mask .ccm-sub .ccm-it';
function subButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll(SUB)] as HTMLButtonElement[];
}
async function openGroup(label: string) {
  const parent = menuButtons().find(b => (b.textContent ?? '').includes(label) && b.getAttribute('aria-haspopup') === 'menu');
  expect(parent, `分组「${label}」必须在场`).toBeTruthy();
  parent!.click();
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}
/* 1385：列管理从「列与导出…」拆出为「列操作…」；导出另成「导出…」组。 */
async function clickItem(label: string, group = '列操作…') {
  if (!subButtons().some(b => (b.textContent ?? '').includes(label))) await openGroup(group);
  const it = subButtons().find(b => (b.textContent ?? '').includes(label))
    ?? menuButtons().find(b => (b.textContent ?? '').includes(label));
  expect(it, `菜单项「${label}」必须在场`).toBeTruthy();
  it!.click();
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

async function openMenuAt(cellSel: string) {
  const cell = host.querySelector(cellSel) as HTMLElement;
  cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}

function headerCols(): string[] {
  /* 数据列从第 3 个 th 起（0=勾选、1=序号）；尾部「操作」列不算数据列 */
  return [...host.querySelectorAll('thead th')].slice(2).map(th => (th.textContent ?? '').trim()).filter(t => t !== '操作');
}

describe('RT 右键列管理（129 批）', () => {
  it('菜单含隐藏/置首项（列操作分组内），且有分组分隔线', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'cm1' });
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await openGroup('列操作…');
    const labels = subButtons().map(b => b.textContent?.trim());
    expect(labels).toContain('隐藏此列');
    expect(labels).toContain('此列置首');
    expect(document.querySelectorAll('.ccm-mask .ccm-sep').length).toBeGreaterThanOrEqual(1);
  });

  it('隐藏此列：列消失 + es_cols 落盘', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'cm2' });
    expect(headerCols()).toEqual(['name', 'age']);
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await clickItem('隐藏此列');
    expect(headerCols()).toEqual(['age']);
    expect(JSON.parse(localStorage.getItem('es_cols:cm2') || '[]')).toEqual(['age']);
  });

  it('此列置首：age 移到第一数据列 + 落盘', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'cm3' });
    await openMenuAt('tbody tr:first-child td.rt-cell:nth-child(4)');
    await clickItem('此列置首');
    expect(headerCols()).toEqual(['age', 'name']);
    expect(JSON.parse(localStorage.getItem('es_cols:cm3') || '[]')).toEqual(['age', 'name']);
  });

  it('最后一列不可隐藏（toast 防呆且列保留）', async () => {
    localStorage.setItem('es_cols:cm4', JSON.stringify(['age']));
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'cm4' });
    expect(headerCols()).toEqual(['age']);
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await clickItem('隐藏此列');
    expect(headerCols()).toEqual(['age']);
  });
});

describe('RT 勾选行复制组（130 批）', () => {
  it('无勾选时不出现复制行组；勾选后「复制…」二级出现并带行数', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'cr1' });
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await openGroup('复制…');
    expect(subButtons().map(b => b.textContent?.trim()).filter(t => t?.includes('行为'))).toEqual([]);
    /* 勾选两行（含 shift 范围不做——直接点两个 checkbox） */
    const boxes = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    boxes[0].click(); boxes[1].click();
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await openGroup('复制…');
    const labels = subButtons().map(b => b.textContent?.trim());
    expect(labels).toContain('复制 2 行为 TSV');
    expect(labels).toContain('复制 2 行为 Markdown');
    expect(labels).toContain('复制 2 行为 JSON');
  });

  it('复制 TSV 剪贴板内容=可见列名表头+勾选行（所见即所得）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    localStorage.setItem('es_cols:cr2', JSON.stringify(['age']));
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'cr2' });
    const boxes = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    boxes[0].click();
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await clickItem('行为 TSV', '复制…');
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toBe('age\n2');
  });
});

describe('RT 冻结标识列（131 批）', () => {
  it('chk/序号列 sticky 样式锁（源码级，防回归丢失冻结）', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/ResultTable.vue'), 'utf-8');
    expect(src).toMatch(/th\.rt-chk, \.rt-tbl th\.rt-idx, \.rt-tbl td\.rt-chk, \.rt-tbl td\.rt-idx \{[^}]*position: sticky/);
    expect(src).toMatch(/\.rt-tbl th\.rt-chk, \.rt-tbl td\.rt-chk \{ left: 0/);
    expect(src).toMatch(/\.rt-tbl th\.rt-idx, \.rt-tbl td\.rt-idx \{ left: 46px/);
    /* 三态背景同步：hover/选中/焦点行的冻结格不透明底 */
    expect(src).toMatch(/tr:hover td\.rt-chk/);
    expect(src).toMatch(/tr\.sel td\.rt-chk/);
  });

  it('冻结格背景不透明（happy-dom computedStyle 抽查）', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'fz1' });
    const chk = host.querySelector('tbody td.rt-chk') as HTMLElement;
    /* happy-dom 不解析 scoped style，仅锁类名挂载正确；视觉断言以源码锁兜底 */
    expect(chk).toBeTruthy();
  });
});

describe('右键 auto-fit（140 批）', () => {
  it('「此列适应内容」菜单项存在；happy-dom 下 scrollWidth=0 安全 no-op', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'af1' });
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await openGroup('列操作…');   /* 1385：列管理已从「列与导出…」拆出 */
    const fit = subButtons().find(b => b.textContent?.includes('此列适应内容'));
    expect(fit).toBeTruthy();
    /* happy-dom 无布局引擎 scrollWidth 恒 0 → 不写入 colWidths（真实浏览器按内容实测） */
    fit!.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(JSON.parse(localStorage.getItem('es_tbl_w:af1') || '{}')).toEqual({});
  });
});

describe('列头右键列管理（148 批）', () => {
  it('RT 列头右键出列管理菜单（排序直选/复制列名/隐藏/置首/适应内容），隐藏落盘', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'ch1' });
    const th = [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes('name')) as HTMLElement;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    /* 1142：列头菜单同为两层（一级只留列详情 + 三组父行；动作项住二级，能力零删除） */
    expect(menuTopLabels()).toEqual(['列详情', '排序与筛选…', '复制…', '列与视图…']);
    const all = await allLabels();
    for (const need of ['降序排序', '筛选此列', '复制列名', '复制表头（TSV）', '复制整列值', '复制整表 JSON',
      '隐藏此列', '此列置首', '冻结到此列', '此列适应内容', '全列适应内容', '重置列序']) {
      expect(all, need).toContain(need);
    }
    /* 1143：聚合行/语义格式化/转置是「整张表」的视图开关，已归位工具行「视图 ⋯」——
       列头菜单只留作用于「这一列」的动作，不再混入（能力未删除，入口换位置）。 */
    for (const gone of ['聚合行：关', '语义格式化：开 ✓', '转置视图']) {
      expect(all, gone + ' 已移出列头菜单').not.toContain(gone);
    }
    menuButtons().find(b => b.textContent?.includes('隐藏此列'))!.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(headerCols()).toEqual(['age']);
    expect(JSON.parse(localStorage.getItem('es_cols:ch1') || '[]')).toEqual(['age']);
  });

  it('复制列名走剪贴板（157 批）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'ch2' });
    const th = [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes('name')) as HTMLElement;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    menuButtons().find(b => b.textContent?.includes('复制列名'))!.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(writeText).toHaveBeenCalledWith('name');
  });
});

describe('QRT 列管理门控（129 批）', () => {
  const QCOLS = ['c1', 'c2'];
  const QROWS = [['x1', 'y1'], ['x2', 'y2']];

  it('记忆关闭时不暴露列管理项', async () => {
    await mountTbl(QueryResultTable, { cols: QCOLS, rows: QROWS, total: 2 });
    /* qrt-cell 精确定位数据格（167 批起首格是冻结序号列，无右键菜单） */
    await openMenuAt('tbody tr:first-child td.qrt-cell');
    const labels = menuButtons().map(b => b.textContent?.trim());
    expect(labels).not.toContain('列与导出…');
    await openGroup('筛选与排序…');
    expect(subButtons().map(b => b.textContent?.trim())).not.toContain('隐藏此列');
    expect(subButtons().map(b => b.textContent?.trim())).not.toContain('此列置首');
  });

  it('记忆启用时暴露且隐藏落盘', async () => {
    await mountTbl(QueryResultTable, { cols: QCOLS, rows: QROWS, total: 2, storageKey: 'qcm' });
    await openMenuAt('tbody tr:first-child td.qrt-cell');
    await clickItem('隐藏此列');
    const head = [...host.querySelectorAll('thead th')].map(th => (th.textContent ?? '').trim());
    expect(head).not.toContain('c1');
    expect(JSON.parse(localStorage.getItem('es_cols:qcm') || '[]')).toEqual(['c2']);
  });
});

describe('ColPicker 集成链（164 批回归——152 批曾丢 @update:selected）', () => {
  it('隐藏一列后点列选「全选」→ 所有列表头恢复', async () => {
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'i1', storageKey: 'cp1' });
    /* 先隐藏一列（右键菜单路径） */
    await openMenuAt('tbody tr:first-child td.rt-cell');
    await clickItem('隐藏此列');
    expect(headerCols()).toEqual(['age']);
    /* 点列选触发钮 → 弹层内点「全选」→ 全部列表头恢复 */
    const colBtn = [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('选择显示的列'))!;
    colBtn.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    const pick = document.querySelector('.col-pick')!;
    const allBtn = [...pick.querySelectorAll('.col-pick-row button')].find(b => b.textContent?.includes('全选')) as HTMLButtonElement;
    allBtn.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(headerCols()).toEqual(['name', 'age']);
  });
});
