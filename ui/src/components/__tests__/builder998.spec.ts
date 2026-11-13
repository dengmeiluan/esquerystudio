/* 998 批组件契约：
   ① RootExtrasPane「查询参数」分区（schema 驱动、JSON 非法不写树、增删、序列化）；
   ② ClauseNode 算子胶囊语义族（opf-* class 随 op 变化，原生 select 语义不变）；
   ③ QueryTreePane 语句摘要条（渲染、片段点击定位到条件行并打脉冲）。 */
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
import ClauseNode from '../builder/ClauseNode.vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import WrapNodeRow from '../builder/WrapNodeRow.vue';
import { __clearFieldCache } from '../../composables/useIndexFields';
import { emptyTree, parseTree, serializeTree, type LeafNode, type QueryTree, type WrapNode } from '../../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r));
const apps: App[] = [];

function mount<T>(comp: any, props: Record<string, unknown>, onUpdate?: (v: any) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(comp, { ...props, ...(onUpdate ? { 'onUpdate:tree': onUpdate, 'onUpdate:node': onUpdate } : {}) }),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: { status: { type: 'keyword' } } } });
});
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

describe('998 RootExtrasPane 查询参数分区', () => {
  function mountPane(tree: QueryTree) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(tree);
    const app = createApp({
      render: () => h(RootExtrasPane, {
        tree: cur.value, fields: ['status'], types: { status: 'keyword' }, index: '',
        'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
      }),
    });
    apps.push(app);
    app.use(createPinia());
    app.mount(host);
    return { host, cur };
  }

  it('解析形态自动展开、chip 计数、行数与键一致', async () => {
    const r = parseTree({ query: { match_all: {} }, min_score: 0.5, search_after: [1, 'a'], track_total_hits: true });
    if (!r.ok) throw new Error(r.reason);
    const { host } = mountPane(r.tree);
    await tick();
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('查询参数'));
    expect(chip, '查询参数 chip 必须在场').toBeTruthy();
    expect(chip!.textContent).toContain('3 项');
    const rows = host.querySelectorAll('.rx-qp-row');
    expect(rows.length).toBe(3);
    expect(host.textContent).toContain('游标翻页');
    expect(host.textContent).toContain('最低评分');
    /* 这些键不再出现在「其他顶层键」里 */
    expect(Object.keys(r.tree.extras)).toEqual([]);
  });

  it('数字参数改值写回（容错：非法数字原样存字符串交给 ES）', async () => {
    const r = parseTree({ query: { match_all: {} }, min_score: 0.5 });
    if (!r.ok) throw new Error(r.reason);
    const { host, cur } = mountPane(r.tree);
    await tick();
    const inp = host.querySelector('.rx-qp-row input') as HTMLInputElement;
    inp.value = '3';
    inp.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.searchParams.min_score).toBe(3);
    expect(serializeTree(cur.value).min_score).toBe(3);
  });

  it('布尔参数 true/false 切换', async () => {
    const r = parseTree({ query: { match_all: {} }, explain: true });
    if (!r.ok) throw new Error(r.reason);
    const { host, cur } = mountPane(r.tree);
    await tick();
    const sel = host.querySelector('.rx-qp-row select') as HTMLSelectElement;
    sel.value = 'false';
    sel.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.searchParams.explain).toBe(false);
    expect(serializeTree(cur.value).explain).toBe(false);
  });

  it('JSON 参数：非法不写树、合法写入', async () => {
    const r = parseTree({ query: { match_all: {} }, search_after: [1, 'a'] });
    if (!r.ok) throw new Error(r.reason);
    const { host, cur } = mountPane(r.tree);
    await tick();
    const inp = host.querySelector('.rx-qp-json') as HTMLInputElement;
    inp.value = '[1, "a"';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.searchParams.search_after, '半截 JSON 不得写树').toEqual([1, 'a']);
    expect(inp.classList.contains('bad'), '非法态标红').toBe(true);
    inp.value = '[9, "z"]';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.searchParams.search_after).toEqual([9, 'z']);
    expect(inp.classList.contains('bad')).toBe(false);
  });

  it('添加参数菜单给出语义初值；移除后键消失', async () => {
    const { host, cur } = mountPane(emptyTree());
    await tick();
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('查询参数'));
    chip!.click();
    await tick();
    (host.querySelector('.rx-qp-add') as HTMLElement).click();
    await tick();
    const menus = [...host.querySelectorAll<HTMLButtonElement>('.rx-qp-mi')];
    const pit = menus.find(b => b.textContent?.includes('pit'))!;
    expect(pit).toBeTruthy();
    pit.click();
    await tick();
    expect(cur.value.searchParams.pit).toEqual({});
    expect(serializeTree(cur.value)).toEqual({ pit: {} });
    (host.querySelector('.rx-qp-row button.danger') as HTMLElement).click();
    await tick();
    expect('pit' in cur.value.searchParams).toBe(false);
    expect(serializeTree(cur.value)).toEqual({});
  });
});

