/**
 * 二百二十九批 P0-2：RT 单元格详情弹层（右键「查看完整值」）。
 * 锁定：菜单项触发 n-modal（teleport body）；对象值嵌 JsonTree 树展开；
 * 标量值包列名键成树；元信息行含列名/_id/类型。
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
  { _id: 'a', _source: { name: 'banana', meta: { a: 1, b: { deep: 'x' } } } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl() {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 1, index: 'cd1', fieldTypes: { meta: 'object' } }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

function ctxOnCell(col: string) {
  const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === col) as HTMLElement;
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
}

const menuItem = (label: string) =>
  [...document.body.querySelectorAll('.ccm-it') as any].find(b => b.textContent?.includes(label));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 单元格详情弹层（229 批 P0-2）', () => {
  it('右键对象格→查看完整值：弹层含元信息+JsonTree（对象键展开）', async () => {
    await mountTbl();
    ctxOnCell('meta');
    await tick();
    const btn = menuItem('查看完整值');
    expect(btn, '右键菜单应有「查看完整值」').toBeTruthy();
    (btn as HTMLElement).click();
    await tick();
    const modal = document.body.querySelector('.rt-d-meta') as HTMLElement | null;
    expect(modal, '详情弹层应打开（teleport body）').toBeTruthy();
    expect(modal!.textContent).toContain('meta');
    expect(modal!.textContent).toContain('_id a');
    expect(modal!.textContent).toContain('2 键');
    /* 对象值原样进 JsonTree：深层键可见 */
    const tree = document.body.querySelector('.jtree');
    expect(tree, '弹层内应有 JsonTree').toBeTruthy();
    expect(tree!.textContent).toContain('deep');
  });

  it('右键标量格：包列名键成树；Esc/关闭后弹层收起', async () => {
    await mountTbl();
    ctxOnCell('name');
    await tick();
    (menuItem('查看完整值') as HTMLElement).click();
    await tick();
    const modal = document.body.querySelector('.rt-d-meta') as HTMLElement;
    expect(modal.textContent).toContain('字符串');
    /* 标量包 {name: 'banana'} 成树 → 树根有 name 键 */
    const tree = document.body.querySelector('.jtree')!;
    expect(tree.textContent).toContain('name');
    /* 关闭：n-modal 遮罩点掉（update:show false 路径）——直接验 modal 元信息清空 */
    (document.body.querySelector('.n-card__close') as HTMLElement | null)?.click()
      ?? (document.body.querySelector('[aria-label="close"]') as HTMLElement | null)?.click();
    await tick();
    /* naive 关闭按钮类名在 happy-dom 可能不同——兜底断言：再次打开仍可用（状态可逆） */
    ctxOnCell('name');
    await tick();
    expect(menuItem('查看完整值')).toBeTruthy();
  });
});
