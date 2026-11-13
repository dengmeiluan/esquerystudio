/* 985 批组件冒烟：算子大扩充后 builder 组件的新形态渲染。
 覆盖：ClauseNode 多字段/无字段/对象值三分支、下拉高级分组、切算子形态重建；
 MultiNodeRow boosting 分区；BoolGroupNode「+ 高级」菜单插入链路。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import MultiNodeRow from '../builder/MultiNodeRow.vue';
import BoolGroupNode from '../builder/BoolGroupNode.vue';
import { makeNodeByOp, parseQueryNode, serQueryNode } from '../../utils/queryAst';
import type { LeafNode, MultiNode, BoolNode, QueryNode } from '../../utils/queryAst';

const mk = (patch: Partial<LeafNode> = {}): LeafNode => ({
  id: 't1', type: 'leaf', op: 'term', field: 'status', value: 'active', params: {}, raw: null, ...patch,
});

function mount<T>(comp: any, props: Record<string, unknown>, onNode?: (n: T) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref((props as any).node);
  const app = createApp({
    render: () => h(comp, { fields: [], types: {}, ...props, node: cur.value, 'onUpdate:node': (n: T) => { cur.value = n; onNode?.(n); } }),
  });
  app.mount(host);
  return { host, cur, app };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

describe('985 ClauseNode 多字段形态（multi_match）', () => {
  const mm = mk({ op: 'multi_match', field: null, fields: ['title', 'summary'], value: '债券' });
  it('渲染主值 + 字段列表输入，不渲染字段选择器', () => {
    const { host } = mount<LeafNode>(ClauseNode, { node: mm, fields: ['title'], types: { title: 'text' } });
    expect(host.querySelector('.fs-inp')).toBeNull();               // 无单字段选择器
    expect(host.querySelectorAll('.cn-val').length).toBe(2);        // 主值 + fields
    const vals = host.querySelectorAll('.cn-val') as NodeListOf<HTMLInputElement>;
    expect(vals[0].value).toBe('债券');
    expect(vals[1].value).toBe('title,summary');
  });
  it('fields 逗号分隔写回数组；主值写回 value', async () => {
    let last: LeafNode | null = null;
    const { host } = mount<LeafNode>(ClauseNode, { node: mm }, n => { last = n; });
    const vals = host.querySelectorAll('.cn-val') as NodeListOf<HTMLInputElement>;
    vals[1].value = 'a, b ,c';
    vals[1].dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(last!.fields).toEqual(['a', 'b', 'c']);
    vals[0].value = '利率';
    vals[0].dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(last!.value).toBe('利率');
    expect(last!.field).toBeNull();
  });
});

describe('985 ClauseNode 无字段形态（ids/script）与对象值子表', () => {
  it('ids：无字段选择器，值 chip 编辑（1005 随迁——逗号分隔文本退役，粘贴含逗号仍拆项）', async () => {
    let last: LeafNode | null = null;
    const { host } = mount<LeafNode>(ClauseNode, { node: mk({ op: 'ids', field: null, value: ['1', '2'] }) }, n => { last = n; });
    expect(host.querySelector('.fs-inp')).toBeNull();
    /* 既有值渲染为 chips；追加一项走提交链（回车），半截不写树 */
    const chips = Array.from(host.querySelectorAll('.cn-chip-v')).map(el => el.textContent);
    expect(chips).toEqual(['1', '2']);
    const inp = host.querySelector('.cn-chip-in') as HTMLInputElement;
    inp.value = '3';
    inp.dispatchEvent(new Event('input'));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise(r => setTimeout(r));
    expect(last!.value).toEqual(['1', '2', '3']);
  });
  it('对象值（terms_set）渲染递归键值子表，编辑回写 value', async () => {
    let last: LeafNode | null = null;
    const node = mk({ op: 'terms_set', field: 'codes', value: { terms: ['a'] } });
    const { host } = mount<LeafNode>(ClauseNode, { node }, n => { last = n; });
    expect(host.querySelector('.cn-objval')).not.toBeNull();
    expect(host.querySelector('.gp')).not.toBeNull();
    // 子表加键：主表添加行（.gp 直接子 .gp-add——terms 数组子表里也有同名行，须锚直接子代）
    const key = host.querySelector('.cn-objval .gp > .gp-add .inp') as HTMLInputElement;
    key.value = 'minimum_should_match';
    key.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    const addBtn = host.querySelector('.cn-objval .gp > .gp-add .btn') as HTMLButtonElement;
    addBtn.click();
    await new Promise(r => setTimeout(r));
    expect(last!.value).toHaveProperty('minimum_should_match');
    expect((host.querySelector('.cn-val') as HTMLInputElement)).toBeNull();  // 纯对象值不渲染标量值输入
  });
  it('对象值常用键 chips：点选即得语义骨架（terms→[]），已添加键禁用', async () => {
    let last: LeafNode | null = null;
    const node = mk({ op: 'terms_set', field: 'codes', value: {} });
    const { host, cur } = mount<LeafNode>(ClauseNode, { node }, n => { last = n; });
    const chips = [...host.querySelectorAll('.cn-objk-btn')] as HTMLButtonElement[];
    expect(chips.map(b => b.textContent!.trim())).toEqual(['+ terms', '+ minimum_should_match_field']);
    /* intervals 通用退化路径骨架 chips（1011：可解析形态走专用编辑器；
       键名按 ES 官方 all_of/any_of——旧 allOf/anyOf 驼峰写法 ES 必拒） */
    const { host: hIv } = mount<LeafNode>(ClauseNode, { node: mk({ op: 'intervals', field: 'content', value: {} }) });
    const ivChips = [...hIv.querySelectorAll('.cn-objk-btn')] as HTMLButtonElement[];
    expect(ivChips.map(b => b.textContent!.trim())).toEqual(['+ match', '+ all_of', '+ any_of']);
    chips[0].click();
    await new Promise(r => setTimeout(r));
    expect(last!.value).toEqual({ terms: [] });
    // 回写后同键 chips 禁用
    const chips2 = [...host.querySelectorAll('.cn-objk-btn')] as HTMLButtonElement[];
    expect(chips2[0].disabled).toBe(true);
    expect(cur.value.value).toEqual({ terms: [] });
  });
});

