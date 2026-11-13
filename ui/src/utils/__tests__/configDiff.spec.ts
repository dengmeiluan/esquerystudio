import { describe, it, expect } from 'vitest';
import { diffConfig, diffConfigSummary } from '../configDiff';

const byPath = (rows: ReturnType<typeof diffConfig>) =>
  Object.fromEntries(rows.map(r => [r.path, r.kind]));

const rowAt = (rows: ReturnType<typeof diffConfig>, path: string) =>
  rows.find(r => r.path === path);

/* ---------------------------------------------------------------------------
   真实 ES 6.7.2 (QA 10.64.10.74:9200) 实测样本。
   写入侧是平铺的、数字是数字；读回侧被 index. 包住、标量全字符串化、注入 4 个元数据。
   fixture 必须反映这份形态 —— 用"理想干净对象"当 fixture 等于测一个不存在的世界。
--------------------------------------------------------------------------- */
const REAL_EXPECTED = {
  number_of_shards: 3,
  number_of_replicas: 1,
  refresh_interval: '30s',
  'index.max_result_window': 50000,
  analysis: { analyzer: { my_a: { type: 'custom', tokenizer: 'standard' } } },
};

const REAL_ACTUAL = {
  index: {
    refresh_interval: '30s',
    number_of_shards: '3',
    provided_name: 'r93_cfgdiff',
    max_result_window: '50000',
    creation_date: '1785583507515',
    analysis: { analyzer: { my_a: { type: 'custom', tokenizer: 'standard' } } },
    number_of_replicas: '1',
    uuid: 'kiA7yacfRFOi97DB40Yzag',
    version: { created: '6070299' },
  },
};

