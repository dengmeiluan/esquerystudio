/**
 * W7·P0：RT 行内展开详情（三入口：操作列展开钮 / 单元格菜单「展开此行」/ 快捷键 E）。
 * 锁定：展开行 .rt-expand 内嵌 JsonTree（_id+_source 全量）；free 多行展开；
 * Esc=全部收起（裁决：全收）；Enter 语义保持既有「打开文档弹窗」不变（任务裁决记录）。
 * 挂载样板照抄 rtDslCopy（裸 createApp + pinia + api mock）。
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
  { _id: 'a', _source: { name: 'banana', meta: { deep: { x: 1 } } } },
  { _id: 'b', _source: { name: 'apple' } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 2, index: 're1', ...props }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const keyOn = (sel: string, key: string, mods: KeyboardEventInit = {}) => {
  (host.querySelector(sel) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
};
const expandRows = () => [...host.querySelectorAll('tbody tr.rt-expand')];
/* 1142：动作项住分组二级——helper 内部按需展开 */
import { findMenuItem } from './helpers/ctxMenu';
const menuItem = (label: string) => findMenuItem(label);
function ctxOnCell(col: string, ri = 0) {
  const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === col
    && (td as HTMLElement).dataset.ri === String(ri)) as HTMLElement;
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 行内展开详情（W7）', () => {
  it('操作列展开钮：展开行含 JsonTree（_id+_source 深键可见）；free 多行；钮再点收起', async () => {
    await mountTbl();
    expect(expandRows().length).toBe(0);
    const btns = [...host.querySelectorAll('.rt-row-expand')] as HTMLElement[];
    expect(btns.length).toBe(2);
    btns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(1);
    const tree = expandRows()[0].querySelector('.jtree');
    expect(tree, '展开行应内嵌 JsonTree').toBeTruthy();
    expect(tree!.textContent).toContain('banana');
    expect(tree!.textContent, '嵌套 _source 键应可见（树已展开首层）').toContain('deep');
    /* free 多行 */
    btns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(2);
    /* 再点收起 */
    btns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(1);
  });

  it('单元格菜单「展开此行」；展开后同格右键变「收起此行」', async () => {
    await mountTbl();
    ctxOnCell('name', 1);
    await tick();
    const item = await menuItem('展开此行');
    expect(item, '单元格菜单应有「展开此行」').toBeTruthy();
    item!.click();
    await tick();
    expect(expandRows().length).toBe(1);
    /* 再右键同格：label 翻转为收起 */
    ctxOnCell('name', 1);
    await tick();
    expect(await menuItem('收起此行')).toBeTruthy();
  });

  it('快捷键 E：焦点行展开/收起；Enter 保持既有打开文档弹窗不变', async () => {
    const docOpens: SearchHit[] = [];
    await mountTbl({ onOpenDoc: (hit: SearchHit) => docOpens.push(hit) });
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    keyOn('.rt', 'ArrowDown');
    await tick();
    keyOn('.rt', 'e');
    await tick();
    expect(expandRows().length, 'E 应展开焦点行').toBe(1);
    expect(expandRows()[0].textContent).toContain('banana');
    /* Enter 保持既有语义：开文档弹窗（不收起/不展开） */
    keyOn('.rt', 'Enter');
    await tick();
    expect(docOpens.length).toBe(1);
    expect(docOpens[0]._id).toBe('a');
    expect(expandRows().length).toBe(1);
    /* 再按 E 收起 */
    keyOn('.rt', 'e');
    await tick();
    expect(expandRows().length).toBe(0);
  });

  it('Esc 全部收起（裁决：全收）；无展开时 Esc 仍清勾选/框选', async () => {
    await mountTbl();
    const btns = [...host.querySelectorAll('.rt-row-expand')] as HTMLElement[];
    btns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    btns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(expandRows().length).toBe(2);
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    keyOn('.rt', 'Escape');
    await tick();
    expect(expandRows().length, 'Esc 应一次全收').toBe(0);
    /* 无展开时 Esc 落回既有清勾选语义 */
    const boxes = [...host.querySelectorAll('tbody input[type=checkbox]')] as HTMLInputElement[];
    boxes[0].click();
    await tick();
    keyOn('.rt', 'Escape');
    await tick();
    expect(boxes[0].checked).toBe(false);
  });
});
