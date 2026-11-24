/**
 * 1199（补充）：onOp 真实切换路径——用挂载 ClauseNode + 键盘走 NSelect 真选算子验证。
 * 之所以不只测纯函数：paramsForOp 的接线点在 ClauseNode.onOp，
 * 纯函数绿不代表 UI 接线对了（本仓库已有"函数对但没接上"的先例）。
 * 算子下拉升档 NSelect 后：options 从挂载实例读取（分组同源），选择走
 * .n-base-selection 的 ↑↓/Enter 键盘路径（happy-dom 下 naive 键盘语义实证可用）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ClauseNode from '../components/builder/ClauseNode.vue';
import type { LeafNode } from '../utils/queryAst';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

const settle = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

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
  await settle(8);
  return cur;
}
const leaf = (p: Partial<LeafNode> = {}): LeafNode => ({
  id: 'l1', type: 'leaf', op: 'match', field: 'title', value: 'x', params: {}, raw: null, ...p,
});

/* 挂载的 NSelect 实例（沿 __vueParentComponent 上溯到 naive Select）→ 分组 options 摊平 */
function flatOps(): string[] {
  let inst: any = (host.querySelector('.cn-op') as any)?.__vueParentComponent;
  while (inst && inst.type?.name !== 'Select') inst = inst.parent;
  const opts: any[] = inst?.props?.options || [];
  return opts.flatMap((o: any) => (o.type === 'group' ? o.children.map((c: any) => c.value) : [o.value]));
}
/* 键盘真选（happy-dom 下 naive 键盘语义实证）：首次 ↓ 只开层（高亮锚定当前值，
   无当前值则锚 0），此后按 目标-锚 差值逐键 ↓/↑，Enter 提交。
   逐键 await：菜单高亮移动要过渲染 tick，连发会被吞。 */
async function pickOp(from: string, to: string) {
  const flat = flatOps();
  const cur = flat.indexOf(from);
  const target = flat.indexOf(to);
  expect(target, `下拉 options 必须含 ${to}`).toBeGreaterThanOrEqual(0);
  const trig = host.querySelector('.cn-op .n-base-selection') as HTMLElement;
  trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await nextTick();
  const anchor = cur >= 0 ? cur : 0;
  const delta = target - anchor;
  for (let i = 0; i < Math.abs(delta); i++) {
    trig.dispatchEvent(new KeyboardEvent('keydown', { key: delta > 0 ? 'ArrowDown' : 'ArrowUp', bubbles: true }));
    await nextTick();
  }
  await settle(2);
  trig.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle(8);
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('1199 换算子接线（真实 UI）', () => {
  it('match→term：operator/fuzziness 被清掉，boost 与 _name 保留', async () => {
    const cur = await mount(leaf({ params: { operator: 'and', fuzziness: 'AUTO', boost: 2, _name: 'nm' } }));
    const trig = host.querySelector('.cn-op .n-base-selection');
    expect(trig, '叶子行必须有算子下拉').toBeTruthy();
    expect(flatOps(), '下拉必须含 term').toContain('term');
    await pickOp('match', 'term');
    await new Promise(r => setTimeout(r, 30));
    expect(cur.value.op).toBe('term');
    expect(cur.value.params, '旧算子非法参数必须清掉、合法的保留').toEqual({ boost: 2, _name: 'nm' });
  });

  it('term→match：保留 boost，丢弃与 match 无关的 case_insensitive 之外项', async () => {
    const cur = await mount(leaf({ op: 'term', params: { boost: 1.5, foo: 'x' } }));
    await pickOp('term', 'match');
    await new Promise(r => setTimeout(r, 30));
    expect(cur.value.op).toBe('match');
    expect(cur.value.params).toEqual({ boost: 1.5 });
  });
});
