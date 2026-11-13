/**
 * 【W3b】builder 智能纠错续作 P1 三项接线：
 *  ① AggTreeNode：聚合 field 行按 node.op 传 typePriority（date_histogram→date 置顶、
 *     terms→keyword+数值族、五百三十一批扩容 avg/min/max/sum/cardinality/histogram→数值族、
 *     range→date+数值族）；
 *  ② RootExtrasPane：sort 行候选内 date/数值族置顶、highlight 行 text 置顶
 *     （typeFilter 候选集不变，typePriority 只重排分组）；
 *  ③ GenericNode：multi_match/query_string 的 fields/field 字段键接字段源
 *     （fields 数组逐项 FieldSelect / field 标量 FieldSelect；无字段源回落裸键值表零降级）。
 * 弹层 teleport 到 body，断言查 document.body；字段名故意让字母序与置顶序相反（效果可辨）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import AggTreeNode from '../builder/AggTreeNode.vue';
import RootExtrasPane from '../builder/RootExtrasPane.vue';
import GenericNode from '../builder/GenericNode.vue';
import type { AggNode, LeafNode, QueryTree } from '../../utils/queryAst';

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

/* 挂载后聚焦字段选择器开弹层，返回候选行文本序（.fs-item）与组头序（.fs-gh） */
async function openPopup(mount: (host: HTMLDivElement) => void, selector = '.fs-inp') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  mount(host);
  const inp = host.querySelector(selector) as HTMLInputElement;
  inp.focus();
  await new Promise(r => setTimeout(r));
  return {
    items: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item')).map(el => el.textContent || ''),
    groups: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-gh')).map(el => el.textContent || ''),
    host,
  };
}

/* ═══ ① AggTreeNode：聚合 field 行按 op 类型置顶 ═══ */

const AGG_TYPES = { a_title: 'text', z_status: 'keyword', m_count: 'long', z_created: 'date' };
const AGG_FIELDS = Object.keys(AGG_TYPES);

function mountAgg(node: AggNode) {
  return openPopup(host => {
    const cur = ref(node);
    createApp({
      render: () => h(AggTreeNode, {
        node: cur.value, fields: AGG_FIELDS, types: AGG_TYPES,
        'onUpdate:node': (n: AggNode) => { cur.value = n; },
      }),
    }).mount(host);
  });
}
const mkAgg = (op: string): AggNode => ({
  id: 'a1', name: 'agg_1', op, body: { field: '' }, children: [], meta: {}, aggKey: 'aggs',
});

describe('AggTreeNode 聚合 field 行 typePriority（W3b）', () => {
  it('terms：keyword 置顶、数值族次之（分组桶字段主场景）', async () => {
    const r = await mountAgg(mkAgg('terms'));
    expect(r.groups[0]).toBe('精确值 字段'); /* 558b 随迁：组头人话词面 */
    expect(r.items[0]).toContain('z_status');
    expect(r.items.some(t => t!.includes('m_count'))).toBe(true);
  });

  it('date_histogram：date 置顶（时间直方图打时间字段）', async () => {
    const r = await mountAgg(mkAgg('date_histogram'));
    expect(r.groups[0]).toBe('日期 字段');
    expect(r.items[0]).toContain('z_created');
  });

  it('其余聚合（avg/histogram）：五百三十一批类型感知扩容——数值族置顶（度量聚合打数值字段；旧「无倾向零增量」契约随 531 Agg 扩容退役）', async () => {
    for (const op of ['avg', 'histogram']) {
      const r = await mountAgg(mkAgg(op));
      expect(r.items[0], op + ' 数值族置顶').toContain('m_count');
    }
  });
});

/* ═══ ② RootExtrasPane：sort/highlight 行类型置顶 ═══ */

const RX_TYPES = { a_kw: 'keyword', d_date: 'date', n_num: 'long', t_text: 'text' };
const RX_FIELDS = Object.keys(RX_TYPES);

function mountRx(tree: QueryTree) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(tree);
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value, fields: RX_FIELDS, types: RX_TYPES,
      'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
    }),
  });
  app.use(createPinia());
  app.mount(host);
  return host;
}
/* 分区先点 chip 展开，再聚焦行内字段选择器，回读弹层候选/组头 */
async function popupAfterFocus(root: HTMLElement, selector: string) {
  (root.querySelector(selector) as HTMLInputElement).focus();
  await new Promise(r => setTimeout(r));
  return {
    items: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item')).map(el => el.textContent || ''),
    groups: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-gh')).map(el => el.textContent || ''),
  };
}

const emptyTree = (): QueryTree => ({ root: null, postFilter: null, collapse: null, knn: null, suggest: null, rescore: null, scriptFields: null, runtimeMappings: null, retriever: null, sort: null, source: null, aggs: null, highlight: null, searchParams: {}, extras: {} });

