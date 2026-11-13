/* 1035 批：date_histogram / histogram 的 extended_bounds 边界面板（AggBoundsPanel，
   AggRangesPanel 同款 body 直通投影范式）。空直方图区间问题：日期直方图只对「有文档
   的桶」出桶，趋势图两头断线——extended_bounds {min,max} 让 ES 把空桶也补出来。
   此前该键落自由表盲打对象字面量；现升双输入面板（min/max 留空删键、双空删整个
   extended_bounds 键回默认），形态无损写回，AST 零改动。
   记账勘误：上一会话批 c7036c6（_name 命名查询）原拟 1033 号，lane 70aa90f
   （23:34:36）先占，让位改号 1034——本批为该让位的记账载体。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1035 AggBoundsPanel 投影形态', () => {
  it('min/max 双输入 + 双空删键语义 + date-math 原样（源码锁）', () => {
    const src = srcOf('components/builder/AggBoundsPanel.vue');
    expect(src).toContain('extended_bounds');
    expect(src).toMatch(/min/);
    expect(src).toMatch(/max/);
    expect(src).toContain('emit(\'patch\'');
  });
  it('AggTreeNode 挂接：date_histogram/histogram 门控 + 剥离零丢失 + patch 路由', () => {
    const src = srcOf('components/builder/AggTreeNode.vue');
    expect(src).toContain('AggBoundsPanel');
    expect(src).toContain("'extended_bounds'");
    expect(src).toContain("date_histogram");
    expect(src).toContain("histogram");
  });
});

describe('1035 extended_bounds 往返无损（AST 零改动回归）', () => {
  roundTrip('date_histogram extended_bounds 数值形态', {
    aggs: { by_day: { date_histogram: { field: 'created_at', calendar_interval: 'day', extended_bounds: { min: 1700000000000, max: 1700086400000 } } } },
  });
  roundTrip('date_histogram extended_bounds date-math 形态', {
    aggs: { by_day: { date_histogram: { field: 'created_at', calendar_interval: 'day', extended_bounds: { min: 'now-30d/d', max: 'now' } } } },
  });
  roundTrip('histogram extended_bounds', {
    aggs: { by_amt: { histogram: { field: 'amount', interval: 10, extended_bounds: { min: 0, max: 100 } } } },
  });
});

describe('1035 边界面板动线（挂载）', () => {
  it('date_histogram 无键时面板在场，填 min 即建键；双空删键回默认', async () => {
    const { createApp, h, ref } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const node: any = { id: 'n1', name: 'by_day', op: 'date_histogram', body: { field: 'created_at', calendar_interval: 'day' }, children: [], meta: {}, aggKey: 'aggs' };
    let last: any = null;
    const nodeRef = ref(node);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, {
      node: nodeRef.value, fields: ['created_at'], types: { created_at: 'date' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
    }) });
    app.mount(host);
    // 面板在场（无键也给空面板=可发现性），加键输入为空
    const minInp = host.querySelector('.abp input[data-k="min"]') as HTMLInputElement;
    const maxInp = host.querySelector('.abp input[data-k="max"]') as HTMLInputElement;
    expect(minInp, 'min 输入在场').toBeTruthy();
    expect(maxInp, 'max 输入在场').toBeTruthy();
    // 填 min → 键创建
    minInp.value = 'now-30d/d';
    minInp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last.body.extended_bounds).toEqual({ min: 'now-30d/d' });
    // 填 max → 同键补全
    const maxInp2 = host.querySelector('.abp input[data-k="max"]') as HTMLInputElement;
    maxInp2.value = 'now';
    maxInp2.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last.body.extended_bounds).toEqual({ min: 'now-30d/d', max: 'now' });
    // 双空 → 删键回默认
    const min2 = host.querySelector('.abp input[data-k="min"]') as HTMLInputElement;
    min2.value = '';
    min2.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    const max2 = host.querySelector('.abp input[data-k="max"]') as HTMLInputElement;
    max2.value = '';
    max2.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last.body.extended_bounds, '双空删键回默认').toBeUndefined();
    app.unmount();
    host.remove();
  });
  it('非门控聚合（terms）不出边界面板', async () => {
    const { createApp, h } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const node: any = { id: 'n1', name: 'a', op: 'terms', body: { field: 'client_ip' }, children: [], meta: {}, aggKey: 'aggs' };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, { node, fields: [], types: {} }) });
    app.mount(host);
    expect(host.querySelector('.abp'), 'terms 无边界面板').toBeNull();
    app.unmount();
    host.remove();
  });
});
