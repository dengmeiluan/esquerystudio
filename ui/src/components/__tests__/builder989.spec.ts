/* 989 批组件契约：三刀行为锁——
   ① FsFunctionsPanel：function_score 函数列表结构化编辑（类型/weight/主参数/filter/增删/
      自定义形态锁定），AST 零改动（params.functions 直通往返）
   ② RootExtrasPane suggest 项级编辑（chips 序位锁面不变：排序[0]/_source[1]/高亮[2]/聚合[3]）
   ③ QueryTreePane 条件过滤命中折叠组的可见性（提示钮 + 一键展开重扫） */
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

import FsFunctionsPanel from '../builder/FsFunctionsPanel.vue';
import RootExtrasPane from '../builder/RootExtrasPane.vue';
import QueryTreePane from '../builder/QueryTreePane.vue';
import { __clearFieldCache } from '../../composables/useIndexFields';
import { emptyTree, parseTree, serializeTree } from '../../utils/queryAst';
import type { QueryTree } from '../../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r));
const apps: App[] = [];

function mountRaw(comp: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref<any>(props.params ?? null);
  const app = createApp({
    render: () => h(comp as never, { ...props, params: cur.value, 'onUpdate': (p: Record<string, unknown>) => { cur.value = p; } } as never),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
function mountPane(tree: QueryTree) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(tree);
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value, fields: ['status', 'likes'], types: { status: 'keyword', likes: 'integer' },
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
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: { status: { type: 'keyword' } } } });
});
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

