/* 1039 批：长查询串主值多行编辑（query_string/simple_query_string/combined_fields——
   长布尔串单行挤排痛点；换行在查询串语法里=合法空白分隔，AST 零改动）+
   聚合 registry 余量（multi_terms/composite 的 size 具名档，1032 键提示通道覆盖）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';
import { AGG_BODY_PARAMS } from '../utils/queryAstOps';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1039 长查询串多行编辑', () => {
  it('ClauseNode：cn-qry textarea 分支 + LONG_QUERY_OPS 三员在册', () => {
    const src = srcOf('components/builder/ClauseNode.vue');
    expect(src).toContain('cn-qry');
    expect(src).toContain("LONG_QUERY_OPS");
    expect(src).toMatch(/'query_string', 'simple_query_string', 'combined_fields'/);
  });
  it('AGG registry 余量：multi_terms/composite size 具名档', () => {
    expect(AGG_BODY_PARAMS.multi_terms!.map(p => p.key)).toContain('size');
    expect(AGG_BODY_PARAMS.composite!.map(p => p.key)).toContain('size');
  });
  roundTrip('query_string 多行主值往返（换行=空白分隔合法）', {
    query: { query_string: { query: 'status:active\nAND\namount:>100', default_field: 'title' } },
  });
});

describe('1039 挂载动线', () => {
  it('query_string 主值 textarea 多行保真；multi_match 维持单行（对照锚）', async () => {
    const { createApp, h } = await import('vue');
    const ClauseNode = (await import('../components/builder/ClauseNode.vue')).default;
    const multiline = 'status:active\nAND amount:>100';
    // query_string：textarea + 多行值
    let last: any = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const nodeRef = (await import('vue')).ref({ id: 'n1', type: 'leaf', op: 'query_string', field: null, value: multiline, params: { default_field: 'title' }, raw: null });
    const app = createApp({ render: () => h(ClauseNode as any, {
      node: nodeRef.value, fields: ['title'], types: { title: 'text' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
      onRemove: () => {}, onDuplicate: () => {}, onWrap: () => {},
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    const ta = host.querySelector('textarea.cn-qry') as HTMLTextAreaElement;
    expect(ta, 'query_string 主值 textarea 在场').toBeTruthy();
    expect(ta.value).toBe(multiline);
    ta.value = multiline + '\npaid:true';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last && last.value.includes('\npaid:true'), '多行编辑回写保真').toBe(true);
    app.unmount();
    host.remove();
    // 对照锚：multi_match 主值维持单行输入
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const app2 = createApp({ render: () => h(ClauseNode as any, {
      node: { id: 'n2', type: 'leaf', op: 'multi_match', field: null, value: '债券', fields: ['title'], params: {}, raw: null },
      fields: ['title'], types: { title: 'text' },
      'onUpdate:node': () => {}, onRemove: () => {}, onDuplicate: () => {}, onWrap: () => {},
    }) });
    app2.mount(host2);
    await new Promise(r => setTimeout(r, 30));
    expect(host2.querySelector('textarea.cn-qry'), 'multi_match 不出 textarea').toBeNull();
    expect(host2.querySelector('input.cn-val:not(.cn-fields)'), 'multi_match 单行主值在场').toBeTruthy();
    app2.unmount();
    host2.remove();
  });
});
