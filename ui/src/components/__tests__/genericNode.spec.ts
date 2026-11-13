import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import GenericNode from '../builder/GenericNode.vue';
import type { LeafNode } from '../../utils/queryAst';

const mk = (): LeafNode => ({
  id: 'g1', type: 'leaf', op: 'script_score', field: null, value: null, params: {},
  raw: { query: { match_all: {} }, script: { source: 'return 1;', params: { factor: 1.2 } } },
});

beforeEach(() => { document.body.innerHTML = ''; });

describe('GenericNode（零降级通用结构化节点）', () => {
  it('递归渲染嵌套对象为子行', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const node = ref(mk());
    createApp({ render: () => h(GenericNode, { node: node.value, 'onUpdate:node': (n: LeafNode) => { node.value = n; } }) }).mount(host);
    const text = host.textContent || '';
    expect(text).toContain('script_score');
    expect(text).toContain('query');
    expect(text).toContain('script');
  });
  it('编辑标量值 emit 新 raw', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const node = ref(mk());
    createApp({ render: () => h(GenericNode, { node: node.value, 'onUpdate:node': (n: LeafNode) => { node.value = n; } }) }).mount(host);
    const inp = host.querySelector('textarea[data-path="script.source"]') as HTMLTextAreaElement;
    expect(inp).not.toBeNull();
    inp.value = 'return 2;';
    inp.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect((node.value.raw as any).script.source).toBe('return 2;');
    expect((node.value.raw as any).script.params.factor).toBe(1.2);   // 其余不动
  });
  it('数组子表编辑后仍为数组（防退化对象）', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const n = ref<LeafNode>({ id: 'g2', type: 'leaf', op: 'my_op', field: null, value: null, params: {}, raw: { tags: ['a', 'b'] } });
    createApp({ render: () => h(GenericNode, { node: n.value, 'onUpdate:node': (x: LeafNode) => { n.value = x; } }) }).mount(host);
    const inp = host.querySelector('input[data-path="tags.0"]') as HTMLInputElement;
    expect(inp).not.toBeNull();
    inp.value = 'c';
    inp.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    const tags = (n.value.raw as any).tags;
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toEqual(['c', 'b']);
  });
  it('renameKey 碰撞已有键名时拒绝（不丢行）', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const n = ref<LeafNode>({ id: 'g3', type: 'leaf', op: 'my_op', field: null, value: null, params: {}, raw: { a: 1, b: 2 } });
    createApp({ render: () => h(GenericNode, { node: n.value, 'onUpdate:node': (x: LeafNode) => { n.value = x; } }) }).mount(host);
    const keyInp = host.querySelector('input[data-path]')!.closest('.gp')!.querySelector('.gp-k') as HTMLInputElement;
    keyInp.value = 'b';
    keyInp.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r));
    expect(Object.keys(n.value.raw as any).sort()).toEqual(['a', 'b']);   // 两键都在
  });
});
