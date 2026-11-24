/* 1069：runtime_mappings 字段并轨构建器字段源。
   用户心智：运行时字段是「这次查询现定义、马上就能用」的字段，定义完必须立刻出现在
   条件/排序/聚合/高亮候选里，且不能因「mapping 里没有」被未知字段黄点误报。
   同时守住零猜类型：body.type 缺失/非字符串 → 类型留空，不伪造 keyword。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeRuntimeFields, runtimeFieldItems } from '../runtimeFields';
import { parseTree } from '../queryAst';
import { lintDsl } from '../dslLint';

describe('1069 runtimeFieldItems', () => {
  it('取 name/type，去空名、去首尾空白、同名首次生效', () => {
    expect(runtimeFieldItems([
      { name: 'day_of_week', body: { type: 'keyword', script: { source: "doc['@timestamp'].value.dayOfWeekEnum" } } },
      { name: '  ', body: { type: 'long' } },
      { name: 'day_of_week', body: { type: 'long' } },
      { name: 'age', body: {} },
    ])).toEqual([
      { path: 'day_of_week', type: 'keyword' },
      { path: 'age', type: '' },
    ]);
  });

  it('type 非字符串不猜（数字/数组/缺省一律空类型）', () => {
    expect(runtimeFieldItems([
      { name: 'a', body: { type: 5 } },
      { name: 'b', body: { type: ['long'] } },
      { name: 'c', body: { script: { source: '1' } } },
    ])).toEqual([
      { path: 'a', type: '' },
      { path: 'b', type: '' },
      { path: 'c', type: '' },
    ]);
  });

  it('空/缺省项返回 []', () => {
    expect(runtimeFieldItems(null)).toEqual([]);
    expect(runtimeFieldItems(undefined)).toEqual([]);
    expect(runtimeFieldItems([])).toEqual([]);
  });
});

describe('1069 mergeRuntimeFields', () => {
  const base = [{ path: 'title', type: 'text' }, { path: 'publish_time', type: 'date' }];

  it('无 runtime 项时零增量返回原数组（computed 下游无新数组抖动）', () => {
    expect(mergeRuntimeFields(base, null)).toBe(base);
    expect(mergeRuntimeFields(base, [])).toBe(base);
  });

  it('runtime 字段追加在 mapping 之后，mapping 同名字段优先（ES 禁止 runtime 覆盖已映射字段）', () => {
    const out = mergeRuntimeFields(base, [
      { name: 'publish_time', body: { type: 'keyword' } },
      { name: 'hot_score', body: { type: 'double' } },
    ]);
    expect(out).toEqual([
      { path: 'title', type: 'text' },
      { path: 'publish_time', type: 'date' },
      { path: 'hot_score', type: 'double' },
    ]);
    expect(out[1].type, '同名冲突保留 mapping 类型').toBe('date');
  });

  it('真实 AST 形态贯通：parseTree → runtimeMappings.items → 并入字段源', () => {
    const r = parseTree({
      runtime_mappings: { day: { type: 'keyword', script: { source: 'emit(1)' } } },
      query: { term: { day: 'mon' } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = mergeRuntimeFields(base, r.tree.runtimeMappings?.items);
    expect(out.map(f => f.path)).toEqual(['title', 'publish_time', 'day']);
    expect(out.find(f => f.path === 'day')?.type).toBe('keyword');
  });
});

describe('1069 运行时字段进入 lint 字段表', () => {
  const base = [{ path: 'publish_time', type: 'date' }, { path: 'hot_score', type: 'double' }];
  const rt = [
    { name: 'pub_week', body: { type: 'keyword' } },
    { name: 'hot_scor', body: { type: 'double' } },
  ];
  const doc = {
    runtime_mappings: { pub_week: { type: 'keyword' }, hot_scor: { type: 'double' } },
    query: { range: { pub_week: { gte: 'A' } } },
    sort: ['hot_scor'],
    aggs: { by_hot: { terms: { field: 'hot_scor' } } },
  };

  it('类型规则照常生效：运行时 keyword 的 range 给出 keyword-range', () => {
    expect(lintDsl(doc, { fields: mergeRuntimeFields(base, rt) }).some(f => f.rule === 'keyword-range')).toBe(true);
    expect(lintDsl(doc, { fields: base }).some(f => f.rule === 'keyword-range')).toBe(false);
  });

  it('运行时不因「mapping 里没有」被误报拼写（sort/aggs 名称近似 mapping 也不报）', () => {
    const before = lintDsl(doc, { fields: base });
    expect(before.some(f => f.rule === 'sort-unknown-field' || (f.rule === 'unknown-field' && f.anchor === 'hot_scor'))).toBe(true);
    const after = lintDsl(doc, { fields: mergeRuntimeFields(base, rt) });
    expect(after.some(f => f.rule === 'sort-unknown-field' || (f.rule === 'unknown-field' && f.anchor === 'hot_scor'))).toBe(false);
  });
});

describe('1069 DslQueryView 接线契约', () => {
  const dqSrc = readFileSync(join(__dirname, '../../views/DslQueryView.vue'), 'utf-8');

  it('统一字段源 = mapping 字段 ∪ 树内 runtime_mappings，构建器/补全/lint 三处同源', () => {
    expect(dqSrc).toMatch(
      /const fieldItems = computed\(\(\) => mergeRuntimeFields\(idxFields\.value, queryTree\.value\.runtimeMappings\?\.items\)\);/,
    );
    expect(dqSrc).toMatch(/const builderFields = computed\(\(\) => fieldItems\.value\.map\(f => f\.path\)\);/);
    expect(dqSrc).toMatch(/const builderTypes = computed\(\(\) => Object\.fromEntries\(fieldItems\.value\.map\(f => \[f\.path, f\.type\]\)\)\);/);
    expect(dqSrc).toMatch(/const lintCtx = computed\(\(\) => \(\{ fields: fieldItems\.value \}\)\);/);
    expect(dqSrc).toMatch(/const dslAssist = \{ fields: \(\) => fieldItems\.value,/);
    /* 两处消费（QueryTreePane / RootExtrasPane）都必须吃同一个闭包，禁止旁路 idxFields */
    expect(dqSrc.match(/:fields="builderFields" :types="builderTypes"/g)?.length).toBe(2);
  });
});