describe('985 ClauseNode 下拉分组与切算子形态重建', () => {
  it('下拉含高级分组（multi_match 可达）', () => {
    const { host } = mount<LeafNode>(ClauseNode, { node: mk(), fields: ['status'], types: { status: 'keyword' } });
    const sel = host.querySelector('.cn-op') as HTMLSelectElement;
    const labels = [...(sel as any).querySelectorAll('optgroup')].map((g: any) => g.label);
    expect(labels[0]).toBe('推荐');
    expect(labels).toContain('常用');
    expect(labels).toContain('全文检索');
    /* 复合容器组不进条件行下拉——容器节点（wrap/multi）不是叶子，只能走「+ 高级」插入 */
    expect(labels).not.toContain('复合容器');
    const ops = [...sel.querySelectorAll('option')].map((o: any) => o.value);
    expect(ops).toContain('multi_match');
    expect(ops).toContain('ids');
    expect(ops).toContain('geo_distance');
    expect(ops).not.toContain('boosting');
  });
  it('term → multi_match：field 退役、fields=[]、值保留', async () => {
    let last: LeafNode | null = null;
    const { host } = mount<LeafNode>(ClauseNode, { node: mk() }, n => { last = n; });
    const sel = host.querySelector('.cn-op') as HTMLSelectElement;
    sel.value = 'multi_match';
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    expect(last!.op).toBe('multi_match');
    expect(last!.field).toBeNull();
    expect(last!.fields).toEqual([]);
    expect(last!.value).toBe('active');
    expect(serQueryNode(last!)).toEqual({ multi_match: { query: 'active', fields: [] } });
  });
  it('multi_match → term：field 归空串（补字段），fields 退役', async () => {
    let last: LeafNode | null = null;
    const { host } = mount<LeafNode>(ClauseNode, { node: mk({ op: 'multi_match', field: null, fields: ['a'], value: 'x' }) }, n => { last = n; });
    const sel = host.querySelector('.cn-op') as HTMLSelectElement;
    sel.value = 'term';
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    expect(last!.op).toBe('term');
    expect(last!.field).toBe('');
    expect(last!.fields).toBeNull();
    expect(last!.value).toBe('x');
  });
  it('term → terms_set：数组值安全初值（保留旧值）', async () => {
    let last: LeafNode | null = null;
    const { host } = mount<LeafNode>(ClauseNode, { node: mk({ value: 'active' }) }, n => { last = n; });
    const sel = host.querySelector('.cn-op') as HTMLSelectElement;
    sel.value = 'terms_set';
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    /* 1119：terms_set 字段键持数组，旧标量收进 []（旧实现给 {} 会序列化成非法体） */
    expect(last!.value).toEqual(['active']);
    expect(serQueryNode(last!)).toEqual({ terms_set: { status: ['active'] } });
  });
});