describe('diffConfig 基础语义', () => {
  it('两边完全相同 → 全部 same', () => {
    const rows = diffConfig({ a: 1, b: 'x' }, { a: 1, b: 'x' });
    expect(byPath(rows)).toEqual({ a: 'same', b: 'same' });
  });

  it('值不同 → changed，且 expected/actual 都带上', () => {
    const rows = diffConfig({ a: 1 }, { a: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('changed');
    expect(rows[0].expected).toBe(1);
    expect(rows[0].actual).toBe(2);
  });

  it('只在期望侧 → added（业务声明了但 ES 没有，重建后会加上）', () => {
    expect(byPath(diffConfig({ a: 1, b: 2 }, { a: 1 }))).toEqual({ a: 'same', b: 'added' });
  });

  it('只在实际侧 → removed（ES 有但业务不再声明，重建后会消失）', () => {
    expect(byPath(diffConfig({ a: 1 }, { a: 1, b: 2 }))).toEqual({ a: 'same', b: 'removed' });
  });

  it('嵌套对象递归展开为点号路径', () => {
    expect(byPath(diffConfig(
      { properties: { title: { type: 'text' } } },
      { properties: { title: { type: 'keyword' } } },
    ))).toEqual({ 'properties.title.type': 'changed' });
  });

  /* 叶子级而非整棵子树记一行，是刻意的语义统一，不是笔误 —— 别改回 'properties.b'。
     实证依据：ES 注入的 version 在期望侧根本不存在，是纯单侧子树；若单侧子树整棵记一行，
     就会产出 version:'removed'，永远走不到 version.created 的剔除判定，
     Q4 要求剔的 4 条假差异只能剔掉 3 条。见「单侧整棵子树也要下钻到叶子」一例。 */
  it('多层嵌套 + 一侧缺整棵子树（单侧子树展开到叶子）', () => {
    expect(byPath(diffConfig(
      { properties: { a: { type: 'text' }, b: { type: 'long' } } },
      { properties: { a: { type: 'text' } } },
    ))).toEqual({ 'properties.a.type': 'same', 'properties.b.type': 'added' });
  });

  /* 大子树展开的行数是已知且刻意接受的代价：如实产出、呈现交给上层。
     缓解手段在 UI 层（按前缀折叠 / summary 先行），不该让纯函数为观感扭曲语义。
     看到"怎么这么多行"的人请先读这条注释——这是设计决定，不是 bug。 */
  it('单侧大子树按叶子逐行展开（3 层 5 叶 → 5 行 added，不是 1 行）', () => {
    const rows = diffConfig({
      properties: {
        addr: {
          type: 'object',
          properties: {
            city: { type: 'keyword' },
            zip: { type: 'keyword' },
            geo: { type: 'geo_point' },
          },
        },
        age: { type: 'long' },
      },
    }, {});
    expect(rows).toHaveLength(5);
    expect(rows.every(r => r.kind === 'added')).toBe(true);
    expect(rows.map(r => r.path)).toEqual([
      'properties.addr.properties.city.type',
      'properties.addr.properties.geo.type',
      'properties.addr.properties.zip.type',
      'properties.addr.type',
      'properties.age.type',
    ]);
  });

  it('数组按整体比较，不逐元素展开（配置里的数组是有序集合，逐元素 diff 噪声大）', () => {
    expect(byPath(diffConfig({ a: [1, 2] }, { a: [1, 2] }))).toEqual({ a: 'same' });
    expect(byPath(diffConfig({ a: [1, 2] }, { a: [2, 1] }))).toEqual({ a: 'changed' });
  });

  it('null 与缺失要区分开', () => {
    expect(byPath(diffConfig({ a: null }, {}))).toEqual({ a: 'added' });
    expect(byPath(diffConfig({ a: null }, { a: null }))).toEqual({ a: 'same' });
    expect(byPath(diffConfig({ a: null }, { a: 1 }))).toEqual({ a: 'changed' });
  });

  it('对象 vs 标量 → changed，不递归进去', () => {
    expect(byPath(diffConfig({ a: { b: 1 } }, { a: 1 }))).toEqual({ a: 'changed' });
  });

  it('结果按 path 升序，与输入键序无关', () => {
    const rows = diffConfig({ z: 1, a: 1 }, { a: 1, z: 1 });
    expect(rows.map(r => r.path)).toEqual(['a', 'z']);
  });

  it('两边都空 → 空数组', () => {
    expect(diffConfig({}, {})).toEqual([]);
  });

  it('非对象输入不抛（null / 字符串 / 数字）', () => {
    expect(() => diffConfig(null, null)).not.toThrow();
    expect(() => diffConfig('x', 1)).not.toThrow();
  });
});

/* ---------------------------------------------------------------------------
   ① index. 前缀规范化（Q2 裁定：方向 A —— 剥掉）
--------------------------------------------------------------------------- */
describe('规范化①：index. 前缀剥离', () => {
  it('实际侧 index. 包装被剥掉，与平铺的期望侧对齐（不再全量错配）', () => {
    const rows = diffConfig(
      { number_of_shards: 3 },
      { index: { number_of_shards: '3' } },
    );
    expect(byPath(rows)).toEqual({ number_of_shards: 'same' });
  });

  it('期望侧写成 index.xxx 的 dot-key 也被剥掉（人从 ES 复制粘贴的形态）', () => {
    const rows = diffConfig(
      { 'index.max_result_window': 50000 },
      { index: { max_result_window: '50000' } },
    );
    expect(byPath(rows)).toEqual({ max_result_window: 'same' });
  });

  it('剥离只作用于最外层 index.，同名的深层键不受影响', () => {
    const rows = diffConfig(
      { analysis: { analyzer: { index: { type: 'custom' } } } },
      { index: { analysis: { analyzer: { index: { type: 'custom' } } } } },
    );
    expect(byPath(rows)).toEqual({ 'analysis.analyzer.index.type': 'same' });
  });

  it('非 index. 的顶层键原样保留，不被误剥', () => {
    const rows = diffConfig({ analysis: { x: 1 } }, { analysis: { x: 1 } });
    expect(byPath(rows)).toEqual({ 'analysis.x': 'same' });
  });

  it('剥离后撞车不静默合并，产出 conflict 行（同侧同时写 a 与 index.a）', () => {
    const rows = diffConfig(
      { refresh_interval: '30s', 'index.refresh_interval': '60s' },
      { index: { refresh_interval: '30s' } },
    );
    const c = rowAt(rows, 'refresh_interval');
    expect(c?.kind).toBe('conflict');
    /* 两个原始来源都要在 reason 里点名，不许有一个悄悄消失 */
    expect(c?.reason).toContain('refresh_interval');
    expect(c?.reason).toContain('index.refresh_interval');
  });

  it('撞车行两侧原始值都保留下来，人能看到自己写了哪两个', () => {
    const rows = diffConfig({ a: 1, 'index.a': 2 }, { index: { a: 1 } });
    const c = rowAt(rows, 'a');
    expect(c?.kind).toBe('conflict');
    expect(c?.expected).toEqual({ a: 1, 'index.a': 2 });
    /* 实际侧只写了一种形态，没撞车 → actual 侧不该被填 bag */
    expect(c?.actual).toBeUndefined();
  });

  it('撞车但两值相同也仍报 conflict（歧义本身就是问题，不能因值巧合相等而放过）', () => {
    const rows = diffConfig({ a: 1, 'index.a': 1 }, { index: { a: 1 } });
    expect(rowAt(rows, 'a')?.kind).toBe('conflict');
  });

  /* 撞车不是期望侧专属：ES 读回本身就可能同时含 a 与 index.a（如人工改过 settings、
     或两个来源合并过）。实际侧的原始写法同样一个都不许丢——只断言 kind 的话，
     把 actual 整个置为 undefined 也照样绿，等于实际侧的值从未被验证过。 */
  it('实际侧撞车同样产出 conflict，且实际侧两种原始写法都保留', () => {
    const rows = diffConfig({ a: 1 }, { a: 1, 'index.a': 2 });
    const c = rowAt(rows, 'a');
    expect(c?.kind).toBe('conflict');
    expect(c?.actual).toEqual({ a: 1, 'index.a': 2 });
    /* 期望侧没撞车 → 不该凭空编一个 bag 出来 */
    expect(c?.expected).toBeUndefined();
    expect(c?.reason).toContain('实际侧同时写了');
  });

  /* 撞车的两个原始写法不一定都是平铺 dot-key：{ index: { a } } 的嵌套形态贡献的
     origin 也叫 'index.a'，但源对象里并没有这个字面键，值得去 src.index.a 里取。
     这里刻意让两个写法的值不同（嵌套 1 / 平铺 2），于是「漏掉嵌套那支」「取错值」
     「两支值搞反」三种坏实现都会被 toEqual 挡下——只断言键存在是挡不住取错值的。 */
  it('嵌套 { index: { a } } 与平铺 a 撞车时，嵌套侧的值也要按原始写法取出来', () => {
    const rows = diffConfig({ index: { a: 1 }, a: 2 }, { b: 9 });
    const c = rowAt(rows, 'a');
    expect(c?.kind).toBe('conflict');
    expect(c?.expected).toEqual({ 'index.a': 1, a: 2 });
    /* 同一份 fixture 里未撞车的键照常比对，撞车不该污染其他路径 */
    expect(rowAt(rows, 'b')?.kind).toBe('removed');
  });

  it('实际侧嵌套 + 平铺撞车，取值同样走嵌套源', () => {
    const c = rowAt(diffConfig({ b: 9 }, { index: { a: 1 }, a: 2 }), 'a');
    expect(c?.kind).toBe('conflict');
    expect(c?.actual).toEqual({ 'index.a': 1, a: 2 });
  });

  it('两侧同时撞车 → 一行里两侧原始写法各自独立保留', () => {
    const c = rowAt(diffConfig({ index: { a: 1 }, a: 2 }, { a: 3, 'index.a': 4 }), 'a');
    expect(c?.kind).toBe('conflict');
    expect(c?.expected).toEqual({ 'index.a': 1, a: 2 });
    expect(c?.actual).toEqual({ a: 3, 'index.a': 4 });
    expect(c?.reason).toContain('期望侧同时写了');
    expect(c?.reason).toContain('实际侧同时写了');
  });

  /* 撞车键必须从后续 walk 中摘出去，否则同一个 path 会出现两行（conflict + changed/added），
     path 唯一性被破坏、summary 也会多计一条。注意这里必须用 filter 计数：
     rowAt 底层是 find，只取第一条，天然屏蔽重复，重复行它一条都发现不了。 */
  it('撞车键只产出 conflict 一行，不再另外产出 changed/added/removed（path 唯一）', () => {
    const rows = diffConfig({ a: 1, 'index.a': 2 }, { a: 99 });
    expect(rows.filter(r => r.path === 'a')).toHaveLength(1);
    expect(rows.filter(r => r.path === 'a' && r.kind !== 'conflict')).toEqual([]);
    expect(diffConfigSummary(rows)).toEqual({
      added: 0, removed: 0, changed: 0, same: 0, ignored: 0, conflict: 1,
    });
  });

  it('两侧同时撞车时也只有一行（两边都摘干净，不是各出一行）', () => {
    const rows = diffConfig({ index: { a: 1 }, a: 2 }, { a: 3, 'index.a': 4 });
    expect(rows.filter(r => r.path === 'a')).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it('全部 path 互不重复（撞车与正常键混在一起时也成立）', () => {
    const rows = diffConfig(
      { a: 1, 'index.a': 2, b: 5, c: 7 },
      { a: 9, b: 5, d: 8 },
    );
    const paths = rows.map(r => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(byPath(rows)).toEqual({ a: 'conflict', b: 'same', c: 'added', d: 'removed' });
  });
});

/* ---------------------------------------------------------------------------
   ② 标量字符串化等价（Q3 裁定：数字 + 布尔，规范表示，绝不碰数组/对象）
--------------------------------------------------------------------------- */
describe('规范化②：数字/布尔字符串化等价', () => {
  it('数字 vs 其规范十进制字符串 → same', () => {
    expect(byPath(diffConfig({ a: 3 }, { a: '3' }))).toEqual({ a: 'same' });
    expect(byPath(diffConfig({ a: 50000 }, { a: '50000' }))).toEqual({ a: 'same' });
    expect(byPath(diffConfig({ a: 0 }, { a: '0' }))).toEqual({ a: 'same' });
    expect(byPath(diffConfig({ a: -1 }, { a: '-1' }))).toEqual({ a: 'same' });
  });

  it('反向也成立（期望侧字符串、实际侧数字）', () => {
    expect(byPath(diffConfig({ a: '3' }, { a: 3 }))).toEqual({ a: 'same' });
  });

  it('布尔 vs "true"/"false" → same（实测 blocks.write 被字符串化）', () => {
    expect(byPath(diffConfig({ a: true }, { a: 'true' }))).toEqual({ a: 'same' });
    expect(byPath(diffConfig({ a: false }, { a: 'false' }))).toEqual({ a: 'same' });
    expect(byPath(diffConfig({ a: 'false' }, { a: false }))).toEqual({ a: 'same' });
  });

  it('边界：带单位的 "30s" 不等于数字 30', () => {
    expect(byPath(diffConfig({ a: 30 }, { a: '30s' }))).toEqual({ a: 'changed' });
  });

  it('边界：布尔 false 不等于 "0"，也不等于数字 0', () => {
    expect(byPath(diffConfig({ a: false }, { a: '0' }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: false }, { a: 0 }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: true }, { a: '1' }))).toEqual({ a: 'changed' });
  });

  it('边界：非规范表示不等价（"1.0" / " 3" / "" / "+3" / "0x3"）', () => {
    expect(byPath(diffConfig({ a: 1 }, { a: '1.0' }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: 3 }, { a: ' 3' }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: 0 }, { a: '' }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: 3 }, { a: '+3' }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: 3 }, { a: '0x3' }))).toEqual({ a: 'changed' });
  });

  it('边界：NaN / Infinity 不与其字符串等价（不是合法配置值）', () => {
    expect(byPath(diffConfig({ a: NaN }, { a: 'NaN' }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: Infinity }, { a: 'Infinity' }))).toEqual({ a: 'changed' });
  });

  it('值等价（非字符串化失真）：1e5 与 "100000" 判 same', () => {
    expect(byPath(diffConfig({ a: 1e5 }, { a: '100000' }))).toEqual({ a: 'same' });
  });

  it('边界：等价绝不作用于数组（实测 stopwords 数组未被字符串化）', () => {
    expect(byPath(diffConfig({ a: [1] }, { a: ['1'] }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: [1] }, { a: '1' }))).toEqual({ a: 'changed' });
    expect(byPath(diffConfig({ a: [true] }, { a: ['true'] }))).toEqual({ a: 'changed' });
  });

  it('边界：等价绝不作用于对象', () => {
    expect(byPath(diffConfig({ a: { b: 1 } }, { a: { b: '1' } }))).toEqual({ 'a.b': 'same' });
    expect(byPath(diffConfig({ a: 1 }, { a: { b: 1 } }))).toEqual({ a: 'changed' });
  });

  it('边界：null 不与 "null" 等价', () => {
    expect(byPath(diffConfig({ a: null }, { a: 'null' }))).toEqual({ a: 'changed' });
  });

  it('changed 行保留两侧原始值，不被规范化改写（人要看到 ES 真实返回的形态）', () => {
    const r = rowAt(diffConfig({ a: 30 }, { a: '30s' }), 'a');
    expect(r?.expected).toBe(30);
    expect(r?.actual).toBe('30s');
  });

  it('same 行也保留两侧原始值（3 与 "3" 都要看得见）', () => {
    const r = rowAt(diffConfig({ a: 3 }, { a: '3' }), 'a');
    expect(r?.expected).toBe(3);
    expect(r?.actual).toBe('3');
  });
});