describe('989 FsFunctionsPanel 函数列表编辑', () => {
  const FN_PARAMS = () => ({
    boost_mode: 'multiply',
    functions: [
      { filter: { term: { status: 'active' } }, weight: 2, field_value_factor: { field: 'likes', modifier: 'none' } },
      { weight: 5 },
      { gauss: { created: { origin: 'now', scale: '10d' } } },
    ],
  });

  it('行渲染：类型下拉分账正确（类型键/weight 裸项），AST 直通', () => {
    const { host } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS() });
    const types = [...host.querySelectorAll<HTMLSelectElement>('.fsfn-type')];
    expect(types.length).toBe(3);
    expect(types[0].value).toBe('field_value_factor');
    expect(types[1].value).toBe('weight');
    expect(types[2].value).toBe('gauss');
    expect((host.querySelectorAll<HTMLInputElement>('.fsfn-w')[0]).value).toBe('2');
    expect((host.querySelectorAll<HTMLInputElement>('.fsfn-w')[1]).value).toBe('5');
  });

  it('加函数默认 {weight:1}；删除行', async () => {
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS() });
    (host.querySelector('.fsfn-add') as HTMLElement).click();
    await tick();
    expect((cur.value.functions as unknown[]).length).toBe(4);
    expect(cur.value.functions![3]).toEqual({ weight: 1 });
    (host.querySelectorAll('button[aria-label="删除函数"]')[1] as HTMLElement).click();
    await tick();
    const fns = cur.value.functions as Record<string, unknown>[];
    expect(fns.length).toBe(3);
    expect(fns[1]).toEqual({ gauss: { created: { origin: 'now', scale: '10d' } } });
  });

  it('换类型保留通用键换安全初值（weight→field_value_factor 保留 weight）', async () => {
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS() });
    const sel = host.querySelectorAll<HTMLSelectElement>('.fsfn-type')[1];
    sel.value = 'field_value_factor';
    sel.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.functions![1]).toEqual({ weight: 5, field_value_factor: { field: '', modifier: 'none' } });
  });

  it('weight 编辑：数字写回、空串删键、非数字不写', async () => {
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS() });
    const w = host.querySelectorAll<HTMLInputElement>('.fsfn-w')[1];
    w.value = '3.5';
    w.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.functions![1].weight).toBe(3.5);
    w.value = '';
    w.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.functions![1]).toEqual({});
    w.value = 'abc';
    w.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.functions![1]).toEqual({});
  });

  it('主参数经递归子表编辑写回', async () => {
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS() });
    (host.querySelectorAll('button[aria-label="函数参数"]')[0] as HTMLElement).click();
    await tick();
    const bodyVal = host.querySelector('.fsfn-sub .gp-v') as HTMLInputElement;
    expect(bodyVal).toBeTruthy();
    bodyVal.value = 'stars';
    bodyVal.dispatchEvent(new Event('input'));
    await tick();
    expect((cur.value.functions![0].field_value_factor as Record<string, unknown>).field).toBe('stars');
  });

  it('1009 filter 一等查询树：展开即树行（ClauseNode），值编辑序列化写回', async () => {
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS(), fields: ['status', 'likes', 'created'], types: { status: 'keyword', likes: 'integer', created: 'date' } });
    (host.querySelectorAll('button[aria-label="filter 过滤"]')[0] as HTMLElement).click();
    await tick();
    const flt = host.querySelector('.fsfn-flt');
    expect(flt, 'filter 面板在场').not.toBeNull();
    const cn = flt!.querySelector('.cn') as HTMLElement;
    expect(cn, '完整查询树行（ClauseNode）渲染').not.toBeNull();
    const opSel = cn.querySelector<HTMLSelectElement>('.cn-op');
    expect(opSel!.value).toBe('term');
    const val = cn.querySelector<HTMLInputElement>('.cn-val');
    expect(val!.value).toBe('active');
    val!.value = 'inactive';
    val!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.functions![0].filter).toEqual({ term: { status: 'inactive' } });
  });

  it('1009 filter 缺席态：展开只读展示 match_all 骨架不写回；已有 filter 可移除', async () => {
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS(), fields: ['status'], types: { status: 'keyword' } });
    /* row1 = {weight:5} 无 filter 键：展开后树骨架在场但不写回（不污染 DSL 文本） */
    (host.querySelectorAll('button[aria-label="filter 过滤"]')[1] as HTMLElement).click();
    await tick();
    expect(host.querySelector('.fsfn-flt .mte-single-bar'), 'match_all 单条件骨架').not.toBeNull();
    expect('filter' in (cur.value.functions![1] as Record<string, unknown>)).toBe(false);
    expect(host.querySelector('button[aria-label="移除过滤条件"]'), '无 filter 键无移除钮').toBeNull();
    /* row0 有 filter：移除钮删键 */
    (host.querySelectorAll('button[aria-label="filter 过滤"]')[0] as HTMLElement).click();
    await tick();
    (host.querySelector('button[aria-label="移除过滤条件"]') as HTMLElement).click();
    await tick();
    expect('filter' in (cur.value.functions![0] as Record<string, unknown>)).toBe(false);
    expect(cur.value.functions![0]).toEqual({ weight: 2, field_value_factor: { field: 'likes', modifier: 'none' } });
  });

  it('1009 衰减函数快径：字段作键合法形态渲染，origin 编辑/mvm 下拉/字段搬家写回', async () => {
    const p = FN_PARAMS();
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: p, fields: ['status', 'likes', 'created'], types: { status: 'keyword', likes: 'integer', created: 'date' } });
    (host.querySelectorAll('button[aria-label="函数参数"]')[2] as HTMLElement).click();   // row2 gauss
    await tick();
    const decay = host.querySelector('.fsfn-decay');
    expect(decay, '衰减快径编辑位在场').not.toBeNull();
    const origin = decay!.querySelectorAll<HTMLInputElement>('.fsfn-dp')[0];
    expect(origin.value).toBe('now');
    origin.value = 'now-1h';
    origin.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.functions![2]).toEqual({ gauss: { created: { origin: 'now-1h', scale: '10d' } } });
    /* multi_value_mode：选 sum 加键、选回默认删键 */
    const mvm = decay!.querySelector<HTMLSelectElement>('.fsfn-mvm')!;
    mvm.value = 'sum';
    mvm.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.functions![2]).toEqual({ gauss: { created: { origin: 'now-1h', scale: '10d' }, multi_value_mode: 'sum' } });
    mvm.value = '';
    mvm.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.functions![2]).toEqual({ gauss: { created: { origin: 'now-1h', scale: '10d' } } });
    /* 字段搬家：字段选择器输入改 'likes'（input 事件走 update:modelValue → 键搬家参数保留） */
    const fsInp = decay!.querySelector<HTMLInputElement>('.fs-inp');
    fsInp!.value = 'likes';
    fsInp!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.functions![2]).toEqual({ gauss: { likes: { origin: 'now-1h', scale: '10d' } } });
  });

  it('1009 衰减换类型给字段作键骨架（旧 field 属性写法 ES 必拒）；多字段体退化递归表', async () => {
    const { host, cur } = mountRaw(FsFunctionsPanel, { params: FN_PARAMS(), fields: ['likes'], types: { likes: 'integer' } });
    const sel = host.querySelectorAll<HTMLSelectElement>('.fsfn-type')[1];   // row1 weight 裸项
    sel.value = 'gauss';
    sel.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.functions![1]).toEqual({ weight: 5, gauss: { '': { origin: '', scale: '' } } });
    /* 多字段衰减体（合法但非单字段）→ 通用递归表（零丢失），不走快径 */
    const { host: h2 } = mountRaw(FsFunctionsPanel, { params: { functions: [{ gauss: { a: { scale: '1' }, b: { scale: '2' } } }] }, fields: [], types: {} });
    (h2.querySelector('button[aria-label="函数参数"]') as HTMLElement).click();
    await tick();
    expect(h2.querySelector('.fsfn-decay'), '多字段体不进快径').toBeNull();
    expect(h2.querySelector('.fsfn-sub .gp-row'), '通用递归表兜底').not.toBeNull();
  });

  it('自定义形态锁定：多类型键项 select/参数钮双 disabled', () => {
    const { host } = mountRaw(FsFunctionsPanel, { params: { functions: [{ field_value_factor: { field: 'a' }, script_score: { script: {} } }] } });
    const sel = host.querySelector<HTMLSelectElement>('.fsfn-type');
    expect(sel!.value).toBe('custom');
    expect(sel!.disabled).toBe(true);
    expect((host.querySelector('button[aria-label="函数参数"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('整树往返：面板编辑后 serializeTree 仍深度无损', async () => {
    const dsl = { query: { function_score: { query: { match_all: {} }, boost_mode: 'multiply', functions: [{ weight: 2, field_value_factor: { field: 'likes' } }] } } };
    const t = parseTree(dsl);
    if (!t.ok) throw new Error('parse failed');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const node = t.tree.root as import('../../utils/queryAst').WrapNode;   // root 即 function_score wrap
    const cur = ref(node.params);
    const app = createApp({
      render: () => h(FsFunctionsPanel, { params: cur.value, 'onUpdate': (p: Record<string, unknown>) => { cur.value = p; } }),
    });
    apps.push(app);
    app.mount(host);
    await tick();
    const w = host.querySelector<HTMLInputElement>('.fsfn-w');
    w!.value = '4';
    w!.dispatchEvent(new Event('input'));
    await tick();
    node.params = cur.value;
    expect(serializeTree(t.tree)).toEqual({ query: { function_score: { query: { match_all: {} }, boost_mode: 'multiply', functions: [{ weight: 4, field_value_factor: { field: 'likes' } }] } } });
  });
});

describe('989 RootExtrasPane suggest 项级编辑', () => {
  it('加建议：默认 completion 形态可用体；名称自增不撞名', async () => {
    const { host, cur } = mountPane(emptyTree());
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('suggest'));
    expect(chip, 'suggest chip 必须在场').toBeTruthy();
    chip!.click();
    await tick();
    (host.querySelector('.rx-sug-add') as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-sug-add2') as HTMLElement).click();
    await tick();
    const items = cur.value.suggest!.items;
    expect(items.map(s => s.name)).toEqual(['my-suggest_1', 'my-suggest_2']);
    expect(items[0].rest).toEqual({ completion: { field: 'status', prefix: '' } });
    expect(items[0].hasText).toBe(true);
    expect(serializeTree(cur.value).suggest).toEqual({
      'my-suggest_1': { text: '', completion: { field: 'status', prefix: '' } },
      'my-suggest_2': { text: '', completion: { field: 'status', prefix: '' } },
    });
  });

  it('text/名称编辑写回；解析形态自动展开（rx-sug-row 在场）', async () => {
    const t = parseTree({ suggest: { my: { text: 'tw', term: { field: 'body' } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    expect(host.querySelector('.rx-sug-row'), '有内容默认展开').not.toBeNull();
    const text = host.querySelector<HTMLInputElement>('.rx-sug-text');
    text!.value = 'newtext';
    text!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.suggest!.items[0].text).toBe('newtext');
    const name = host.querySelector<HTMLInputElement>('.rx-sug-name');
    name!.value = 'renamed';
    name!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.suggest!.items[0].name).toBe('renamed');
    expect(serializeTree(cur.value)).toEqual({ suggest: { renamed: { text: 'newtext', term: { field: 'body' } } } });
  });

  it('全局 text 补钮 + 编辑；删除项；移除键', async () => {
    const t = parseTree({ suggest: { a: { term: { field: 'f' } }, b: { term: { field: 'g' } } } });
    if (!t.ok) throw new Error('parse failed');
    const { host, cur } = mountPane(t.tree);
    await tick();
    (host.querySelector('.rx-sug-gtext') as HTMLElement).click();
    await tick();
    expect(cur.value.suggest!.hasGlobalText).toBe(true);
    /* 全局 text 输入在 .rx-row 内（项级 text 在 .rx-sug-row），类名同为 .rx-sug-text */
    const g = host.querySelector<HTMLInputElement>('.rx-row .rx-sug-text');
    g!.value = 'global-text';
    g!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.suggest!.globalText).toBe('global-text');
    (host.querySelectorAll('button[aria-label="删除建议"]')[0] as HTMLElement).click();
    await tick();
    expect(cur.value.suggest!.items.map(s => s.name)).toEqual(['b']);
    (host.querySelector('[title="移除 suggest 键"]') as HTMLElement).click();
    await tick();
    expect(cur.value.suggest).toBeNull();
    expect(serializeTree(cur.value)).toEqual({});
  });
});

describe('989 条件过滤命中折叠组可见性', () => {
  it('命中在折叠组内 → 提示钮在场；点击展开全部后重扫、钮退场、命中行可见', async () => {
    const t = parseTree({ query: { bool: { must: [{ bool: { must: [{ term: { innerfield: 'innerval' } }] } }] } } });
    if (!t.ok) throw new Error('parse failed');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(t.tree);
    const app = createApp({
      render: () => h(QueryTreePane, { tree: cur.value, fields: ['innerfield'], types: { innerfield: 'keyword' }, 'onUpdate:tree': (x: QueryTree) => { cur.value = x; } }),
    });
    apps.push(app);
    app.mount(host);
    await tick();
    /* 折叠内层组（第二个折叠钮 = 嵌套内层） */
    const foldBtns = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label="折叠或展开整组"]')];
    expect(foldBtns.length).toBe(2);
    foldBtns[1].click();
    await tick();
    expect(host.querySelectorAll('.bgn.folded').length, '内层组已折叠').toBe(1);
    /* 过滤命中折叠内条件 */
    const find = host.querySelector('.qtp-find input') as HTMLInputElement;
    find.value = 'innerval';
    find.dispatchEvent(new Event('input'));
    await tick();
    await tick();
    const hint = host.querySelector<HTMLButtonElement>('.qtp-find-fold');
    expect(hint, '折叠组内命中必须提示').not.toBeNull();
    expect(hint!.textContent).toContain('1');
    /* 点击展开 → 重扫后提示退场、命中行带 .qtp-hit 且可见 */
    hint!.click();
    await tick();
    await tick();
    expect(host.querySelectorAll('.bgn.folded').length, '展开全部后零折叠').toBe(0);
    expect(host.querySelector('.qtp-find-fold'), '重扫后提示退场').toBeNull();
    expect(host.querySelector('.cn.qtp-hit'), '命中行可见且带柔底').not.toBeNull();
  });
});