describe('998 多向量 / 多段重打分（数组形态）', () => {
  function mountPane(tree: QueryTree) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(tree);
    const app = createApp({
      render: () => h(RootExtrasPane, {
        tree: cur.value, fields: ['vec'], types: { vec: 'dense_vector' }, index: '',
        'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
      }),
    });
    apps.push(app);
    app.use(createPinia());
    app.mount(host);
    return { host, cur };
  }

  it('knn 数组形态：解析自动展开 → 加一路 → 数组写出 → 删到只剩一路收回对象', async () => {
    const r = parseTree({ knn: [{ field: 'vec', query_vector: [1, 2], k: 10 }, { field: 'vec', query_vector: [3, 4], k: 5 }] });
    if (!r.ok) throw new Error(r.reason);
    const { host, cur } = mountPane(r.tree);
    await tick();
    expect(host.querySelectorAll('.rx-knn-x').length, '第二条向量行').toBe(1);
    expect(host.querySelector('.rx-knn-tag')?.textContent).toContain('knn: [ ]');
    (host.querySelector('.rx-knn-add2') as HTMLElement).click();
    await tick();
    expect((cur.value.knnExtra || []).length).toBe(2);
    const ser = serializeTree(cur.value).knn as unknown[];
    expect(Array.isArray(ser)).toBe(true);
    expect(ser.length).toBe(3);
    (host.querySelector('.rx-knn-x button.danger') as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-knn-x button.danger') as HTMLElement).click();
    await tick();
    expect(cur.value.knnArray).toBe(false);
    expect(Array.isArray(serializeTree(cur.value).knn), '只剩一路 → 收回对象形态').toBe(false);
  });

  it('移除 knn 键时数组形态额外项一并清掉（不留鬼键）', async () => {
    const r = parseTree({ knn: [{ field: 'vec', query_vector: [1], k: 3 }, { field: 'vec', query_vector: [2], k: 4 }] });
    if (!r.ok) throw new Error(r.reason);
    const { host, cur } = mountPane(r.tree);
    await tick();
    (host.querySelector('[title="移除 knn 键"]') as HTMLElement).click();
    await tick();
    expect(cur.value.knn).toBeNull();
    expect(cur.value.knnExtra).toEqual([]);
    expect('knn' in serializeTree(cur.value), 'knn 键必须真的消失').toBe(false);
  });

  it('rescore 数组形态：两段渲染 + 删段收回对象', async () => {
    const r = parseTree({
      rescore: [
        { window_size: 50, query: { rescore_query: { match_all: {} } } },
        { window_size: 10, query: { rescore_query: { term: { a: 1 } } } },
      ],
    });
    if (!r.ok) throw new Error(r.reason);
    const { host, cur } = mountPane(r.tree);
    await tick();
    expect(host.querySelectorAll('.rx-rc-x').length).toBe(1);
    (host.querySelector('.rx-rc-x button.danger') as HTMLElement).click();
    await tick();
    expect(cur.value.rescoreArray).toBe(false);
    expect(Array.isArray(serializeTree(cur.value).rescore)).toBe(false);
  });
});

describe('998 ClauseNode 算子语义族胶囊', () => {
  const leaf = (op: string, field = 'status'): LeafNode =>
    ({ id: 'l1', type: 'leaf', op, field, value: 'x', params: {}, raw: null });

  function mountClause(n: LeafNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(n);
    const app = createApp({
      render: () => h(ClauseNode, {
        node: cur.value, fields: ['status', 'loc'], types: { status: 'keyword', loc: 'geo_point' },
        'onUpdate:node': (x: LeafNode) => { cur.value = x; },
      }),
    });
    apps.push(app);
    app.use(createPinia());
    app.mount(host);
    return { host, cur };
  }

  it('term→opf-exact、match→opf-text、range→opf-range、geo_distance→opf-geo', async () => {
    const cases: Array<[string, string]> = [['term', 'opf-exact'], ['match', 'opf-text'], ['range', 'opf-range'], ['geo_distance', 'opf-geo'], ['knn', 'opf-vector']];
    for (const [op, cls] of cases) {
      const { host } = mountClause(leaf(op));
      await tick();
      const sel = host.querySelector('.cn-op') as HTMLSelectElement;
      expect(sel, op).toBeTruthy();
      expect(sel.classList.contains(cls), op + ' → ' + cls).toBe(true);
      expect(sel.dataset.op).toBe(op);
      apps.pop()!.unmount();
      host.remove();
    }
  });

  it('改用 geo 算子后胶囊变色（原生 select 仍在，值仍可 setValue）', async () => {
    const { host, cur } = mountClause(leaf('term'));
    await tick();
    const sel = host.querySelector('.cn-op') as HTMLSelectElement;
    sel.value = 'geo_distance';
    sel.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.op).toBe('geo_distance');
    expect((host.querySelector('.cn-op') as HTMLSelectElement).classList.contains('opf-geo')).toBe(true);
  });
});