describe('RootExtrasPane sort/highlight 行 typePriority（W3b）', () => {
  it('sort 行：typeFilter 可排序集内 date 置顶、数值族次之、keyword 殿后', async () => {
    const t = emptyTree();
    t.sort = [{ id: 's1', field: '', form: 'short', params: { order: 'desc' } }];
    const host = mountRx(t);
    await new Promise(res => setTimeout(res));
    /* 分区有内容默认已展开（autoOpen），无需点 chip */
    const r = await popupAfterFocus(host, '.rx-sort-row .fs-inp');
    expect(r.groups[0]).toBe('日期 字段');
    expect(r.groups[1]).toBe('数值 字段');
    expect(r.groups[r.groups.length - 1], 'keyword 不进置顶表归「其他」殿后').toBe('其他 字段');
    expect(r.items[0]).toContain('d_date');
    expect(r.items.some(x => x!.includes('t_text')), 'text 不可排序，被 typeFilter 排除（候选集不变）').toBe(false);
  });

  it('highlight 行：text 置顶、keyword 次之（HL_TYPES 候选集不变）', async () => {
    const t = emptyTree();
    t.highlight = { fields: [{ name: '', params: {} }], params: {} };
    const host = mountRx(t);
    await new Promise(res => setTimeout(res));
    /* 分区有内容默认已展开（autoOpen），无需点 chip */
    const r = await popupAfterFocus(host, '.rx-hl-row .fs-inp');
    expect(r.groups[0]).toBe('文本 字段'); /* 558b 随迁：组头人话词面 */
    expect(r.items[0]).toContain('t_text');
    expect(r.items.length, '候选集仍 text+keyword 全量（typePriority 不裁剪）').toBe(2);
  });
});

/* ═══ ③ GenericNode：multi_match/query_string 字段键接字段源 ═══ */

const mkGeneric = (op: string, raw: Record<string, unknown>): LeafNode => ({
  id: 'g1', type: 'leaf', op, field: null, value: null, params: {}, raw,
});

describe('GenericNode 字段源接线（W3b）', () => {
  it('multi_match 的 fields 数组逐项渲染 FieldSelect，候选 text 置顶，选中写回数组', async () => {
    const cur = ref(mkGeneric('multi_match', { query: 'x', fields: [''] }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(GenericNode, {
        node: cur.value, fields: ['a_title', 'z_status'], types: { a_title: 'text', z_status: 'keyword' },
        'onUpdate:node': (n: LeafNode) => { cur.value = n; },
      }),
    });
    app.mount(host);
    const inp = host.querySelector('.fs-inp') as HTMLInputElement;
    expect(inp, 'fields 数组项渲染 FieldSelect').not.toBeNull();
    inp.focus();
    await new Promise(r => setTimeout(r));
    const groups = Array.from(document.body.querySelectorAll<HTMLElement>('.fs-gh')).map(el => el.textContent || '');
    const items = Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item'));
    expect(groups[0], '全文检索字段 text 优先').toBe('文本 字段'); /* 558b 随迁：组头人话词面 */
    expect(items[0].textContent).toContain('a_title');
    items[0].click();
    await new Promise(r => setTimeout(r));
    expect((cur.value.raw as any).fields, '选中写回 fields 数组（数组形态不退化）').toEqual(['a_title']);
  });

  it('query_string 的 field 标量键渲染 FieldSelect', async () => {
    const r = await openPopup(host => {
      const cur = ref(mkGeneric('query_string', { query: 'x', field: '' }));
      createApp({
        render: () => h(GenericNode, {
          node: cur.value, fields: ['a_title', 'z_status'], types: { a_title: 'text', z_status: 'keyword' },
          'onUpdate:node': (n: LeafNode) => { cur.value = n; },
        }),
      }).mount(host);
    });
    expect(r.host.querySelector('.fs-inp')).not.toBeNull();
    expect(r.groups[0]).toBe('文本 字段'); /* 558b 随迁：组头人话词面 */
  });

  it('零降级：无字段源 / 非 field 键 op（script_score）回落裸键值表（无 FieldSelect）', async () => {
    const mount1 = (node: LeafNode, withFields: boolean) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const app = createApp({
        render: () => h(GenericNode, {
          node,
          ...(withFields ? { fields: ['a_title'], types: { a_title: 'text' } } : {}),
          'onUpdate:node': () => {},
        }),
      });
      app.use(createPinia());
      app.mount(host);
      return host;
    };
    const h1 = mount1(mkGeneric('multi_match', { query: 'x', fields: [''] }), false);
    expect(h1.querySelector('.fs-inp'), '无字段源回落普通输入').toBeNull();
    const h2 = mount1(mkGeneric('script_score', { source: 'return 1;' }), true);
    expect(h2.querySelector('.fs-inp'), '非 field 键 op 不猜字段键').toBeNull();
  });
});
