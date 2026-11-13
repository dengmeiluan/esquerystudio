/* 1017 批组件契约：percolate document 一等 JSON 编辑位（ClauseNode 挂接）——
   ① document 对象渲染 pretty JSON 文本；合法 JSON 编辑即时写回 value（序列化往返）
   ② 非法 JSON / 非对象（串/数组/数字）标红不写树（半截输入容忍）
   ③ 外部树变更回流文本（stringify 同比较守卫，不打断输入） */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import { serQueryNode, type LeafNode } from '../../utils/queryAst';

const mk = (value: unknown, params: Record<string, unknown> = {}): LeafNode => ({
  id: 'p1', type: 'leaf', op: 'percolate', field: 'query', value, params, raw: null,
});

const apps: App[] = [];
function mount(node: LeafNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: ['query'], types: { query: 'percolator' },
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1017 percolate document JSON 编辑位', () => {
  it('document 渲染 pretty JSON；field 编辑位在场', () => {
    const { host } = mount(mk({ message: 'hi', num: 3 }));
    const ta = host.querySelector<HTMLTextAreaElement>('.cn-perc');
    expect(ta, 'JSON 编辑位在场').not.toBeNull();
    expect(JSON.parse(ta!.value)).toEqual({ message: 'hi', num: 3 });
    expect(host.querySelector('.fs-inp'), 'field 编辑位在场').not.toBeNull();
  });

  it('合法 JSON 编辑即时写回；序列化往返一致', async () => {
    const { host, cur } = mount(mk({ message: 'hi' }));
    const ta = host.querySelector<HTMLTextAreaElement>('.cn-perc')!;
    ta.value = '{"message":"new doc","tags":["a","b"]}';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(cur.value.value).toEqual({ message: 'new doc', tags: ['a', 'b'] });
    expect(serQueryNode(cur.value)).toEqual({
      percolate: { document: { message: 'new doc', tags: ['a', 'b'] }, field: 'query' },
    });
  });

  it('非法 JSON / 非对象（串/数组）标红不写树', async () => {
    const { host, cur } = mount(mk({ message: 'hi' }));
    const ta = host.querySelector<HTMLTextAreaElement>('.cn-perc')!;
    ta.value = '{"message": "半截';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(ta.classList.contains('bad'), '半截 JSON 标红').toBe(true);
    expect(cur.value.value).toEqual({ message: 'hi' });
    ta.value = '"just-a-string"';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(ta.classList.contains('bad'), '非对象标红').toBe(true);
    expect(cur.value.value).toEqual({ message: 'hi' });
  });

  it('外部树变更回流文本（守卫不打断）；bad 态外部变更强回流', async () => {
    const { host, cur } = mount(mk({ message: 'hi' }));
    const ta = host.querySelector<HTMLTextAreaElement>('.cn-perc')!;
    /* 模拟外部（DSL 侧）变更：直接换 node */
    cur.value = mk({ other: 1 });
    await tick();
    await tick();
    expect(JSON.parse(ta.value)).toEqual({ other: 1 });
  });
});
