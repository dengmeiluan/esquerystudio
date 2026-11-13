/* 991 批组件契约：①RootExtrasPane rescore 重打分区（chip/编辑/树贯通/移除/自动展开）；
   ②BoolGroupNode 行级拖拽槽（dragging 期渲染、槽 drop 带 anchorId 插到该行之后、分区级兜底）。 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { createPinia } from 'pinia';

const mappingDetailFn = vi.fn();
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
    },
  };
});

import RootExtrasPane from '../builder/RootExtrasPane.vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import { __clearFieldCache } from '../../composables/useIndexFields';
import { emptyTree, parseTree, serializeTree, type QueryTree } from '../../utils/queryAst';
import { DRAG_KEY, DRAG_EVENT } from '../builder/treeBus';

const tick = () => new Promise(r => setTimeout(r));
const apps: App[] = [];

function mountPane(tree: QueryTree) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(tree);
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value, fields: ['title', 'status'], types: { title: 'text', status: 'keyword' },
      index: '', 'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
    }),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { host, cur };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any)[DRAG_KEY];
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: { title: { type: 'text' } } } });
});
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

describe('991 RootExtrasPane rescore 重打分区', () => {
  it('加重打分：默认 match_phrase + window_size 10；序列化完整', async () => {
    const { host, cur } = mountPane(emptyTree());
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('rescore'));
    expect(chip, 'rescore chip 必须在场').toBeTruthy();
    chip!.click();
    await tick();
    (host.querySelector('.rx-rc-add') as HTMLElement).click();
    await tick();
    expect(cur.value.rescore?.windowSize).toBe(10);
    expect(cur.value.rescore?.rescoreQuery?.type).toBe('leaf');
    expect(serializeTree(cur.value).rescore).toEqual({
      window_size: 10,
      query: { rescore_query: { match_phrase: { title: '' } } },
    });
  });

  it('window_size 编辑：数字写回、清空退役键', async () => {
    const t = parseTree({ rescore: { window_size: 10, query: { rescore_query: { term: { a: 1 } } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    const ws = host.querySelector<HTMLInputElement>('#rc-ws');
    expect(ws?.value).toBe('10');
    ws!.value = '25';
    ws!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.rescore!.windowSize).toBe(25);
    ws!.value = '';
    ws!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.rescore!.hasWindowSize).toBe(false);
    expect(serializeTree(cur.value)).toEqual({ rescore: { query: { rescore_query: { term: { a: 1 } } } } });
  });

  it('重打分查询树编辑贯通（MiniTreeEditor 条件行改值写回）', async () => {
    const t = parseTree({ rescore: { query: { rescore_query: { term: { status: 'active' } } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    const inp = host.querySelector('.rx-open .cn-val') as HTMLInputElement;
    expect(inp, 'rescoreQuery 直渲染条件行').toBeTruthy();
    inp.value = 'inactive';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value).rescore).toEqual({ query: { rescore_query: { term: { status: 'inactive' } } } });
  });

  it('解析形态自动展开；移除键后消失', async () => {
    const t = parseTree({ rescore: { query: { rescore_query: { match_all: {} } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    const del = host.querySelector('[title="移除 rescore 键"]') as HTMLElement;
    expect(del, '有内容默认展开').not.toBeNull();
    del.click();
    await tick();
    expect(cur.value.rescore).toBeNull();
    expect(serializeTree(cur.value)).toEqual({});
  });
});

describe('991 行级拖拽槽', () => {
  it('dragging 期槽渲染；槽 drop 带 anchorId 插到该行之后；dragend 槽退场', async () => {
    const t = parseTree({ query: { bool: { must: [{ term: { a: 1 } }, { term: { b: 2 } }], should: [{ term: { c: 3 } }] } } });
    if (!t.ok) throw new Error('parse failed');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(t.tree);
    const app = createApp({
      render: () => h(QueryTreePane, { tree: cur.value, fields: ['a', 'b', 'c'], types: {}, 'onUpdate:tree': (x: QueryTree) => { cur.value = x; } }),
    });
    apps.push(app);
    app.mount(host);
    await tick();
    expect(host.querySelector('.bgn-slot'), '非拖拽期槽不渲染').toBeNull();
    /* 广播拖拽开始 → 槽亮出 */
    window.dispatchEvent(new CustomEvent(DRAG_EVENT, { detail: { on: true } }));
    await tick();
    const mustSlots = host.querySelectorAll('.bgn-part.o-must .bgn-slot');
    expect(mustSlots.length, 'must 分区两行各一槽').toBe(2);
    /* 拖 should 的 c 到 must 第二行（b）后的槽 → 插到 b 之后 */
    const root = cur.value.root as { children: Array<{ occur: string; node: { id: string; field?: string } }> };
    const dragC = root.children.find(c => c.occur === 'should')!.node;
    (window as any)[DRAG_KEY] = dragC.id;
    (mustSlots[0] as HTMLElement).dispatchEvent(new Event('drop', { bubbles: true }));
    await tick();
    const ser = serializeTree(cur.value) as { query: { bool: { must: Array<Record<string, unknown>> } } };
    expect(ser.query.bool.must.map(x => JSON.stringify(x))).toEqual([JSON.stringify({ term: { a: 1 } }), JSON.stringify({ term: { c: 3 } }), JSON.stringify({ term: { b: 2 } })]);
    /* 拖拽结束广播 → 槽退场 */
    window.dispatchEvent(new CustomEvent(DRAG_EVENT, { detail: { on: false } }));
    await tick();
    expect(host.querySelector('.bgn-slot')).toBeNull();
  });
});