/* ---------------------------------------------------------------------------
   ③ ES 注入元数据剔除（Q4 裁定：就这 4 个，且必须可见）
--------------------------------------------------------------------------- */
describe('规范化③：ES 注入元数据剔除且可见', () => {
  /* 七百八十八批改写：原用例锁 ES_GENERATED_KEYS 名单本体（788 刀A 随符号退役）——
     改行为断言保「宁窄勿宽」契约：4 项全 ignored+第 5 键不沾光 */
  it('剔除名单恰好是实测确认的 4 项，不多不少（宁窄勿宽）', () => {
    const rows = diffConfig({}, {
      index: {
        uuid: 'kiA7yacfRFOi97DB40Yzag',
        creation_date: '1785583507515',
        provided_name: 'r93_cfgdiff',
        version: { created: '6070299' },
        number_of_replicas: '2',
      },
    });
    expect(byPath(rows)).toEqual({
      uuid: 'ignored',
      creation_date: 'ignored',
      provided_name: 'ignored',
      'version.created': 'ignored',
      number_of_replicas: 'removed',
    });
  });

  it('4 个注入键归为 ignored，不产生 removed', () => {
    const rows = diffConfig({}, {
      index: {
        uuid: 'kiA7yacfRFOi97DB40Yzag',
        creation_date: '1785583507515',
        provided_name: 'r93_cfgdiff',
        version: { created: '6070299' },
      },
    });
    expect(byPath(rows)).toEqual({
      uuid: 'ignored',
      creation_date: 'ignored',
      provided_name: 'ignored',
      'version.created': 'ignored',
    });
    expect(rows.every(r => r.kind === 'ignored')).toBe(true);
  });

  it('ignored 行不是静默丢弃：带 reason 且保留实际值', () => {
    const rows = diffConfig({}, { index: { uuid: 'abc123' } });
    const r = rowAt(rows, 'uuid');
    expect(r?.actual).toBe('abc123');
    expect(r?.reason).toBeTruthy();
    expect(typeof r?.reason).toBe('string');
  });

  it('每个剔除项的 reason 互不相同（各自说明为什么是 ES 生成的）', () => {
    const rows = diffConfig({}, {
      index: {
        uuid: 'u', creation_date: 'c', provided_name: 'p', version: { created: 'v' },
      },
    });
    const reasons = rows.map(r => r.reason);
    expect(new Set(reasons).size).toBe(4);
  });

  it('version.upgraded 不在名单内，照常参与比对（宁窄勿宽的反向证据）', () => {
    const rows = diffConfig({}, { index: { version: { upgraded: '6070299' } } });
    expect(byPath(rows)).toEqual({ 'version.upgraded': 'removed' });
  });

  it('history_uuid / resize.* 不在名单内，照常参与比对', () => {
    const rows = diffConfig({}, {
      index: { history_uuid: 'h', resize: { source: { name: 's' } } },
    });
    expect(byPath(rows)).toEqual({
      history_uuid: 'removed',
      'resize.source.name': 'removed',
    });
  });

  it('剔除只按剥离后的绝对路径匹配，深层同名键不受影响', () => {
    const rows = diffConfig(
      { analysis: { analyzer: { my_a: { uuid: 'x' } } } },
      { index: { analysis: { analyzer: { my_a: { uuid: 'y' } } } } },
    );
    expect(byPath(rows)).toEqual({ 'analysis.analyzer.my_a.uuid': 'changed' });
  });

  it('期望侧若也声明了注入键，同样归 ignored（比对双方一致剔除）', () => {
    const rows = diffConfig({ uuid: 'mine' }, { index: { uuid: 'theirs' } });
    expect(byPath(rows)).toEqual({ uuid: 'ignored' });
  });

  it('version 下的非 created 子键不被 version.created 规则连坐', () => {
    const rows = diffConfig({}, { index: { version: { created: 'c', upgraded: 'u' } } });
    expect(byPath(rows)).toEqual({
      'version.created': 'ignored',
      'version.upgraded': 'removed',
    });
  });

  it('单侧整棵子树也要下钻到叶子（否则 version.created 的剔除判定永远走不到）', () => {
    const rows = diffConfig({}, { index: { version: { created: 'c' } } });
    expect(byPath(rows)).toEqual({ 'version.created': 'ignored' });
  });

  it('单侧空对象不静默消失，整体记一行（宁可信息少，不可信息假）', () => {
    expect(byPath(diffConfig({ lifecycle: {} }, {}))).toEqual({ lifecycle: 'added' });
    expect(byPath(diffConfig({}, { index: { lifecycle: {} } }))).toEqual({ lifecycle: 'removed' });
  });

  it('单侧深层子树逐叶展开，每个叶子一行', () => {
    expect(byPath(diffConfig({ a: { b: { c: 1, d: 2 } } }, {}))).toEqual({
      'a.b.c': 'added',
      'a.b.d': 'added',
    });
  });
});

