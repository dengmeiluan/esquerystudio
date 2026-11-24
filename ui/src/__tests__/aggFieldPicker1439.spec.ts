/**
 * 1439：聚合节点的字段键必须给字段选择器，而不是裸文本输入。
 *
 * 与 nested.path（1222）同一类「同一件事两种待遇」：官方体就是 {field} 的聚合，
 * 若没登记进 FIELD_BODY_AGGS，同屏 terms 有选择器、categorize_text 却是手打。
 * 本批补 categorize_text 与 diversified_sampler（field 可选，没这个键时不凭空加行）。
 *
 * 判据：挂载真实 AggTreeNode，看 body 里出现 FieldSelect 的输入（.fs-inp）；
 * 负控用一个不该有字段键的聚合（children，键是 type）确认判据不是恒真。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';
import AggTreeNode from '../components/builder/AggTreeNode.vue';
import type { AggNode } from '../utils/queryAst';

const FIELDS = ['title', 'message', 'author', 'status', 'amount'];
const TYPES: Record<string, string> = { title: 'text', message: 'text', author: 'keyword', status: 'keyword', amount: 'long' };

const apps: App[] = [];
async function settle(n = 5) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

function mountAgg(op: string, body: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const node: AggNode = { id: 'a1', name: 'agg_1', op, body, children: [], meta: {}, aggKey: 'aggs' };
  const app = createApp({ render: () => h(AggTreeNode, { node, fields: FIELDS, types: TYPES }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  return host;
}

describe('1439 聚合字段键有字段选择器', () => {
  it('categorize_text / diversified_sampler 的 field 行走 FieldSelect', async () => {
    for (const [op, field] of [['categorize_text', 'message'], ['diversified_sampler', 'author']] as Array<[string, string]>) {
      const el = mountAgg(op, { field });
      await settle();
      const hasPicker = !!el.querySelector('.agn-body .fs-inp');
      const pickerVal = el.querySelector('.agn-body .fs-inp')?.getAttribute('value') ?? (el.querySelector('.agn-body .fs-inp') as HTMLInputElement | null)?.value;
      expect(hasPicker, `${op} 的 field 行必须是字段选择器`).toBe(true);
      expect(pickerVal, `${op} 选择器应显示当前字段`).toBe(field);
    }
  });

  it('负控：不该有字段键的聚合（children，键是 type）不出现选择器', async () => {
    const el = mountAgg('children', { type: 'reply' });
    await settle();
    expect(el.querySelector('.agn-body .fs-inp'), 'children 不该出现字段选择器').toBeNull();
  });

  it('负控：body 里没有 field 键时不凭空加一行（diversified_sampler 可无 field）', async () => {
    const el = mountAgg('diversified_sampler', { shard_size: 200 });
    await settle();
    expect(el.querySelector('.agn-body .fs-inp'), '没有 field 键就不该有选择器行').toBeNull();
  });
});
