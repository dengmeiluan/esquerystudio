/* 1033 批：_name 命名查询全子句透出——所有 ES 查询子句都支持 _name（执行时命中
   归因：响应 matched_queries 回告哪个命名条件命中，复杂查询调试的核心手段），
   此前只能经「更多参数」盲打键名。现参数面板恒建议 _name（NAME_PARAM 单源追加
   到 Clause/Multi/Wrap 三站 schema，配 1032 datalist 可发现性机制），零注册表
   膨胀（不逐算子复制 params 清单）。AST 零改动：_name 落 node.params 直通往返。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';
import { NAME_PARAM } from '../utils/queryAstOps';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1033 NAME_PARAM 单源', () => {
  it('_name 键元在册（text 档）', () => {
    expect(NAME_PARAM.key).toBe('_name');
    expect(NAME_PARAM.kind).toBe('text');
  });
  it('三站 schema 追加接线（Clause/Multi/Wrap）', () => {
    expect(srcOf('components/builder/ClauseNode.vue')).toContain('NAME_PARAM');
    expect(srcOf('components/builder/MultiNodeRow.vue')).toContain('NAME_PARAM');
    expect(srcOf('components/builder/WrapNodeRow.vue')).toContain('NAME_PARAM');
  });
});

describe('1033 _name 往返无损（AST 零改动回归）', () => {
  roundTrip('叶算子 expanded 形态带 _name', { query: { term: { order_no: { value: 'A1', _name: 'vip-check' } } } });
  roundTrip('叶算子 geo_distance 散参数层带 _name', { query: { geo_distance: { distance: '10km', location: '40,-70', _name: 'near' } } });
  roundTrip('bool 内嵌子句带 _name', { query: { bool: { must: [{ exists: { field: 'a', _name: 'has-a' } }] } } });
  roundTrip('wrap 容器带 _name（nested）', { query: { nested: { path: 'items', query: { match_all: {} }, _name: 'n' } } });
  roundTrip('multi 容器带 _name（boosting）', { query: { boosting: { positive: { match_all: {} }, negative: { match_all: {} }, negative_boost: 0.3, _name: 'b' } } });
});

describe('1033 参数面板恒可达（挂载）', () => {
  it('无 schema 算子（match_all）参数钮在场，展开后 datalist 建议 _name，填值回写 params', async () => {
    const { createApp, h, ref } = await import('vue');
    const ClauseNode = (await import('../components/builder/ClauseNode.vue')).default;
    const node: any = { id: 'n1', type: 'leaf', op: 'match_all', field: null, value: {}, params: {}, raw: null };
    let last: any = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    // ref 驱动重渲（真实树=父级替换新节点；静态 prop 不重渲则加键行不现形）
    const nodeRef = ref(node);
    const app = createApp({ render: () => h(ClauseNode as any, {
      node: nodeRef.value, fields: [], types: {},
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
      onRemove: () => {}, onDuplicate: () => {}, onWrap: () => {},
    }) });
    app.mount(host);
    // 参数钮恒在场（_name 建议使 paramSchema 恒非空）
    const btn = host.querySelector('button[aria-label="参数（boost/operator…）"]') as HTMLButtonElement;
    expect(btn, '参数钮恒在场').toBeTruthy();
    btn.click();
    await new Promise(r => setTimeout(r, 30));
    // datalist 建议 _name（1032 机制）
    const dl = host.querySelector('.cn-params datalist') as HTMLDataListElement;
    expect(dl, '加键建议在场').toBeTruthy();
    const opts = Array.prototype.map.call(dl.options, (o: HTMLOptionElement) => o.value);
    expect(opts).toContain('_name');
    // 真实动线：加键（_name）→ 具名行现形 → 填值回写 params
    const add = host.querySelector('.cn-params .gp-add input') as HTMLInputElement;
    add.value = '_name';
    add.dispatchEvent(new Event('input', { bubbles: true }));
    (host.querySelector('.cn-params .gp-add button') as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r, 30));
    const inp = host.querySelector('.cn-params input[data-path="_name"]') as HTMLInputElement;
    expect(inp, '加键后 _name 具名行在场').toBeTruthy();
    inp.value = 'all-docs';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last && last.params && last.params._name, '_name 回写 params').toBe('all-docs');
    app.unmount();
    host.remove();
  });
});
