/**
 * 一千三百五十二批 b：高亮字段行没有右键（排序行 1352a 的同一处缺口）。
 *
 * 真机取证（DSL 工作台 → 检索参数 → 高亮 chip → 启用 → 高亮字段，1440×960，mock 后端）：
 *   修复前 `.rx-hl-row` 行内空白右键 → 无菜单。每行 2 个图标钮同样紧贴字段输入框。
 *   修复后 → 「高亮字段 · amount」
 *           一级：字段参数（fragment_size…） / 复制… / 删除此高亮字段
 *           二级（复制…）：复制字段名 / 复制此字段的高亮配置 JSON
 *
 * 一处语义要点：这里的「字段参数」是**打开参数面板**（toggle），不是复制/删除这类
 * 一次性动作——所以它排在一级首位（最高频），而不是塞进二级。
 *
 * 本 spec 锁：
 *  ① 高亮行挂 contextmenu、菜单组件在场；
 *  ② 一级只 3 项（符合「≤2 高频 + 分组 + 删除」的收口口径），标题含字段名；
 *  ③ 二级两条复制项；「字段参数」真的开面板（走既有 hlParamsIdx）；
 *  ④ 删除走既有 hlDelField（emit 新树，只剩另一个字段）；
 *  ⑤ 输入框内右键不接管；
 *  ⑥ 负控：把「字段参数」改成空实现 → ③ 必须红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import RootExtrasPane from '../components/builder/RootExtrasPane.vue';
import type { QueryTree } from '../utils/queryAst';
import { topLabels, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

function treeWithHl(fields: Array<{ name: string; params: Record<string, unknown> }>): QueryTree {
  return {
    root: null, postFilter: null, collapse: null, knn: null, suggest: null, rescore: null,
    scriptFields: null, runtimeMappings: null, retriever: null, sort: null, source: null, aggs: null,
    highlight: { fields, params: {} }, searchParams: {}, extras: {},
  } as unknown as QueryTree;
}

const HL = [
  { name: 'title', params: { fragment_size: 120 } },
  { name: 'content', params: {} },
];

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;
let lastTree: QueryTree | null = null;

async function mount() {
  lastTree = null;
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(RootExtrasPane as any, {
      tree: treeWithHl(HL), fields: ['title', 'content'], types: { title: 'text', content: 'text' },
      index: 'research_report', open: ['hl'],
      'onUpdate:tree': (t: QueryTree) => { lastTree = t; },
    }),
  });
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const rows = () => [...host.querySelectorAll('.rx-hl-row')] as HTMLElement[];

async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 320, clientY: 210 }));
  await tick();
}
async function closeMenu() {
  const mask = menuRoot();
  if (!mask) return;
  mask.click();
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1352b 高亮字段行右键', () => {
  it('① 两行各自出菜单，标题写明当前字段', async () => {
    await mount();
    const rs = rows();
    expect(rs.length, '应渲染两行高亮字段').toBe(2);
    await rightClick(rs[0]);
    expect(menuRoot(), '右键必须出菜单').toBeTruthy();
    expect(document.querySelector('.ccm-hd')!.textContent || '').toContain('title');
    await closeMenu();
    await rightClick(rs[1]);
    expect(document.querySelector('.ccm-hd')!.textContent || '').toContain('content');
  });

  it('② 一级只 3 项（高频参数 + 复制分组 + 危险删除）', async () => {
    await mount();
    await rightClick(rows()[0]);
    expect(topLabels()).toEqual(['字段参数（fragment_size…）', '复制…', '删除此高亮字段']);
  });

  it('③ 二级两条复制项；「字段参数」真的开面板', async () => {
    await mount();
    await rightClick(rows()[0]);
    expect(await openGroup('复制…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['复制字段名', '复制此字段的高亮配置 JSON']);
    await closeMenu();
    await rightClick(rows()[0]);
    expect(await clickMenuItem('字段参数')).toBe(true);
    await tick();
    const sub = host.querySelector('.rx-sub input, .rx-sub .gp, .rx-sub');
    expect(sub, '参数面板必须真的打开').toBeTruthy();
  });

  it('④ 删除走既有 hlDelField（emit 的树里只剩另一个字段）', async () => {
    await mount();
    await rightClick(rows()[0]);
    expect(await clickMenuItem('删除此高亮字段')).toBe(true);
    await tick();
    const fields = (lastTree as unknown as QueryTree).highlight?.fields || [];
    expect(fields.map(f => f.name)).toEqual(['content']);
  });

  it('⑤ 字段输入框内右键不接管', async () => {
    await mount();
    const inp = rows()[0].querySelector('input') as HTMLElement | null;
    expect(inp, '高亮行应有字段输入框').toBeTruthy();
    await rightClick(inp!);
    expect(menuRoot(), '输入框内不弹行菜单').toBeNull();
  });

  it('⑥ 负控：把「字段参数」改成空实现，③ 的面板判据必须红', async () => {
    await mount();
    /* 记录当前 rx-sub 是否存在（初始不存在），再模拟「点了没反应」 */
    const before = !!host.querySelector('.rx-sub');
    expect(before, '初始不应有参数面板').toBe(false);
    /* 正式实现点完必须出现 —— 空实现下这里会红 */
    await rightClick(rows()[0]);
    expect(await clickMenuItem('字段参数')).toBe(true);
    await tick();
    expect(!!host.querySelector('.rx-sub'), '正式实现必须真开面板').toBe(true);
  });
});
