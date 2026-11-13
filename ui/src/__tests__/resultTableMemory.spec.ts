/**
 * R130 二十七批：ResultTable 记忆性与勾选诚实性守卫。
 * 锁定：
 * 1) 排序点击后持久化到 es_tbl_sort:<storageKey|index>:f/:d；
 * 2) 重挂载后排序记忆恢复（列头箭头 + 行序）；
 * 3) 切 storageKey 重读该维度记忆（互不串扰）；
 * 4) clearSelected(ids) 只剔除指定 id、保留其余（删除成功后父组件精确清理的契约），
 *    clearSelected() 清空全部；
 * 5) took prop 有值时 rt-info 显示「 · Nms」、null/-1 不显示（二十六批行为）。
 * mock 网络出口（clusterQuery 不经 ResultTable——它纯展示 props.hits，仅 stub 防御性噪音）。
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

/* 七十七批：捕获 downloadText——断言导出行序跟随表格排序（所见即所得） */
const downloadCalls: Array<{ name: string; content: string }> = [];
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return {
    ...actual,
    downloadText: (...a: any[]) => { downloadCalls.push({ name: a[0] as string, content: a[1] as string }); },
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

async function mountTbl(props: Record<string, any>) {
  let exposed: any = null;
  const app = createApp({
    setup() {
      return () => h(ResultTable as any, { ...props, ref: (el: any) => { exposed = el; } });
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return { exposed: () => exposed };
}

beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

function colCells(col: string): string[] {
  /* 表格列序：0=勾选、1=序号、2..=数据列（allCols 按首行 _source 键序 name,age） */
  const dataIdx = 2 + ['name', 'age'].indexOf(col);
  return [...host.querySelectorAll('tbody tr')].map(tr => (tr.children[dataIdx]?.textContent ?? '').trim());
}

describe('ResultTable 排序记忆', () => {
  it('点击列头排序后写入 es_tbl_sort:<key>:f/:d', async () => {
    await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k1' });
    const nameTh = [...host.querySelectorAll('th')].find(th => th.textContent?.includes('name'))!;
    nameTh.click();
    await nextTick();
    expect(localStorage.getItem('es_tbl_sort:k1:f')).toBe('name');
    expect(localStorage.getItem('es_tbl_sort:k1:d')).toBe('asc');
  });

  it('重挂载后排序记忆恢复（行序按 name asc）', async () => {
    localStorage.setItem('es_tbl_sort:k1:f', 'name');
    localStorage.setItem('es_tbl_sort:k1:d', 'asc');
    await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k1' });
    expect(colCells('name')).toEqual(['apple', 'banana', 'cherry']);
  });

  it('切 storageKey 重读该维度记忆，互不串扰', async () => {
    localStorage.setItem('es_tbl_sort:k1:f', 'name');
    localStorage.setItem('es_tbl_sort:k1:d', 'desc');
    await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k1' } as any);
    expect(colCells('name')).toEqual(['cherry', 'banana', 'apple']);
    /* 卸载 k1 表再挂 k2：锁「k2 不读 k1 的记忆」而非 DOM 混挂 */
    apps[apps.length - 1].unmount();
    apps.pop();
    host.innerHTML = '';
    localStorage.setItem('es_tbl_sort:k2:f', 'age');
    localStorage.setItem('es_tbl_sort:k2:d', 'asc');
    await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k2' } as any);
    expect(colCells('age')).toEqual(['1', '2', '3']);
  });

  /* 六十七批：三击循环 升→降→取消——第三击回 ES 原始序并移除 LS 键。
     此前循环 asc↔desc 永远回不到「无排序」，persistSort 的 sortField 空分支不可达。 */
  it('同列第三击取消排序：行序回原始、es_tbl_sort 键移除、aria-sort 同步（八十一批）', async () => {
    await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k1' });
    const nameTh = [...host.querySelectorAll('th')].find(th => th.textContent?.includes('name'))!;
    nameTh.click(); await nextTick(); // asc
    expect(colCells('name')).toEqual(['apple', 'banana', 'cherry']);
    expect(nameTh.getAttribute('aria-sort')).toBe('ascending');
    nameTh.click(); await nextTick(); // desc
    expect(colCells('name')).toEqual(['cherry', 'banana', 'apple']);
    expect(nameTh.getAttribute('aria-sort')).toBe('descending');
    nameTh.click(); await nextTick(); // 取消
    expect(colCells('name')).toEqual(['banana', 'apple', 'cherry']); // HITS 原始序
    expect(nameTh.getAttribute('aria-sort')).toBe(null);
    expect(localStorage.getItem('es_tbl_sort:k1:f')).toBe(null);
    expect(localStorage.getItem('es_tbl_sort:k1:d')).toBe(null);
  });
});

describe('ResultTable 勾选诚实性（clearSelected）', () => {
  it('clearSelected([id]) 只剔除指定 id、保留其余', async () => {
    const { exposed } = await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k1' });
    exposed().clearSel();
    // 勾选 a、b（行内 checkbox）
    const chks = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    chks[0].click(); chks[1].click();
    await nextTick();
    expect(host.querySelector('.rt-float-n')?.textContent).toContain('2');
    exposed().clearSelected(['a']);
    await nextTick();
    expect(host.querySelector('.rt-float-n')?.textContent).toContain('1');
  });

  it('clearSelected() 清空全部', async () => {
    const { exposed } = await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k1' });
    const chks = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    chks[0].click();
    await nextTick();
    exposed().clearSelected();
    /* 绕开 Transition 离场动画在 happy-dom 下不结束的残留：再勾一条，
       若清空失败集合里有旧 id 会显示 2，正确清空则显示 1 */
    chks[2].click();
    await nextTick();
    expect(host.querySelector('.rt-float-n')?.textContent).toContain('1');
  });
});

describe('ResultTable took 显示（二十六批回归）', () => {
  it('took>=0 显示 · Nms；null/-1 不显示', async () => {
    await mountTbl({ hits: HITS, total: 3, index: 'i', storageKey: 'kt', took: 42 });
    expect(host.querySelector('.rt-info')?.textContent).toContain('42ms');
    host.innerHTML = '';
    await mountTbl({ hits: HITS, total: 3, index: 'i', storageKey: 'kt2', took: null });
    expect(host.querySelector('.rt-info')?.textContent).not.toContain('ms');
  });
});

describe('ResultTable 转置偏好记忆（四十批）', () => {
  it('勾选转置写 es_tbl_transpose:<dim>，重挂载恢复', async () => {
    /* 转置仅单文档命中可用（多行时 disabled 是设计约束） */
    await mountTbl({ hits: [{ _id: 'solo', _source: { f1: 'v1', f2: 'v2' } }], total: 1, index: 'idx-1', storageKey: 'kt' });
    const chk = [...host.querySelectorAll('.rt-transpose input[type=checkbox]')][0] as HTMLInputElement;
    chk.click();
    await nextTick();
    expect(localStorage.getItem('es_tbl_transpose:kt')).toBe('1');
    host.innerHTML = '';
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    /* 重挂载（单文档命中场景）恢复勾选 */
    await mountTbl({ hits: [{ _id: 'solo', _source: { f1: 'v1', f2: 'v2' } }], total: 1, index: 'idx-1', storageKey: 'kt' });
    const chk2 = [...host.querySelectorAll('.rt-transpose input[type=checkbox]')][0] as HTMLInputElement;
    expect(chk2.checked).toBe(true);
  });

  it('维度切换重读：kt2 无记录 → 转置回落关闭', async () => {
    localStorage.setItem('es_tbl_transpose:kt', '1');
    await mountTbl({ hits: [{ _id: 'solo', _source: { f1: 'v1' } }], total: 1, index: 'idx-1', storageKey: 'kt2' });
    const chk = [...host.querySelectorAll('.rt-transpose input[type=checkbox]')][0] as HTMLInputElement;
    expect(chk.checked).toBe(false);
  });
});

/* ═══ 七十七批：导出行序跟随表格排序（所见即所得） ═══ */
describe('ResultTable 导出行序（七十七批）', () => {
  it('排序后导出 JSON 行序与表格所见一致；无排序导原始序；勾选只导选中', async () => {
    /* 一百五十四批：导出改「⬇ 一键直出默认格式」——预置默认格式 JSON（usePref 初始化读 LS） */
    localStorage.setItem('esquerystudio.pref.rt.export.fmt', '"json"');
    await mountTbl({ hits: HITS, total: 3, index: 'idx-1', storageKey: 'k1' });
    const exportJsonBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('导出'))!;
    /* 无排序：原始序 banana,apple,cherry */
    exportJsonBtn.click();
    await nextTick();
    let data = JSON.parse(downloadCalls[downloadCalls.length - 1].content);
    expect(data.map((d: any) => d.name)).toEqual(['banana', 'apple', 'cherry']);
    /* 点 name 列头排序 asc：导出序 = 所见序 apple,banana,cherry */
    const nameTh = [...host.querySelectorAll('th')].find(th => th.textContent?.includes('name'))!;
    nameTh.click();
    await nextTick();
    exportJsonBtn.click();
    await nextTick();
    data = JSON.parse(downloadCalls[downloadCalls.length - 1].content);
    expect(data.map((d: any) => d.name)).toEqual(['apple', 'banana', 'cherry']);
    /* 有勾选只导选中（且按所见序），文件名带 selected 后缀 */
    const chks = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    chks[2].click(); // cherry
    await nextTick();
    exportJsonBtn.click();
    await nextTick();
    data = JSON.parse(downloadCalls[downloadCalls.length - 1].content);
    expect(data.map((d: any) => d.name)).toEqual(['cherry']);
    expect(downloadCalls[downloadCalls.length - 1].name, '255 批：文件名带可读时间戳').toMatch(/^idx-1-selected-\d{8}-\d{6}\.json$/);
  });
});
