/**
 * 1183：主值键缺席的行内说明。
 *
 * 真实现场：把 `{percolate:{field:"q", id:"1"}}` 或 `{knn:{field:"v", query_vector_builder:{…}}}`
 * 粘进构建器，条件行里「值位」是空的——因为这两种写法本来就没有 document / query_vector。
 * 树是对的（往返无损），但界面上没有任何说明：用户会以为值没解析出来，
 * 或者往空位补一个主值——percolate 同时出现 id 与 document，ES 直接 400。
 *
 * 锁：① 缺席时出说明（点名缺哪个主值键 + 列出真正在用的键）；
 *     ② 正常写法不出（不能变成每行都挂一条噪音）；
 *     ③ 说明是纯信息（不写树、不改值）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import ClauseNode from '../components/builder/ClauseNode.vue';
import { parseQueryNode, serQueryNode } from '../utils/queryAst';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;
const FIELDS = ['q', 'v', 'title', 'status'];
const TYPES = { q: 'percolator', v: 'dense_vector', title: 'text', status: 'keyword' };

async function mountBody(body: any) {
  const node = parseQueryNode(body);
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(ClauseNode as any, { node, fields: FIELDS, types: TYPES }) });
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
  return node;
}
const hint = () => host.querySelector('.cn-mainabs') as HTMLElement | null;

afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1183 主值键缺席说明', () => {
  it('percolate 给 id：点名 document 缺席，并列出在用的 id 键', async () => {
    const node = await mountBody({ percolate: { field: 'q', id: '1' } }) as any;
    expect(node.hasMain, '前置：解析必须记住主值键缺席').toBe(false);
    const h = hint();
    expect(h, '缺席时必须出说明').toBeTruthy();
    expect(h!.textContent).toContain('document');
    expect(h!.textContent).toContain('id');
    expect(h!.textContent).toContain('值位留空是原 DSL 使然');
    /* 纯信息：不写树 */
    expect(serQueryNode(node)).toEqual({ percolate: { field: 'q', id: '1' } });
  });

  it('knn 用 query_vector_builder：点名 query_vector 缺席', async () => {
    const node = await mountBody({ knn: { field: 'v', k: 5, query_vector_builder: { text_embedding: { model_id: 'm', model_text: 'x' } } } }) as any;
    expect(node.hasMain).toBe(false);
    expect(hint()!.textContent).toContain('query_vector');
    expect(hint()!.textContent).toContain('query_vector_builder');
    expect(serQueryNode(node)).toEqual({ knn: { field: 'v', k: 5, query_vector_builder: { text_embedding: { model_id: 'm', model_text: 'x' } } } });
  });

  it('正常写法不出说明（term / 带 document 的 percolate）', async () => {
    await mountBody({ term: { status: 'ACTIVE' } });
    expect(hint(), 'term 是字段形态，没有主值键这一说').toBeNull();
    document.body.innerHTML = '';
    await mountBody({ percolate: { field: 'q', document: { a: 1 } } });
    expect(hint(), '给了 document 就不该提示缺席').toBeNull();
  });

  it('负控：把说明的判据改错（恒 true）会污染正常行——这里锁住「只在缺席时出」', async () => {
    await mountBody({ term: { status: 'ACTIVE' } });
    const normal = hint();
    document.body.innerHTML = '';
    await mountBody({ ids: { values: ['1'] } });
    /* ids 主值键 values 存在 → 也不出 */
    expect(normal).toBeNull();
    expect(hint()).toBeNull();
  });
});
