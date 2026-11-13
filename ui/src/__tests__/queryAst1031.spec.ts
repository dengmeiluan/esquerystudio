/* 1031 批：非常用语法透镜升级两面+一处存量洞修复——①suggester 专属编辑器（term/phrase/
   completion 类型切换 + field 行内 FieldSelect + 类型化具名参数 schema；rest 结构零改动、
   AST 零改动，FsFunctionsPanel 同款投影范式）；②聚合 order 行编辑器（terms 系桶排序
   order: [{"_count":"desc"}]，数组/单键对象两形态无损写回）；③1222 起的面板键剥离丢弃洞
   修复回归锚（自由表编辑丢 ranges/filters/order——挂载实证后收口）。terms 查找形态经实锚
   确认已有 1019 专属编辑器（远程词项三具名输入），本批只加在场锁防回退。全部为「既有零降级
   兜底之上的透镜」，往返无损契约由 AST 层既有测试守护。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';
import { SUGGESTER_TYPES, SUGGESTER_PARAMS } from '../utils/queryAstOps';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1031 suggester 类型注册表', () => {
  it('三型在册且有中文标签（term/phrase/completion）', () => {
    for (const t of ['term', 'phrase', 'completion']) {
      expect(SUGGESTER_TYPES[t], t).toBeDefined();
      expect(String(SUGGESTER_TYPES[t])).not.toBe(t);
    }
  });
  it('类型化具名参数 schema：term 八键 / phrase 核心 / completion 核心（field 走 field-keys 结构位不在册）', () => {
    const keysOf = (t: string) => (SUGGESTER_PARAMS[t] || []).map(p => p.key);
    expect(keysOf('term')).toEqual(expect.arrayContaining([
      'size', 'suggest_mode', 'string_distance', 'max_edits', 'prefix_length', 'min_word_length', 'shard_size',
    ]));
    expect(keysOf('phrase')).toEqual(expect.arrayContaining([
      'size', 'gram_size', 'confidence', 'max_errors',
    ]));
    expect(keysOf('completion')).toEqual(expect.arrayContaining(['size', 'skip_duplicates']));
    expect(keysOf('term')).not.toContain('field');
  });
  it('schema 枚举档 options 非空（GenericParams 下拉直供契约）', () => {
    for (const [t, list] of Object.entries(SUGGESTER_PARAMS)) {
      for (const p of list) if (p.kind === 'enum') expect(p.options?.length, t + ':' + p.key).toBeGreaterThan(0);
    }
  });
});

describe('1031 SuggesterEditor 投影形态', () => {
  it('类型切换保底：已知型单键退役换骨架、未知键保真、自定义形态锁定', () => {
    const src = srcOf('components/builder/SuggesterEditor.vue');
    expect(src).toContain('SUGGESTER_TYPES');
    expect(src).toContain('SUGGESTER_PARAMS');
    // field 行内字段选择器（GenericParams field-keys 机制）
    expect(src).toContain("'field'");
    // 未知型不猜：rest 原样递归表零丢失
    expect(src).toContain('GenericParams');
  });
  it('RootExtrasPane 挂接面板（建议参数位换 SuggesterEditor）', () => {
    const src = srcOf('components/builder/RootExtrasPane.vue');
    expect(src).toContain('SuggesterEditor');
    expect(src).toContain('@update');
  });
});

describe('1031 聚合 order 行编辑器', () => {
  it('AggOrderPanel：数组形态行编辑 + 单键对象形态无损写回 + asc/desc', () => {
    const src = srcOf('components/builder/AggOrderPanel.vue');
    expect(src).toContain('asc');
    expect(src).toContain('desc');
    expect(src).toContain('_count');
    expect(src).toContain('_key');
    // 单键对象形态写回记忆（order: {"_count":"desc"} 不被洗成数组）
    expect(src).toMatch(/objForm|objectForm|isArray/);
  });
  it('AggTreeNode 挂接：桶聚合 order 键路由面板，非投影形态留守自由表（零丢失）', () => {
    const src = srcOf('components/builder/AggTreeNode.vue');
    expect(src).toContain('AggOrderPanel');
    expect(src).toContain("'order'");
    // terms 系桶聚合在册
    for (const op of ['terms', 'date_histogram', 'histogram', 'rare_terms', 'significant_terms']) {
      expect(src, op).toContain("'" + op + "'");
    }
  });
  roundTrip('terms order 数组形态往返', {
    aggs: { by_ip: { terms: { field: 'client_ip', order: [{ _count: 'desc' }] } } },
  });
  roundTrip('terms order 单键对象形态往返', {
    aggs: { by_ip: { terms: { field: 'client_ip', order: { _key: 'asc' } } } },
  });
  roundTrip('terms order 子聚合路径往返', {
    aggs: { by_day: { date_histogram: { field: 'created_at', calendar_interval: 'day', order: [{ daily_sum: 'desc' }] }, aggs: { daily_sum: { sum: { field: 'amount' } } } } },
  });
});

describe('1031 terms 查找形态（1019 专属编辑器在场锁）', () => {
  it('远程词项三具名输入在场（index/id/path——1019 已覆盖，本批实锚防回退）', () => {
    const src = srcOf('components/builder/ClauseNode.vue');
    expect(src).toContain('termsLookup');
    expect(src).toContain('placeholder="索引名 index"');
    expect(src).toContain('placeholder="文档 _id"');
    expect(src).toContain('placeholder="字段路径 path"');
  });
  roundTrip('terms 查找形态往返（对象值）', {
    query: { terms: { order_no: { index: 'orders-lookup', id: '1', path: 'vip_no' } } },
  });
});

describe('1031 面板键零丢失回归（1022 存量洞修复）', () => {
  it('自由表编辑不丢 ranges（挂载实证：改 format 后 ranges 保真）', async () => {
    const { createApp, h } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const node: any = { id: 'n1', name: 'a', op: 'date_range', body: { field: 'ts', format: 'yyyy-MM', ranges: [{ from: 'now-10M/M' }] }, children: [], meta: {}, aggKey: 'aggs' };
    let last: any = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, {
      node, fields: ['ts'], types: { ts: 'date' },
      'onUpdate:node': (n: any) => { last = n; },
    }) });
    app.mount(host);
    const inp = host.querySelector('input[data-path="format"]') as HTMLInputElement;
    expect(inp, 'format 行在自由表').toBeTruthy();
    inp.value = 'yyyy-MM-dd';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last, '应发 update:node').toBeTruthy();
    expect(last.body.format).toBe('yyyy-MM-dd');
    expect(last.body.ranges, 'ranges 不应被自由表编辑丢弃').toEqual([{ from: 'now-10M/M' }]);
    app.unmount();
    host.remove();
  });
  it('order 面板在场时自由表编辑不丢 order（同族守卫）', async () => {
    const { createApp, h } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const node: any = { id: 'n1', name: 'a', op: 'terms', body: { field: 'client_ip', size: 10, order: [{ _count: 'desc' }] }, children: [], meta: {}, aggKey: 'aggs' };
    let last: any = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, {
      node, fields: ['client_ip'], types: { client_ip: 'ip' },
      'onUpdate:node': (n: any) => { last = n; },
    }) });
    app.mount(host);
    const inp = host.querySelector('input[data-path="size"]') as HTMLInputElement;
    expect(inp, 'size 行在自由表（order 已剥离）').toBeTruthy();
    expect(host.querySelector('.aop'), 'order 面板在场').toBeTruthy();
    inp.value = '20';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last.body.size).toBe(20);
    expect(last.body.order, 'order 不应被自由表编辑丢弃').toEqual([{ _count: 'desc' }]);
    app.unmount();
    host.remove();
  });
  it('order 面板行编辑写回：数组形态保数组 + 单键对象形态保对象', async () => {
    const { createApp, h } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const mk = (order: unknown) => ({ id: 'n1', name: 'a', op: 'terms', body: { field: 'client_ip', order }, children: [], meta: {}, aggKey: 'aggs' });
    // 数组形态：改方向仍数组
    const n1 = mk([{ _count: 'desc' }]);
    let last1: any = null;
    const h1 = document.createElement('div'); document.body.appendChild(h1);
    const a1 = createApp({ render: () => h(AggTreeNode as any, { node: n1, fields: [], types: {}, 'onUpdate:node': (n: any) => { last1 = n; } }) });
    a1.mount(h1);
    const dir = h1.querySelector('.aop select') as HTMLSelectElement;
    expect(dir, '方向下拉在场').toBeTruthy();
    dir.value = 'asc';
    dir.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last1.body.order).toEqual([{ _count: 'asc' }]);
    a1.unmount(); h1.remove();
    // 单键对象形态：改方向仍对象（不洗成数组）
    const n2 = mk({ _key: 'asc' });
    let last2: any = null;
    const h2 = document.createElement('div'); document.body.appendChild(h2);
    const a2 = createApp({ render: () => h(AggTreeNode as any, { node: n2, fields: [], types: {}, 'onUpdate:node': (n: any) => { last2 = n; } }) });
    a2.mount(h2);
    const key2 = h2.querySelector('.aop input') as HTMLInputElement;
    expect(key2.value).toBe('_key');
    const dir2 = h2.querySelector('.aop select') as HTMLSelectElement;
    dir2.value = 'desc';
    dir2.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last2.body.order).toEqual({ _key: 'desc' });
    a2.unmount(); h2.remove();
  });
  it('order 清空行 = 删键回默认排序', async () => {
    const { createApp, h } = await import('vue');
    const AggTreeNode = (await import('../components/builder/AggTreeNode.vue')).default;
    const node: any = mkOrder();
    function mkOrder(): any { return { id: 'n1', name: 'a', op: 'terms', body: { field: 'f', order: [{ _count: 'desc' }] }, children: [], meta: {}, aggKey: 'aggs' }; }
    let last: any = null;
    const host = document.createElement('div'); document.body.appendChild(host);
    const app = createApp({ render: () => h(AggTreeNode as any, { node, fields: [], types: {}, 'onUpdate:node': (n: any) => { last = n; } }) });
    app.mount(host);
    const del = host.querySelector('.aop .danger') as HTMLButtonElement;
    expect(del, '删除行按钮在场').toBeTruthy();
    del.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last.body.order, 'order 键删除').toBeUndefined();
    app.unmount(); host.remove();
  });
});