describe('998 QueryTreePane 语句摘要条', () => {
  const locateIds: string[] = [];
  const pane = ref<{ highlightFromDsl: (id: string) => void } | null>(null);
  function mountPane(src: unknown) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = parseTree(src);
    if (!r.ok) throw new Error(r.reason);
    const tree = ref(r.tree);
    const app = createApp({
      render: () => h(QueryTreePane, {
        ref: pane,
        tree: tree.value, fields: ['status', 'price'], types: { status: 'keyword', price: 'long' },
        'onUpdate:tree': (t: QueryTree) => { tree.value = t; },
        onLocateDsl: (id: string) => { locateIds.push(id); },
      }),
    });
    apps.push(app);
    app.use(createPinia());
    app.mount(host);
    return { host, tree };
  }

  it('渲染人话语句（且/或/非），点片段给对应行打定位脉冲', async () => {
    const { host } = mountPane({
      query: {
        bool: {
          must: [{ term: { status: 'active' } }],
          should: [{ range: { price: { gte: 10 } } }, { exists: { field: 'price' } }],
          must_not: [{ term: { status: 'deleted' } }],
        },
      },
    });
    await tick();
    const bar = host.querySelector('.qsb');
    expect(bar, '语句条必须在场').not.toBeNull();
    const text = bar!.textContent || '';
    expect(text).toContain('status = 「active」');
    expect(text).toContain('或');
    expect(text).toContain('非');
    /* 点第一个可定位片段 → 对应条件行拿到 qtp-flash */
    const frag = bar!.querySelector<HTMLElement>('.qsb-p.clk')!;
    frag.click();
    await tick();
    await tick();
    expect(host.querySelector('.qtp-flash'), '点击片段后目标行应有定位脉冲').not.toBeNull();
    /* 1007：同一动作同步上抛 locateDsl（视图层联动右侧 DSL 编辑器定位） */
    expect(locateIds.length, '片段点击上抛 locateDsl').toBeGreaterThanOrEqual(1);
    expect(locateIds[0]).toBeTruthy();
  });

  it('纯 match_all 空态不渲染语句条（避免与空态插画重复）', async () => {
    const { host } = mountPane({ query: { match_all: {} } });
    await tick();
    expect(host.querySelector('.qsb')).toBeNull();
  });

  it('1008 反向联动：highlightFromDsl 行脉冲在场且不回弹 locateDsl（无反馈环）', async () => {
    const { host } = mountPane({
      query: { bool: { must: [{ term: { status: 'active' } }, { term: { status: 'draft' } }] } },
    });
    await tick();
    const before = locateIds.length;
    const row = host.querySelector<HTMLElement>('.cn');
    const nid = row!.dataset.nid!;
    pane.value!.highlightFromDsl(nid);
    await tick();
    await tick();
    expect(host.querySelector('.qtp-flash'), '反向联动行脉冲在场').not.toBeNull();
    expect(locateIds.length, '反向入口不 emit locateDsl（防反馈环）').toBe(before);
  });
});

describe('999 WrapNodeRow 具名参数下拉', () => {
  const wrapNode = (op: string, params: Record<string, unknown>, field: string | null): WrapNode =>
    ({ id: 'w1', type: 'wrap', op, field, childKey: 'query', child: null, params });

  function mountWrap(n: WrapNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(n);
    const app = createApp({
      render: () => h(WrapNodeRow, {
        node: cur.value, fields: [], types: {},
        'onUpdate:node': (x: WrapNode) => { cur.value = x; },
      }),
    });
    apps.push(app);
    app.use(createPinia());
    app.mount(host);
    return { host, cur };
  }

  async function openParams(host: HTMLElement) {
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="参数（score_mode 等）"]')!;
    btn.click();
    await tick();
  }

  it('nested score_mode 枚举渲染为下拉（选项来自 WRAP_PARAMS）', async () => {
    const { host } = mountWrap(wrapNode('nested', { score_mode: 'sum' }, 'comments'));
    await tick();
    await openParams(host);
    const sel = host.querySelector<HTMLSelectElement>('.wnr-params select');
    expect(sel).toBeTruthy();
    expect(sel!.value).toBe('sum');
    expect([...sel!.options].map(o => o.value)).toEqual(['avg', 'sum', 'max', 'min', 'none']);
  });

  it('未登记枚举的参数仍是自由编辑（无回归）', async () => {
    const { host } = mountWrap(wrapNode('nested', { inner_hits: { name: 'x' } }, 'comments'));
    await tick();
    await openParams(host);
    expect(host.querySelector('.wnr-params select')).toBeNull();
    expect(host.querySelector('.wnr-params input.gp-k')).toBeTruthy();
  });

  it('切下拉写回 params（树同步）', async () => {
    const { host, cur } = mountWrap(wrapNode('has_parent', { score_mode: 'none' }, 'question'));
    await tick();
    await openParams(host);
    const sel = host.querySelector<HTMLSelectElement>('.wnr-params select');
    sel!.value = 'score';
    sel!.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.params.score_mode).toBe('score');
  });
});
