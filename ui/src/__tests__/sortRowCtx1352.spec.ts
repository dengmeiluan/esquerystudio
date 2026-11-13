/**
 * 一千三百五十二批：周边子句区（检索参数）的排序行没有右键。
 *
 * 真机取证（DSL 工作台 → 检索参数 → 排序 chip → 加排序，1440×960，mock 后端）：
 *   修复前：`.rx-sort-row` 行内空白处右键 → 无菜单。
 *   每行平铺 4 个 22px 图标钮（参数 / 上移 / 下移 / 删除）——正是用户反复说的
 *   「一排小图标逐个点准」在检索参数区的翻版。
 *   修复后 → 「排序 · publish_date · desc」
 *           一级：改为升序 asc / 位置与复制… / 删除此排序项
 *           二级（位置与复制…）：上移一位 / 下移一位 / 复制排序项 JSON
 *
 * 注意方向文案：当前 desc 时一级必须写「改为升序 asc」（动作=结果），
 * 而不是「降序」——这类 toggle 最容易在文案上骗人。
 *
 * 本 spec 锁：
 *  ① 排序行挂 contextmenu、菜单组件在场；
 *  ② 一级符合约定，且方向文案随当前 order 翻转；
 *  ③ 一级动作真的改到树上（走既有 patchSort，不是本地副本）；
 *  ④ 二级的上下移按位置出现（首位无上移、末位无下移）；
 *  ⑤ 输入框/下拉内右键不接管；
 *  ⑥ 负控：把方向文案写死成「改为升序」→ ② 必须红。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import RootExtrasPane from '../components/builder/RootExtrasPane.vue';
import type { QueryTree, SortItem } from '../utils/queryAst';
import { topLabels, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

const S1: SortItem = { id: 's1', field: 'publish_date', form: 'short', params: { order: 'desc' } };
const S2: SortItem = { id: 's2', field: 'score', form: 'short', params: { order: 'asc' } };

function treeWith(sort: SortItem[]): QueryTree {
  return {
    root: null, postFilter: null, collapse: null, knn: null, suggest: null, rescore: null,
    scriptFields: null, runtimeMappings: null, retriever: null, sort, source: null, aggs: null,
    highlight: null, searchParams: {}, extras: {},
  } as unknown as QueryTree;
}

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;
let lastTree: QueryTree | null = null;

async function mount(sort: SortItem[]) {
  lastTree = null;
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(RootExtrasPane as any, {
      tree: treeWith(sort), fields: ['publish_date', 'score'], types: { publish_date: 'date', score: 'double' },
      index: 'research_report', open: ['sort'],
      'onUpdate:tree': (t: QueryTree) => { lastTree = t; },
    }),
  });
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const rows = () => [...host.querySelectorAll('.rx-sort-row')] as HTMLElement[];

async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
  await tick();
}
/* 关菜单必须走组件自己的关闭路径（点遮罩 → emit('close')）。
   直接从 DOM 里 remove 节点会留下 sortMenu 状态：组件仍以为菜单开着，下一次右键不再渲染。 */
async function closeMenu() {
  const mask = menuRoot();
  if (!mask) return;
  mask.click();
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1352 排序行右键', () => {
  it('① 两行都挂右键，各自出菜单且标题写明字段与方向', async () => {
    await mount([S1, S2]);
    const rs = rows();
    expect(rs.length, '应渲染两行排序').toBe(2);
    await rightClick(rs[0]);
    expect(menuRoot(), '第一行右键必须出菜单').toBeTruthy();
    expect(document.querySelector('.ccm-hd')!.textContent || '').toContain('publish_date');
    expect(document.querySelector('.ccm-hd')!.textContent || '').toContain('desc');
    await closeMenu();
    expect(menuRoot(), '关菜单后必须真的消失').toBeNull();
    await rightClick(rs[1]);
    expect(document.querySelector('.ccm-hd')!.textContent || '').toContain('score');
    expect(document.querySelector('.ccm-hd')!.textContent || '').toContain('asc');
  });

  it('② 一级符合约定；方向文案是「动作=结果」（desc → 改为升序）', async () => {
    await mount([S1, S2]);
    await rightClick(rows()[0]);
    expect(topLabels()).toEqual(['改为升序 asc', '位置与复制…', '删除此排序项']);
  });

  it('② 反方向同理（asc → 改为降序）', async () => {
    await mount([S1, S2]);
    await rightClick(rows()[1]);
    expect(topLabels()[0]).toBe('改为降序 desc');
  });

  it('③ 点一级方向项真的改到树上（走既有 patchSort）', async () => {
    await mount([S1, S2]);
    await rightClick(rows()[0]);
    expect(await clickMenuItem('改为升序 asc')).toBe(true);
    await tick();
    expect(lastTree, '必须向上 emit 新树').toBeTruthy();
    const out = (lastTree as unknown as QueryTree).sort || [];
    expect(out.find(s => s.id === 's1')!.params.order).toBe('asc');
    expect(out.find(s => s.id === 's2')!.params.order, '未点的那行不动').toBe('asc');
  });

  it('④ 二级上下移按位置出现：首位无上移、末位无下移', async () => {
    await mount([S1, S2]);
    await rightClick(rows()[0]);
    expect(await openGroup('位置与复制')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['下移一位', '复制排序项 JSON']);
    await closeMenu();
    await rightClick(rows()[1]);
    expect(await openGroup('位置与复制')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['上移一位（排序优先级）', '复制排序项 JSON']);
  });

  it('④ 下移真的换位（顺序即排序优先级）', async () => {
    await mount([S1, S2]);
    await rightClick(rows()[0]);
    expect(await openGroup('位置与复制')).toBe(true);
    expect(await clickMenuItem('下移一位')).toBe(true);
    await tick();
    expect(((lastTree as unknown as QueryTree).sort || []).map(s => s.id)).toEqual(['s2', 's1']);
  });

  it('删除走既有 delSort（emit 的树里少一项）', async () => {
    await mount([S1, S2]);
    await rightClick(rows()[0]);
    expect(await clickMenuItem('删除此排序项')).toBe(true);
    await tick();
    expect(((lastTree as unknown as QueryTree).sort || []).map(s => s.id)).toEqual(['s2']);
  });

  it('⑤ 输入框/下拉内右键不接管（字段名、order 下拉的原生行为）', async () => {
    await mount([S1, S2]);
    const inp = rows()[0].querySelector('input') as HTMLElement | null;
    expect(inp, '排序行应有字段输入框').toBeTruthy();
    await rightClick(inp!);
    expect(menuRoot(), '输入框内不弹行菜单').toBeNull();
    const sel = rows()[0].querySelector('select') as HTMLElement | null;
    expect(sel, '排序行应有 order 下拉').toBeTruthy();
    await rightClick(sel!);
    expect(menuRoot(), '下拉内不弹行菜单').toBeNull();
  });

  it('⑥ 负控：方向文案写死「改为升序」时，desc 行的判据必须红', async () => {
    await mount([S1, S2]);
    await rightClick(rows()[0]);
    /* 等价于把文案硬编码的写法：desc 行仍显示「改为升序」 */
    const hardcoded = ['改为升序 asc', '位置与复制…', '删除此排序项'];
    expect(topLabels(), '正式实现必须与硬编码一致（desc→升序）').toEqual(hardcoded);
    /* 而 asc 行若也用硬编码，就会与正式实现分叉——证明判据能区分 */
    await closeMenu();
    await rightClick(rows()[1]);
    expect(topLabels()[0], 'asc 行必须翻转，不能沿用硬编码').not.toBe(hardcoded[0]);
  });
});
