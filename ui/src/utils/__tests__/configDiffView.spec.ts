import { describe, it, expect } from 'vitest';
import { diffConfig } from '../configDiff';
import type { ConfigDiffRow } from '../configDiff';
import { kindLabel, kindNote, parseExpectedMapping, shouldDiffMapping, isBenignDefault } from '../configDiffView';

/* R93-9。本文件的断言全部**由 diffConfig 的真实输出驱动**，不手写 'added'/'removed'
   字面量当输入 —— 手写字面量等于把「我以为的语义」测了一遍，而 C-1/I-4 的病根
   恰恰是「我以为的语义」写反了。让 diffConfig 自己说哪边是 added，才能抓到读反。 */

/** 只在 expected 有：业务声明了但 ES 没有 */
const ONLY_EXPECTED = diffConfig({ properties: { x: { type: 'keyword' } } }, {});
/** 只在 actual 有：ES 有但业务不再声明 */
const ONLY_ACTUAL = diffConfig({}, { properties: { x: { type: 'keyword' } } });

describe('configDiffView / kind 语义（I-4）', () => {
  /* 防的失败模式 X：diffConfig 的 added/removed 方向被读反。
     这两条先把方向钉死在真实输出上，后面的标签断言才有意义。 */
  it('单侧存在时 diffConfig 产出的方向符合契约', () => {
    expect(ONLY_EXPECTED.map(r => r.kind)).toEqual(['added']);
    expect(ONLY_ACTUAL.map(r => r.kind)).toEqual(['removed']);
  });

  /* 防的失败模式 X：KIND_LABEL 里 added / removed 两条人话被对调。
     用 diffConfig 的真实 kind 取标签，再断言标签开头指向正确的一侧。
     不写 expect(kindLabel('added')).toBe(...) —— 那是常量等于自己。 */
  it('added 的人话以「期望有」开头，removed 以「实际有」开头', () => {
    expect(kindLabel(ONLY_EXPECTED[0].kind)).toMatch(/^期望有/);
    expect(kindLabel(ONLY_ACTUAL[0].kind)).toMatch(/^实际有/);
  });

  /* 防的失败模式 X：提示挂载点写反（v-else-if="row.kind === 'removed'"）。
     这是 I-4 点名「常量自等式抓不到」的那一处。
     kindNote 对 added 必须有话说、对 removed 必须闭嘴；两条缺一不可——
     只断言 added 有内容的话，把条件改成 kind !== 'same' 照样通过。 */
  it('「ES 未回报此项」提示只挂在 added，不挂 removed', () => {
    expect(kindNote(ONLY_EXPECTED[0])).toMatch(/ES 未回报此项/);
    expect(kindNote(ONLY_ACTUAL[0])).toBe('');
  });

  /* 防的失败模式 X：新增一个 kind 却忘了配人话，界面直接漏出 raw kind。
     kindLabel 对未知 kind 原样返回，故「标签 === kind 自身」即漏配。 */
  it('六种 kind 全部有人话标签，无一漏配', () => {
    for (const k of ['added', 'removed', 'changed', 'same', 'ignored', 'conflict']) {
      expect(kindLabel(k)).not.toBe(k);
    }
  });

  /* 防的失败模式 X：把 reason 忽略掉，让 ignored/conflict 行显示 added 的那段
     「ES 会丢弃默认值」文案 —— 对着一个只读元数据说这种话是纯噪音。 */
  it('带 reason 的行优先显示 reason', () => {
    const rows = diffConfig({}, { index: { uuid: 'abc' } });
    const ig = rows.find(r => r.kind === 'ignored');
    expect(ig).toBeTruthy();
    expect(kindNote(ig!)).toBe(ig!.reason);
    expect(kindNote(ig!)).not.toMatch(/ES 未回报此项/);
  });
});