describe('985 MultiNodeRow（boosting/dis_max）', () => {
  const boost: MultiNode = {
    id: 'm1', type: 'multi', op: 'boosting',
    children: [
      { key: 'positive', node: mk({ id: 'p1', op: 'match', field: 't', value: '好' }) },
      { key: 'negative', node: mk({ id: 'n1', op: 'match', field: 't', value: '坏' }) },
    ],
    params: { negative_boost: 0.2 }, arrForm: { positive: false, negative: false },
  };
  it('双分区渲染 + op 中文标签', () => {
    const { host } = mount<MultiNode>(MultiNodeRow, { node: boost, fields: ['t'], types: { t: 'text' } });
    expect(host.textContent).toContain('正负加权');
    expect(host.textContent).toContain('正例 positive');
    expect(host.textContent).toContain('反例 negative');
    expect(host.querySelectorAll('.cn').length).toBe(2);
  });
  it('+子查询在指定分区追加 bool 组', async () => {
    let last: MultiNode | null = null;
    const { host } = mount<MultiNode>(MultiNodeRow, { node: { ...boost, children: boost.children.slice(0, 1) } }, n => { last = n; });
    const partBtns = [...host.querySelectorAll('.mnr-part')].map(p => p.querySelector('.mnr-part-hd .btn') as HTMLButtonElement);
    partBtns[1].click();   // negative 分区（当前空）
    await new Promise(r => setTimeout(r));
    expect(last!.children.filter(c => c.key === 'negative').length).toBe(1);
  });
  it('删子查询', async () => {
    let last: MultiNode | null = null;
    const { host } = mount<MultiNode>(MultiNodeRow, { node: boost }, n => { last = n; });
    // 正例分区内的条件行删除按钮（锚分区内 .cn 行的删除——容器头部删除钮 aria 同名须排除）
    const p1del = host.querySelector('.mnr-part .cn button[aria-label="删除"]') as HTMLButtonElement;
    p1del.click();
    await new Promise(r => setTimeout(r));
    expect(last!.children.length).toBe(1);
    expect(last!.children[0].key).toBe('negative');
  });
  it('round-trip：boosting 节点经组件增删后仍无损', () => {
    const n = parseQueryNode({ boosting: { positive: { term: { a: 1 } }, negative: { term: { b: 2 } }, negative_boost: 0.2 } });
    expect(serQueryNode(n)).toEqual({ boosting: { positive: { term: { a: 1 } }, negative: { term: { b: 2 } }, negative_boost: 0.2 } });
  });
});

