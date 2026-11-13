/* 1047 批：高级 retriever 三员（pinned / diversify / rescorer）的富编辑位。
   pinned docs/ids、diversify query_vector、rescorer rescore 走专用 JSON 位；
   半截 JSON 只标红不写树，清空=移除结构键。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import RetrieverEditor from '../builder/RetrieverEditor.vue';
import type { RetrieverNode } from '../../utils/queryAst';

const tick = () => new Promise(r => setTimeout(r));

function base(op: string, patch: Partial<RetrieverNode> = {}): RetrieverNode {
  return { id: 'r1', op, query: null, child: null, children: [], childKeys: {}, field: null, value: undefined, hasValue: false, params: {}, ...patch };
}
const std = (): RetrieverNode => ({ id: 'c1', op: 'standard', query: { id: 'q1', type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null }, child: null, children: [], childKeys: {}, field: null, value: undefined, hasValue: false, params: {} });

function mount(node: RetrieverNode, fields: string[] = [], types: Record<string, string> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(RetrieverEditor, {
      node: cur.value, fields, types,
      'onUpdate:node': (n: RetrieverNode) => { cur.value = n; },
    }),
  });
  app.mount(host);
  return { host, cur };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('1047 高级 retriever 编辑位', () => {
  it('pinned：docs/ids 两个 JSON 位，编辑 ids 写回 params 且不丢 docs', async () => {
    const n = base('pinned', { params: { ids: ['a'], docs: [{ _id: 'd1' }] }, child: std() });
    const { host, cur } = mount(n);
    await tick();
    const areas = [...host.querySelectorAll<HTMLTextAreaElement>('.rte-ta')];
    expect(areas.length).toBe(2);
    expect(areas[0].value).toContain('"a"');
    expect(areas[1].value).toContain('"_id": "d1"');
    areas[0].value = '["a","b"]';
    areas[0].dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.params.ids).toEqual(['a', 'b']);
    expect(cur.value.params.docs).toEqual([{ _id: 'd1' }]);
  });

  it('pinned：清空 JSON 位移除该结构键（不发空串给 ES）', async () => {
    const n = base('pinned', { params: { ids: ['a'] }, child: std() });
    const { host, cur } = mount(n);
    await tick();
    const ids = host.querySelector<HTMLTextAreaElement>('.rte-ta')!;
    ids.value = '';
    ids.dispatchEvent(new Event('input'));
    await tick();
    expect('ids' in cur.value.params).toBe(false);
  });

  it('pinned：半截 JSON 标红且不写树', async () => {
    const n = base('pinned', { params: { ids: ['a'] }, child: std() });
    const { host, cur } = mount(n);
    await tick();
    const ids = host.querySelector<HTMLTextAreaElement>('.rte-ta')!;
    ids.value = '["a",';
    ids.dispatchEvent(new Event('input'));
    await tick();
    expect(ids.classList.contains('bad')).toBe(true);
    expect(cur.value.params.ids).toEqual(['a']);
  });

  it('diversify：字段收窄 dense_vector + query_vector JSON + schema 参数', async () => {
    const n = base('diversify', { field: 'emb', params: { type: 'mmr', lambda: 0.7, size: 3, query_vector: [0.1] }, child: std() });
    const { host, cur } = mount(n, ['emb'], { emb: 'dense_vector' });
    await tick();
    expect((host.querySelector('.rte-fs .fs-inp') as HTMLInputElement).value).toBe('emb');
    const vec = host.querySelector<HTMLTextAreaElement>('.rte-ta')!;
    expect(vec.value).toContain('0.1');
    vec.value = '[0.2, 0.3]';
    vec.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.params.query_vector).toEqual([0.2, 0.3]);
    expect(cur.value.params.type).toBe('mmr');
  });

  it('rescorer：rescore JSON 位独立于召回源', async () => {
    const n = base('rescorer', { params: { rescore: { window_size: 50, query: { rescore_query: { match_all: {} } } } }, child: std() });
    const { host, cur } = mount(n);
    await tick();
    const ta = host.querySelector<HTMLTextAreaElement>('.rte-ta')!;
    expect(ta.value).toContain('"window_size": 50');
    ta.value = '{"window_size":10,"query":{"rescore_query":{"match_all":{}}}}';
    ta.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.params.rescore).toEqual({ window_size: 10, query: { rescore_query: { match_all: {} } } });
    expect(cur.value.child?.op).toBe('standard');
  });
});
