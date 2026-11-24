/**
 * R130 一百五十八批：RT 拖拽框选单元格区域（dbx 选区语言）。
 * 锁定：
 * 1) mousedown→mousemove→mouseup 拖出矩形后浮动条出现，格数正确；
 * 2) 复制 TSV 含表头行+矩形内值（含表头，按可见列）；
 * 3) 纯点击（无拖动位移）不产生选区，单击复制不受影响。
 * 挂载样板照抄 resultTableMemory.spec。
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
  { _id: 'c', _source: { name: 'cherry', age: 1 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(storageKey = 'rg1') {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 3, index: 'i1', storageKey }) });
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
});

function cellAt(ri: number, ci: number): HTMLElement {
  /* 数据格从第 3 个 td 起（0=勾选、1=序号）；0-based 数据行 ri */
  return host.querySelectorAll('tbody tr')[ri].children[2 + ci] as HTMLElement;
}

async function dragRegion(r1: number, c1: number, r2: number, c2: number) {
  const a = cellAt(r1, c1), b = cellAt(r2, c2);
  a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  for (let i = 0; i < 3; i++) { await nextTick(); await Promise.resolve(); }
  b.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  for (let i = 0; i < 3; i++) { await nextTick(); await Promise.resolve(); }
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
}

describe('RT 拖拽框选（158 批）', () => {
  it('拖出矩形后浮动条出现、格数正确、选中格带 rt-region', async () => {
    await mountTbl('rg1');
    await dragRegion(0, 0, 1, 1);
    expect(host.querySelector('.rt-float')?.textContent).toContain('已框选 <b>4</b> 格'
      .replace('<b>', '').replace('</b>', ''));
    expect(host.querySelector('.rt-float')?.textContent).toContain('4');
    expect(host.querySelectorAll('td.rt-region').length).toBe(4);
  });

  it('复制 TSV：含表头行+矩形值（所见即所得）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl('rg2');
    await dragRegion(0, 0, 1, 1);
    const copyBtn = [...host.querySelectorAll('.rt-float button')].find(b => b.textContent?.includes('复制 TSV')) as HTMLButtonElement;
    copyBtn.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe('name\tage\nbanana\t2\napple\t3');
  });

  it('纯点击（mousedown+mouseup 同格）不产生选区、不触发复制（582 同步更新 563 用户裁决：单击复制退役）', async () => {
    /* 五百八十二批同步更新：563 批用户裁决「单击就复制不对」——单击自动复制退役改截断值
       展开/收起，复制保留显式路径（右键菜单/Ctrl+C/列头/hover 钮）。本用例改锁退役形态：
       纯点击零副作用（无选区浮层+剪贴板零调用）。 */
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl('rg3');
    const cell = cellAt(0, 0);
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(host.querySelector('.rt-float')).toBeNull();
    expect(writeText).not.toHaveBeenCalled(); /* 单击复制已退役：剪贴板零调用 */
  });
});
