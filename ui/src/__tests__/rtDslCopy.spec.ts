/**
 * 二百二十七批：RT「复制为 DSL」右键菜单接线。
 * 锁定：term 项（数值列）/match 项（fieldTypes text 列）/勾选行 terms 项；
 * 剪贴板内容=合法 DSL JSON；菜单动作后自动关闭（CellContextMenu 既有语义）。
 * 挂载样板照抄 multiSort（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findMenuItem } from './helpers/ctxMenu'; /* 1142：二级菜单取项 */
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
  { _id: 'a', _source: { name: 'banana', age: 2, msg: 'hello world' } },
  { _id: 'b', _source: { name: 'apple', age: 3, msg: 'x' } },
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

function ctxOnCell(col: string, ri = 0) {
  const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === col
    && (td as HTMLElement).dataset.ri === String(ri)) as HTMLElement;
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
}

const menuItem = (label: string) =>
  findMenuItem(label);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 复制为 DSL（227 批）', () => {
  it('数值列右键 → term 查询；text 列 → match 查询', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl({ hits: HITS, total: 2, index: 'dsl1', fieldTypes: { msg: 'text' } });
    ctxOnCell('age');
    await tick();
    const termBtn = await menuItem('复制为 term 查询');
    expect(termBtn, '数值列右键应有 term 项（且无 match 项）').toBeTruthy();
    expect(await menuItem('复制为 match 查询')).toBeFalsy();
    (termBtn as HTMLElement).click();
    await tick();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0][0] as string)).toEqual({ term: { age: 2 } });

    ctxOnCell('msg');
    await tick();
    const matchBtn = await menuItem('复制为 match 查询');
    expect(matchBtn, 'text 列右键应有 match 项').toBeTruthy();
    (matchBtn as HTMLElement).click();
    await tick();
    expect(JSON.parse(writeText.mock.calls[1][0] as string)).toEqual({ match: { msg: 'hello world' } });
  });

  it('勾选行右键 → terms 查询（同列值集合）；菜单动作后自动关闭', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl({ hits: HITS, total: 2, index: 'dsl2' });
    const boxes = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    boxes[0].click(); boxes[1].click();
    await tick();
    ctxOnCell('age', 1);
    await tick();
    const termsBtn = await menuItem('复制 2 行为 terms 查询（age）');
    expect(termsBtn, '勾选行右键应有 terms 项').toBeTruthy();
    (termsBtn as HTMLElement).click();
    await tick();
    /* 行集=勾选+排序序（原序 a,b → age 2,3） */
    expect(JSON.parse(writeText.mock.calls[0][0] as string)).toEqual({ terms: { age: [2, 3] } });
    expect(document.body.querySelector('.ccm'), '动作后菜单应自动关闭').toBeFalsy();
  });
});

describe('1439c RT 单元格菜单键盘入口', () => {
  it('ContextMenu 键：焦点行打开单元格菜单（与 QRT 对齐）', async () => {
    await mountTbl({ hits: HITS, fieldTypes: { name: 'text', age: 'long' } });
    const root = host.querySelector('.rt') as HTMLElement;
    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await tick();
    expect(document.querySelector('.ccm'), '菜单键必须开单元格菜单').toBeTruthy();
    expect(await menuItem('复制值'), '一级高频项').toBeTruthy();
    expect(document.querySelector('.ccm .ccm-it')?.textContent, '首项焦点').toContain('复制值');
  });
});