/* ---------------------------------------------------------------------------
   ④ ES 默认补全的真实设置 —— 不剔除（第五类，与注入元数据的语义分界）
--------------------------------------------------------------------------- */
describe('ES 默认补全值不剔除', () => {
  it('number_of_replicas 期望侧未声明 + 实际有值 → removed，不被剔除', () => {
    const rows = diffConfig({ number_of_shards: 3 }, {
      index: { number_of_shards: '3', number_of_replicas: '1' },
    });
    expect(byPath(rows)).toEqual({
      number_of_shards: 'same',
      number_of_replicas: 'removed',
    });
  });
});

/* ---------------------------------------------------------------------------
   ⑤ 端到端：真实 ES 样本
--------------------------------------------------------------------------- */
describe('真实 ES 6.7.2 样本端到端', () => {
  const rows = diffConfig(REAL_EXPECTED, REAL_ACTUAL);

  it('四类规范化全部生效后零假差异', () => {
    expect(byPath(rows)).toEqual({
      number_of_shards: 'same',
      number_of_replicas: 'same',
      refresh_interval: 'same',
      max_result_window: 'same',
      'analysis.analyzer.my_a.type': 'same',
      'analysis.analyzer.my_a.tokenizer': 'same',
      creation_date: 'ignored',
      provided_name: 'ignored',
      uuid: 'ignored',
      'version.created': 'ignored',
    });
  });

  it('summary：6 same + 4 ignored，added/removed/changed/conflict 全 0', () => {
    expect(diffConfigSummary(rows)).toEqual({
      added: 0, removed: 0, changed: 0, same: 6, ignored: 4, conflict: 0,
    });
  });

  it('真实漂移仍能被抓到（把分片数从 3 改成 5 → changed）', () => {
    const drift = diffConfig(
      { ...REAL_EXPECTED, number_of_shards: 5 },
      REAL_ACTUAL,
    );
    expect(rowAt(drift, 'number_of_shards')?.kind).toBe('changed');
    expect(diffConfigSummary(drift).changed).toBe(1);
  });

  it('真实漂移仍能被抓到（业务新增声明 → added）', () => {
    const drift = diffConfig(
      { ...REAL_EXPECTED, 'index.blocks.write': true },
      REAL_ACTUAL,
    );
    expect(rowAt(drift, 'blocks.write')?.kind).toBe('added');
  });
});

describe('diffConfigSummary', () => {
  it('分类计数正确', () => {
    const rows = diffConfig({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, d: 4 });
    expect(diffConfigSummary(rows)).toEqual({
      added: 1, removed: 1, changed: 1, same: 1, ignored: 0, conflict: 0,
    });
  });

  it('空输入 → 全 0', () => {
    expect(diffConfigSummary([])).toEqual({
      added: 0, removed: 0, changed: 0, same: 0, ignored: 0, conflict: 0,
    });
  });

  it('ignored 与 conflict 单独计数，不混进 added/removed', () => {
    const rows = diffConfig(
      { a: 1, 'index.a': 2 },
      { index: { a: 1, uuid: 'u' } },
    );
    const s = diffConfigSummary(rows);
    expect(s.ignored).toBe(1);
    expect(s.conflict).toBe(1);
    expect(s.added).toBe(0);
    expect(s.removed).toBe(0);
  });
});
