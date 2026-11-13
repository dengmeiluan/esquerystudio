/* 1040 批：bool 组具名参数 schema——minimum_should_match（数值/百分比两形态，text 档
   不约束）与 boost（全组加权）此前只能盲打键名；BOOL_PARAMS 单源挂接组参数面板后，
   1032 schema 键提示自动建议未入体键，具名行升类型化控件。AST 零改动。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';
import { BOOL_PARAMS } from '../utils/queryAstOps';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1040 BOOL_PARAMS schema', () => {
  it('minimum_should_match（text 不约束）+ boost（number）在册', () => {
    const keys = BOOL_PARAMS.map(p => p.key);
    expect(keys).toEqual(expect.arrayContaining(['minimum_should_match', 'boost']));
    expect(BOOL_PARAMS.find(p => p.key === 'minimum_should_match')!.kind).toBe('text');
    expect(BOOL_PARAMS.find(p => p.key === 'boost')!.kind).toBe('number');
  });
  it('BoolGroupNode 组参数面板挂接 schema', () => {
    const src = srcOf('components/builder/BoolGroupNode.vue');
    expect(src).toContain('BOOL_PARAMS');
  });
  roundTrip('bool minimum_should_match 百分比形态', {
    query: { bool: { should: [{ match: { title: '债券' } }], minimum_should_match: '75%' } },
  });
  roundTrip('bool boost 形态', {
    query: { bool: { must: [{ term: { status: 'active' } }], boost: 2 } },
  });
});

describe('1040 组参数面板动线（挂载）', () => {
  it('展开组参数→加键建议含 minimum_should_match→加键填值回写 params→DSL', async () => {
    const { createApp, h } = await import('vue');
    const BoolGroupNode = (await import('../components/builder/BoolGroupNode.vue')).default;
    const node: any = { id: 'b0', type: 'bool', children: [
      { occur: 'should', node: { id: 's1', type: 'leaf', op: 'match', field: 'title', value: '债券', params: {}, raw: null } },
    ], params: {}, arrForm: {} };
    let last: any = null;
    const nodeRef = (await import('vue')).ref(node);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(BoolGroupNode as any, {
      node: nodeRef.value, fields: ['title'], types: { title: 'text' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
      onRemove: () => {}, onWrap: () => {}, onDuplicate: () => {},
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    // 展开组参数
    const btn = host.querySelector('button[aria-label="组参数（minimum_should_match / boost 等）"]') as HTMLButtonElement;
    expect(btn, '组参数钮在场').toBeTruthy();
    btn.click();
    await new Promise(r => setTimeout(r, 30));
    // 加键建议含两员
    const dl = host.querySelector('.bgn-params datalist') as HTMLDataListElement;
    expect(dl, '加键建议在场').toBeTruthy();
    const opts = Array.prototype.map.call(dl.options, (o: HTMLOptionElement) => o.value);
    expect(opts).toEqual(expect.arrayContaining(['minimum_should_match', 'boost']));
    // 加 minimum_should_match 填 75%
    const add = host.querySelector('.bgn-params .gp-add input') as HTMLInputElement;
    add.value = 'minimum_should_match';
    add.dispatchEvent(new Event('input', { bubbles: true }));
    (host.querySelector('.bgn-params .gp-add button') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 30));
    const inp = host.querySelector('.bgn-params input[data-path="minimum_should_match"]') as HTMLInputElement;
    expect(inp, '具名行在场').toBeTruthy();
    inp.value = '75%';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last && last.params && last.params.minimum_should_match).toBe('75%');
    app.unmount();
    host.remove();
  });
});
