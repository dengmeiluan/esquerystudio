/* 1026 批组件契约：低频聚合族 schema 补录——
   ① 建议表扩员（percentile_ranks/significant_terms/sampler 等在 datalist 可选）
   ② percentiles 布尔档/数值档渲染编辑写回；extended_stats sigma 数值档
   ③ field 行扩员（percentiles/extended_stats 等的 field 走 FieldSelect 类型置顶）
   ④ 一致性：schema 键零 field、建议表覆盖 schema 全员 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import AggTreeNode from '../builder/AggTreeNode.vue';
import { AGG_BODY_PARAMS, AGG_OPS } from '../../utils/queryAstOps';
import type { AggNode } from '../../utils/queryAst';

const apps: App[] = [];
function mount(node: AggNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(AggTreeNode, {
      node: cur.value, fields: ['price', 'created'], types: { price: 'double', created: 'date' },
      'onUpdate:node': (n: AggNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const mk = (op: string, body: unknown): AggNode => ({ id: 'a1', name: 'x', op, body, children: [], meta: {}, aggKey: 'aggs' });
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1026 低频聚合族 schema 补录', () => {
  it('percentiles：hdr 布尔档 + compression 数值档渲染；布尔切换写回', async () => {
    const { host, cur } = mount(mk('percentiles', { field: 'price', percents: [50, 95], compression: 100, hdr: false }));
    const cb = host.querySelector<HTMLInputElement>('.agn-body input[type="checkbox"]')!;
    expect(cb, '布尔档在场').toBeTruthy();
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect((cur.value.body as Record<string, unknown>).hdr).toBe(true);
    expect((cur.value.body as Record<string, unknown>).compression).toBe(100);
  });

  it('extended_stats sigma 数值档；significant_terms size 档', async () => {
    const { host, cur } = mount(mk('extended_stats', { field: 'price', sigma: 2 }));
    const inp = [...host.querySelectorAll<HTMLInputElement>('.agn-body input')].find(i => i.value === '2')!;
    inp.value = '3';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect((cur.value.body as Record<string, unknown>).sigma).toBe(3);
    const { host: h2 } = mount(mk('significant_terms', { field: 'price', size: 5 }));
    expect([...h2.querySelectorAll<HTMLInputElement>('.agn-body input')].some(i => i.value === '5')).toBe(true);
  });

  it('field 行扩员：percentiles 的 field 走 FieldSelect', () => {
    const { host } = mount(mk('percentiles', { field: 'price' }));
    expect(host.querySelector('.agn-body .fs-inp'), 'FieldSelect 在场').not.toBeNull();
    expect((host.querySelector('.agn-body .fs-inp') as HTMLInputElement).value).toBe('price');
  });

  it('注册表一致性：建议表覆盖 schema 全员、schema 零 field 键', () => {
    for (const [op, ps] of Object.entries(AGG_BODY_PARAMS)) {
      expect(AGG_OPS[op], op + ' 在建议表').toBeTruthy();
      expect(ps.map(p => p.key), op + ' 无 field 键').not.toContain('field');
    }
    expect(Object.keys(AGG_OPS).length).toBeGreaterThanOrEqual(28);
  });
});