describe('configDiffView / 缺席不是空对象（C-1）', () => {
  /* 防的失败模式 X：用 {} 表示「没提供期望」，于是整棵 actual 被判 removed。
     先证明这个危险确实存在（若哪天 diffConfig 改得不再如此，本条会红，
     提醒我们守卫的前提变了），再证明守卫拦住了它。 */
  it('前提：拿空对象去比一棵真实 mapping 会产出满屏 removed', () => {
    const actual = {
      properties: { a: { type: 'keyword' }, b: { type: 'long' }, c: { properties: { d: { type: 'text' } } } },
    };
    const rows = diffConfig({}, actual);
    expect(rows.length).toBe(3);
    expect(rows.every(r => r.kind === 'removed')).toBe(true);
  });

  /* 防的失败模式 X：把「没粘贴」「粘了但 mappingJson 为 null」「空白文本」
     任何一种当成「期望是空对象」。三种都必须是 null（缺席）。 */
  it('未提供 mapping 的三种来源一律判为缺席', () => {
    expect(parseExpectedMapping('')).toBeNull();       // 没粘贴
    expect(parseExpectedMapping(null)).toBeNull();     // mappingJson 为 null
    expect(parseExpectedMapping('   \n ')).toBeNull(); // 空白文本
  });

  /* 防的失败模式 X：坏 JSON 被 catch 成 {}（原 safeParse 的行为），
     等价于凭空造一个空期望 —— 与 C-1 同一个病。 */
  it('坏 JSON 判为缺席而不是空对象', () => {
    expect(parseExpectedMapping('{not json')).toBeNull();
  });

  /* 防的失败模式 X：把数组/标量当 mapping 塞进 diffConfig，
     产出一条 path 为空串的行，界面上是一行没有路径的垃圾。 */
  it('顶层非对象判为缺席', () => {
    expect(parseExpectedMapping('[]')).toBeNull();
    expect(parseExpectedMapping('"x"')).toBeNull();
    expect(parseExpectedMapping('null')).toBeNull();
  });

  /* 防的失败模式 X：守卫写成恒真/恒假。
     「确实提供了空对象 {}」与「缺席」必须分得开：前者是用户真的给了一份空 mapping，
     该比；后者不该比。这条正是「用合法值表示缺席」的分界线。 */
  it('显式提供的空对象是有效期望，与缺席区分', () => {
    const explicit = parseExpectedMapping('{}');
    expect(explicit).toEqual({});
    expect(shouldDiffMapping(explicit)).toBe(true);
    expect(shouldDiffMapping(parseExpectedMapping(''))).toBe(false);
  });

  /* 防的失败模式 X：守卫存在但接反（缺席时反而去比）。
     端到端走一遍 computeDiff 的真实逻辑：缺席 → 零行；有期望 → 有行。 */
  it('缺席时不产出任何 diff 行，有期望时才比对', () => {
    const actual = { properties: { a: { type: 'keyword' } } };
    const absent = parseExpectedMapping('');
    expect(shouldDiffMapping(absent) ? diffConfig(absent, actual) : []).toEqual([]);

    const present = parseExpectedMapping('{"properties":{"a":{"type":"text"}}}');
    const rows = shouldDiffMapping(present) ? diffConfig(present, actual) : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(r => r.kind === 'changed')).toBe(true);
  });
});

const row = (p: string, kind: ConfigDiffRow['kind'], expected: unknown, actual: unknown): ConfigDiffRow =>
  ({ path: p, kind, expected, actual });

describe('isBenignDefault: ES 已知等价默认值噪声', () => {
  it('text 字段 norms=true(期望有实际没有)判为噪声', () => {
    expect(isBenignDefault(row('properties.assetShortName.norms', 'added', true, undefined))).toBe(true);
  });
  it('text 字段 store=false(期望有实际没有)判为噪声', () => {
    expect(isBenignDefault(row('properties.assetShortName.store', 'added', false, undefined))).toBe(true);
  });
  it('doc_values=true 判为噪声', () => {
    expect(isBenignDefault(row('properties.x.doc_values', 'added', true, undefined))).toBe(true);
  });
  it('_class:keyword(实际有期望没有)不是噪声——是 spring-data-es 注入的真差异', () => {
    expect(isBenignDefault(row('properties._class.type', 'removed', undefined, 'keyword'))).toBe(false);
  });
  it('dynamic_templates(实际有期望没有)不是噪声', () => {
    expect(isBenignDefault(row('dynamic_templates', 'removed', undefined, [{}]))).toBe(false);
  });
  it('bondSecondMarketSort.type:long(实际有期望没有)不是噪声', () => {
    expect(isBenignDefault(row('properties.bondSecondMarketSort.type', 'removed', undefined, 'long'))).toBe(false);
  });
  it('norms=false(非默认值)不判为噪声——显式关闭 norms 是有意的', () => {
    expect(isBenignDefault(row('properties.x.norms', 'added', false, undefined))).toBe(false);
  });
  it('changed 行永不判为噪声(两侧都有值不同,必是真差异)', () => {
    expect(isBenignDefault(row('properties.x.type', 'changed', 'text', 'keyword'))).toBe(false);
  });
  it('changed 行即使 leaf 命中 case 也不判噪声(守早返回)', () => {
    expect(isBenignDefault(row('properties.x.norms', 'changed', true, false))).toBe(false);
  });
});

import { partitionDiffRows } from '../configDiffView';

describe('partitionDiffRows: 真差异 vs 等价噪声', () => {
  const rows: ConfigDiffRow[] = [
    row('properties.assetShortName.norms', 'added', true, undefined),   // 噪声
    row('properties.assetShortName.store', 'added', false, undefined),  // 噪声
    row('properties._class.type', 'removed', undefined, 'keyword'),     // 真差异
    row('dynamic_templates', 'removed', undefined, [{}]),               // 真差异
    row('properties.assetCode.type', 'same', 'text', 'text'),           // same,不进区
  ];
  it('真差异区恰好 2 项(_class + dynamic_templates)', () => {
    expect(partitionDiffRows(rows).real.map(r => r.path))
      .toEqual(['properties._class.type', 'dynamic_templates']);
  });
  it('等价噪声区恰好 2 项(norms + store)', () => {
    expect(partitionDiffRows(rows).benign.map(r => r.path))
      .toEqual(['properties.assetShortName.norms', 'properties.assetShortName.store']);
  });
  it('same 行不进任何一区', () => {
    const p = partitionDiffRows(rows);
    expect(p.real.concat(p.benign).some(r => r.kind === 'same')).toBe(false);
  });
});