describe('985 BoolGroupNode「+ 高级」菜单', () => {
  const group: BoolNode = {
    id: 'g1', type: 'bool',
    children: [{ occur: 'must', node: mk({ id: 'c1' }) }],
    params: {}, arrForm: { must: true },
  };
  it('菜单打开列高级分组，点选插入对应节点', async () => {
    let last: BoolNode | null = null;
    const { host } = mount<BoolNode>(BoolGroupNode, { node: group, fields: ['status'], types: { status: 'keyword' } }, n => { last = n; });
    const advBtn = host.querySelector('button[title^="高级算子"]') as HTMLButtonElement;
    advBtn.click();
    await new Promise(r => setTimeout(r));
    const pop = document.body.querySelector('.adv-pop') as HTMLElement;
    expect(pop).not.toBeNull();
    expect(pop.textContent).toContain('全文检索');
    expect(pop.textContent).toContain('地理位置');
    const mmBtn = [...pop.querySelectorAll('.adv-i')].find(b => b.textContent?.includes('multi_match')) as HTMLButtonElement;
    mmBtn.click();
    await new Promise(r => setTimeout(r));
    expect(last!.children.length).toBe(2);
    const added = last!.children[1].node as LeafNode;
    expect(added.op).toBe('multi_match');
    expect(added.fields).toEqual([]);
    expect(document.body.querySelector('.adv-pop')).toBeNull();   // 点选后关菜单
  });
  it('过滤 + Enter 直插首个命中', async () => {
    let last: BoolNode | null = null;
    const { host } = mount<BoolNode>(BoolGroupNode, { node: group, fields: ['status'], types: { status: 'keyword' } }, n => { last = n; });
    (host.querySelector('button[title^="高级算子"]') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r));
    const q = document.body.querySelector('.adv-q') as HTMLInputElement;
    expect(document.activeElement).toBe(q);   // 打开即聚焦搜索框
    q.value = 'geo_dis';
    q.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    const items = [...document.body.querySelectorAll('.adv-i')].map(b => b.textContent);
    expect(items.length).toBe(1);
    expect(items[0]).toContain('geo_distance');
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r));
    expect((last!.children[1].node as LeafNode).op).toBe('geo_distance');
  });
  it('插入复合容器（boosting）走 makeNodeByOp 全家桶', async () => {
    let last: BoolNode | null = null;
    const { host } = mount<BoolNode>(BoolGroupNode, { node: group, fields: ['status'], types: { status: 'keyword' } }, n => { last = n; });
    const advBtn = host.querySelector('button[title^="高级算子"]') as HTMLButtonElement;
    advBtn.click();
    await new Promise(r => setTimeout(r));
    const pop = document.body.querySelector('.adv-pop') as HTMLElement;
    const bBtn = [...pop.querySelectorAll('.adv-i')].find(b => b.textContent?.includes('boosting')) as HTMLButtonElement;
    bBtn.click();
    await new Promise(r => setTimeout(r));
    const added = last!.children[1].node as MultiNode;
    expect(added.type).toBe('multi');
    expect(added.children.map(c => c.key)).toEqual(['positive', 'negative']);
    expect(serQueryNode(added as unknown as QueryNode)).toEqual({
      boosting: { positive: { match_all: {} }, negative: { match_all: {} } },
    });
  });
});

describe('985 工厂×序列化一致性', () => {
  it('makeNodeByOp 每个高级算子空节点可无损序列化', () => {
    const ops = ['multi_match', 'query_string', 'simple_query_string', 'combined_fields', 'more_like_this',
      'ids', 'script', 'wrapper', 'percolate', 'terms_set', 'geo_distance', 'geo_bounding_box',
      'geo_polygon', 'geo_shape', 'intervals', 'match_bool_prefix', 'rank_feature', 'distance_feature',
      'constant_score', 'function_score', 'script_score', 'pinned', 'boosting', 'dis_max',
      'span_near', 'span_or', 'span_not', 'span_first', 'span_containing', 'span_within', 'span_term', 'span_multi',
      /* 987：DSL 全量覆盖补齐九员随迁入锁面 */
      'bitmap_terms', 'geo_grid', 'shape', 'sparse_vector', 'text_expansion',
      'weighted_tokens', 'semantic', 'knn', 'span_field_masking'];
    for (const op of ops) {
      const n = makeNodeByOp(op);
      const ser = serQueryNode(n) as Record<string, unknown>;
      expect(Object.keys(ser)[0], op).toBe(op);
      // 空节点可被再次 parse（编辑器新建节点即树合法态）
      const re = parseQueryNode(ser);
      expect(serQueryNode(re)).toEqual(ser);
    }
  });
});
