/**
 * 1199（补充）：onOp 真实切换路径——用挂载 ClauseNode + 真点算子下拉验证。
 * 之所以不只测纯函数：paramsForOp 的接线点在 ClauseNode.onOp（第 658 行），
 * 纯函数绿不代表 UI 接线对了（本仓库已有"函数对但没接上"的先例）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ClauseNode from '../components/builder/ClauseNode.vue';
import type { LeafNode } from '../utils/queryAst';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mount(seed: LeafNode) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady();
  host = document.createElement('div'); document.body.appendChild(host);
  const cur = ref(seed);
  const app = createApp({
    render: () => h(ClauseNode as any, {
      node: cur.value, fields: ['title', 'tags'], types: { title: 'text', tags: 'keyword' },
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app); app.use(createPinia()); app.use(router); app.mount(host);
  for (let i = 0; i < 6; i++) { await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); }
  return cur;
}
const leaf = (p: Partial<LeafNode> = {}): LeafNode => ({
  id: 'l1', type: 'leaf', op: 'match', field: 'title', value: 'x', params: {}, raw: null, ...p,
});

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('1199 换算子接线（真实 UI）', () => {
  it('match→term：operator/fuzziness 被清掉，boost 与 _name 保留', async () => {
    const cur = await mount(leaf({ params: { operator: 'and', fuzziness: 'AUTO', boost: 2, _name: 'nm' } }));
    const sel = host.querySelector<HTMLSelectElement>('select.cn-op')!;
    expect(sel, '叶子行必须有算子下拉').toBeTruthy();
    expect([...sel.options].map(o => o.value), '下拉必须含 term').toContain('term');
    sel.value = 'term';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(cur.value.op).toBe('term');
    expect(cur.value.params, '旧算子非法参数必须清掉、合法的保留').toEqual({ boost: 2, _name: 'nm' });
  });

  it('term→match：保留 boost，丢弃与 match 无关的 case_insensitive 之外项', async () => {
    const cur = await mount(leaf({ op: 'term', params: { boost: 1.5, foo: 'x' } }));
    const sel = host.querySelector<HTMLSelectElement>('select.cn-op')!;
    sel.value = 'match';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(cur.value.op).toBe('match');
    expect(cur.value.params).toEqual({ boost: 1.5 });
  });
});
