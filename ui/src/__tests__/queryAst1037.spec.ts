/* 1037 批：composite 聚合 sources 面板（AggCompositePanel，AggOrderPanel/AggRangesPanel
   同款 body 直通投影范式）。复合分桶的多键分组 sources=[{<类型键>:{field,…}}] 此前落
   自由表盲打嵌套字面量；现升行编辑：类型下拉（term/histogram/date_histogram）+ field
   行 FieldSelect + 类型化内参（interval/calendar_interval 等走 GenericParams schema，
   field 行走 field-keys 机制渲染 FieldSelect）。
   形态无损：sources 数组形态恒数组写回；非投影形态（多键源项/非对象项）留守自由表
   零丢失（sourcesShown 门控）。after/size 留自由表（after 是翻页游标对象，自由表
   加键即可编辑）。AST 零改动。 */
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

describe('1037 AggCompositePanel 投影形态', () => {
  it('类型下拉三员 + field 行 FieldSelect + 内参 schema（源码锁）', () => {
    const src = srcOf('components/builder/AggCompositePanel.vue');
    expect(src).toContain('term');
    expect(src).toContain('histogram');
    expect(src).toContain('date_histogram');
    expect(src).toContain('FieldSelect');
    expect(src).toContain('GenericParams');
    expect(src).toContain("'field'");
  });
  it('AggTreeNode 挂接：sources 门控 + 剥离零丢失 + patch 路由', () => {
    const src = srcOf('components/builder/AggTreeNode.vue');
    expect(src).toContain('AggCompositePanel');
    expect(src).toContain('sourcesShown');
    expect(src).toContain("'sources'");
  });
});

describe('1037 composite 往返无损（AST 零改动回归）', () => {
  roundTrip('composite 双源 + size + after', {
    aggs: { by_host_day: {
      composite: {
        size: 100,
        sources: [
          { host: { terms: { field: 'host.keyword' } } },
          { day: { date_histogram: { field: 'created_at', calendar_interval: 'day', format: 'yyyy-MM-dd' } } },
        ],
        after: { host: 'a', day: 1700000000000 },
      },
    } },
  });
  roundTrip('composite histogram 源', {
    aggs: { by_amt: { composite: { sources: [{ amt: { histogram: { field: 'amount', interval: 10 } } }] } } },
  });
});

describe('1037 sources 面板动线（挂载）', () => {
  it('无键时面板给单行骨架；加行/删行写回 sources 数组', async () => {
    const { createApp, h, ref } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const node: any = { id: 'n1', name: 'c', op: 'composite', body: { size: 100 }, children: [], meta: {}, aggKey: 'aggs' };
    let last: any = null;
    const nodeRef = ref(node);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, {
      node: nodeRef.value, fields: ['host.keyword', 'created_at', 'amount'], types: { 'host.keyword': 'keyword', created_at: 'date', amount: 'long' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    // 面板在场（无 sources 也给单行骨架=可发现性），类型下拉默认 term
    const type = host.querySelector('.acp select') as HTMLSelectElement;
    expect(type, '类型下拉在场').toBeTruthy();
    expect(type.value).toBe('term');
    // 加行 → sources 两行
    const addBtn = host.querySelector('.acp-add') as HTMLButtonElement;
    addBtn.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last.body.sources.length).toBe(2);
    expect(Object.keys(last.body.sources[0])[0]).toBe('term');
    // 删首行 → 一行
    const del = host.querySelector('.acp .danger') as HTMLButtonElement;
    del.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last.body.sources.length).toBe(1);
    app.unmount();
    host.remove();
  });
  it('非投影形态（多键源项）不出面板、留守自由表', async () => {
    const { createApp, h } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const node: any = { id: 'n1', name: 'c', op: 'composite', body: { sources: [{ a: { terms: { field: 'f' } }, b: 1 }] }, children: [], meta: {}, aggKey: 'aggs' };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, { node, fields: [], types: {} }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    expect(host.querySelector('.acp'), '非投影形态无面板').toBeNull();
    // 自由表保留 sources 键（键名行 gp-k 在场，零丢失）
    const keyInputs = Array.prototype.map.call(host.querySelectorAll('input.gp-k'), (i: HTMLInputElement) => i.value);
    expect(keyInputs, '自由表保留 sources 键').toContain('sources');
    app.unmount();
    host.remove();
  });
});
