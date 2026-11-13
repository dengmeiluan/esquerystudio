/* 1056：text 字段精确算子的一键 .keyword 子域建议——只提示、点击才改，值不变。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import ClauseNode from '../components/builder/ClauseNode.vue';
import QueryTreePane from '../components/builder/QueryTreePane.vue';
import { parseTree, serializeTree, type LeafNode, type QueryTree } from '../utils/queryAst';

const TYPES: Record<string, string> = { title: 'text', 'title.keyword': 'keyword' };
const mk = (patch: Partial<LeafNode> = {}): LeafNode => ({
  id: 't1', type: 'leaf', op: 'term', field: 'title', value: '年度报告', params: {}, raw: null, ...patch,
});
const apps: ReturnType<typeof createApp>[] = [];

function mountLeaf(node: LeafNode, types: Record<string, string> = TYPES) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: Object.keys(types), types,
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app); app.mount(host);
  return { host, cur };
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('1056 .keyword 子域建议', () => {
  it('text + term 且有 keyword 子域 → 出现按钮，点击改打子域（算子/值不变）', async () => {
    const { host, cur } = mountLeaf(mk());
    const btn = host.querySelector<HTMLButtonElement>('.cn-kwfix');
    expect(btn, '建议入口必须在场').toBeTruthy();
    expect(btn!.title).toContain('title.keyword');
    btn!.click();
    await new Promise(r => setTimeout(r, 0));
    expect(cur.value.field).toBe('title.keyword');
    expect(cur.value.op).toBe('term');
    expect(cur.value.value).toBe('年度报告');
  });

  it('已是 .keyword / match 全文 / 无子域 → 不出建议', () => {
    expect(mountLeaf(mk({ field: 'title.keyword' })).host.querySelector('.cn-kwfix')).toBeNull();
    expect(mountLeaf(mk({ op: 'match' })).host.querySelector('.cn-kwfix')).toBeNull();
    expect(mountLeaf(mk(), { title: 'text' }).host.querySelector('.cn-kwfix')).toBeNull();
    expect(mountLeaf(mk(), { title: 'keyword', 'title.keyword': 'keyword' }).host.querySelector('.cn-kwfix')).toBeNull();
  });

  it('条件树集成：点建议后 DSL 字段变为 title.keyword', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const r = parseTree({ query: { term: { title: '年度报告' } } });
    if (!r.ok) throw new Error(r.reason);
    const tree = ref<QueryTree>(r.tree);
    const app = createApp({
      render: () => h(QueryTreePane, {
        tree: tree.value, fields: Object.keys(TYPES), types: TYPES,
        'onUpdate:tree': (t: QueryTree) => { tree.value = t; },
      }),
    });
    apps.push(app); app.mount(host);
    await new Promise(r2 => setTimeout(r2, 0));
    host.querySelector<HTMLButtonElement>('.cn-kwfix')!.click();
    await new Promise(r2 => setTimeout(r2, 0));
    expect((serializeTree(tree.value) as any).query).toEqual({ term: { 'title.keyword': '年度报告' } });
  });
});
