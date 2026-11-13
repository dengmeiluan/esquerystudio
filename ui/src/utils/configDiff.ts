/* 期望索引配置（业务应用声明）vs 实际（ES 现状）的字段级比对。
 与 docDiff.ts 分开实现：那边比的是文档 _source，这边比的是 settings/mapping 配置树。
 数组语义不同（配置里的数组是有序集合，逐元素 diff 噪声大），强行共用两边都别扭。

 === 为什么必须先规范化再比对 ===
 对控制集群 ES 6.7.2 实测：写入一份平铺 settings 再读回，有四类系统性失真，
 不规范化的话每一类都产生假差异，diff 会变成 100% 噪音 ——
 而一个总在喊狼来了的对比工具比没有更糟，人会直接不看它，真实漂移也被一起忽略。

 写入 {"number_of_shards": 3, "refresh_interval": "30s", "index.max_result_window": 50000, ...}
 读回 {"index": {"number_of_shards": "3", "refresh_interval": "30s",
 "max_result_window": "50000", "provided_name": "...",
 "creation_date": "...", "uuid": "...", "version": {"created": "..."}}}

 ① index. 包装 → 不处理则每个键 1 条 added + 1 条 removed（路径全量错配）
 ② 标量字符串化 → 不处理则每个数值/布尔设置都是假 changed
 ③ 注入只读元数据 → 不处理则每个索引恒定 4 条假 removed
 ④ 嵌套 analysis → 实测原样保留，无需处理

 === 贯穿本文件的取舍：宁可信息少，不可信息假；但静默隐藏同样是一种假 ===
 所以被剔除的键不消失，而是产出 kind:'ignored' 的行并附 reason；
 剥前缀撞车不静默合并，而是产出 kind:'conflict' 的行。
 剔除名单宁窄勿宽 —— 名单太宽会藏起真实漂移，那是比噪音更危险的失效方向
 （噪音是误报，藏漏是漏报）。 */

export type ConfigDiffKind =
  | 'added'      // 只在 expected 有：业务声明了但 ES 没有，重建后会加上
  | 'removed'    // 只在 actual 有：ES 有但业务不再声明，重建后会消失
  | 'changed'
  | 'same'
  | 'ignored'    // ES 注入的只读元数据，未参与比对（不是静默丢弃，带 reason）
  | 'conflict';  // 剥 index. 前缀后撞车，期望侧同一逻辑键被写了两次

export interface ConfigDiffRow {
  path: string;
  kind: ConfigDiffKind;
  /** 期望侧（来自业务应用的 @Setting / @Mapping）。始终是规范化前的原始值 */
  expected: unknown;
  /** 实际侧（来自 ES）。始终是规范化前的原始值 */
  actual: unknown;
  /** 仅 ignored / conflict 有：说明为什么没正常参与比对 */
  reason?: string;
}

/**
 * ES 建索引时注入的只读元数据 —— 业务侧不可能声明，留着必然是恒定假 removed。
 * 名单按「剥掉 index. 前缀后的绝对路径」匹配，深层同名键不受影响。
 *
 * 每一项都在控制集群 ES 6.7.2 裸索引（只写 number_of_shards）读回结果中实测确认存在。
 * 刻意不含的（实测在裸索引与带 analysis 索引上均未出现，只在 shrink/split/rollover
 * 后才产生，超出本函数覆盖场景）：history_uuid、resize.*、
 * routing.allocation.initial_recovery.*、version.upgraded。
 *
 * 尤其注意不含 number_of_replicas：它读回形态与元数据相似（未声明却有值），
 * 但语义完全不同 —— 那是 ES 补的**默认值**，是一个真实且重要的设置。
 * 「期望侧没声明、实际是 1」确实是使用者该知道的信息，removed 的语义也准确。
 * 剔掉它才是隐藏真实信息。这条「注入元数据 vs 默认补全值」的分界是名单能保持窄的关键。
 */
const ES_GENERATED: ReadonlyArray<readonly [string, string]> = [
  ['uuid', 'ES 建索引时生成的索引唯一标识，业务侧不可声明'],
  ['creation_date', 'ES 写入的建索引时间戳，每次重建都会变'],
  ['provided_name', 'ES 回显的索引名，是标识不是配置'],
  ['version.created', 'ES 写入的建索引版本号，由集群版本决定'],
];

const IGNORE_REASON = new Map(ES_GENERATED);

/** 缺失哨兵：必须与 undefined / null 区分，否则 { a: null } 与 {} 会被混为一谈 */
const MISSING = Symbol('missing');

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 标量字符串化等价判定。**只对标量生效，绝不碰数组与对象** ——
 * 实测 analysis 里的 stopwords:["a"] 读回仍是数组，没有被字符串化，
 * 若对数组做元素级等价会把 [1] 与 ["1"] 混为一谈，那是凭空造出的宽容。
 *
 * 规则：仅当一侧是 number/boolean、另一侧是 string，且该 string 是该值的
 * **规范表示**（String(v) === s）时判等。于是：
 * 3 ≡ "3" （ES 字符串化失真）
 * true ≡ "true" （同上，实测 blocks.write）
 * 30 ≢ "30s" （带单位，非纯数字）
 * false ≢ "0" （跨类型，不是布尔的规范表示）
 * 1 ≢ "1.0" （String(1) !== "1.0"）
 * 3 ≢ " 3" （有空格，非规范表示）
 *
 * 一个例外口径：1e5 ≡ "100000" 会判 same。它不属于「字符串化失真」而属于
 * **值等价** —— 两者数值确实相等。落在宽容方向而非漏报方向（多判一次 same
 * 只让人少看一条，不会藏起真实漂移），故接受。
 * NaN / Infinity 不参与：String(NaN)==='NaN' 虽成立，但它们不是合法配置值，
 * 显式排除以免把脏数据当成正常等价。
 */
function scalarEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  const pair = (x: unknown, y: unknown): boolean => {
    if (typeof y !== 'string') return false;
    if (typeof x === 'number') return Number.isFinite(x) && String(x) === y;
    if (typeof x === 'boolean') return String(x) === y;
    return false;
  };
  return pair(a, b) || pair(b, a);
}

/**
 * 剥掉最外层 index. 包装，把两种形态统一到平铺路径：
 * { index: { a: 1 } } → { a: 1 } （GET _settings 的嵌套形态）
 * { 'index.a': 1 } → { a: 1 } （人从 ES 复制粘贴的 dot-key 形态）
 * 只剥一层且只在最外层，深层的同名 index 键（如 analysis.analyzer.index）不受影响。
 *
 * 撞车（同侧同时存在 a 与 index.a）不静默合并 —— 静默合并会让其中一个悄悄消失，
 * 正是本波一直在防的「静默丢信息」。撞车键记入 conflicts，由调用方产出 conflict 行。
 */
function stripIndexPrefix(src: Record<string, unknown>): {
  out: Record<string, unknown>;
  conflicts: Map<string, string[]>;
} {
  const out: Record<string, unknown> = {};
  /** 逻辑键 → 贡献它的原始键列表，长度 > 1 即撞车 */
  const origins = new Map<string, string[]>();

  const put = (key: string, val: unknown, origin: string) => {
    const prev = origins.get(key);
    if (prev) prev.push(origin);
    else origins.set(key, [origin]);
    out[key] = val;
  };

  for (const [k, v] of Object.entries(src)) {
    if (k === 'index' && isPlainObject(v)) {
      for (const [ik, iv] of Object.entries(v)) put(ik, iv, `index.${ik}`);
    } else if (k.startsWith('index.') && k.length > 'index.'.length) {
      put(k.slice('index.'.length), v, k);
    } else {
      put(k, v, k);
    }
  }

  const conflicts = new Map<string, string[]>();
  for (const [k, list] of origins) if (list.length > 1) conflicts.set(k, list);
  return { out, conflicts };
}

/** 收集撞车键的所有原始写法及其值，供 conflict 行展示——不许有一个悄悄消失 */
function collectConflictSources(
  src: Record<string, unknown>,
  origins: string[],
): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  for (const o of origins) {
    if (o in src) { bag[o] = src[o]; continue; }
    /* 形如 index.a 但源里是嵌套 { index: { a } } */
    const idx = src['index'];
    const leaf = o.slice('index.'.length);
    if (o.startsWith('index.') && isPlainObject(idx) && leaf in idx) bag[o] = idx[leaf];
  }
  return bag;
}

export function diffConfig(expected: unknown, actual: unknown): ConfigDiffRow[] {
  const rows: ConfigDiffRow[] = [];

  const eObj = isPlainObject(expected) ? expected : null;
  const aObj = isPlainObject(actual) ? actual : null;

  /* 顶层不是对象（null / 字符串 / 数字 / 数组）：整体比一次，不抛 */
  if (!eObj && !aObj) {
    if (!(expected === undefined && actual === undefined)) {
      rows.push({
        path: '',
        kind: scalarEquals(expected, actual) || JSON.stringify(expected) === JSON.stringify(actual)
          ? 'same' : 'changed',
        expected,
        actual,
      });
    }
    return rows;
  }

  const e = stripIndexPrefix(eObj ?? {});
  const a = stripIndexPrefix(aObj ?? {});

  /* 撞车键先落 conflict 行，并从后续比对中摘出去——带歧义的键不该再给出 same/changed
 结论，那等于替人挑了一个写法。歧义本身就是要人先解决的问题，
 故即使两个写法的值恰好相同也仍报 conflict。 */
  const conflicted = new Set<string>([...e.conflicts.keys(), ...a.conflicts.keys()]);
  for (const k of conflicted) {
    const eo = e.conflicts.get(k);
    const ao = a.conflicts.get(k);
    const sides: string[] = [];
    if (eo) sides.push(`期望侧同时写了 ${eo.join(' 与 ')}`);
    if (ao) sides.push(`实际侧同时写了 ${ao.join(' 与 ')}`);
    rows.push({
      path: k,
      kind: 'conflict',
      expected: eo ? collectConflictSources(eObj ?? {}, eo) : undefined,
      actual: ao ? collectConflictSources(aObj ?? {}, ao) : undefined,
      reason: `${sides.join('；')}，剥离 index. 前缀后指向同一个键，未比对`,
    });
  }

  const walk = (l: unknown, r: unknown, prefix: string): void => {
    /* MISSING 侧不能退化成 {}：那样「整棵子树缺失」与「空对象」就分不开了。
 下面用 lAbsent/rAbsent 显式记住哪一侧压根不存在。 */
    const lAbsent = l === MISSING;
    const rAbsent = r === MISSING;
    const lo = isPlainObject(l) ? l : {};
    const ro = isPlainObject(r) ? r : {};
    const keys = new Set([...Object.keys(lo), ...Object.keys(ro)]);

    for (const k of keys) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (!prefix && conflicted.has(k)) continue;

      const reason = IGNORE_REASON.get(p);
      if (reason) {
        rows.push({
          path: p,
          kind: 'ignored',
          expected: k in lo ? lo[k] : undefined,
          actual: k in ro ? ro[k] : undefined,
          reason,
        });
        continue;
      }

      const lv = !lAbsent && k in lo ? lo[k] : MISSING;
      const rv = !rAbsent && k in ro ? ro[k] : MISSING;

      if (lv === MISSING) {
        /* 单侧子树也要继续下钻，否则 { version: { created } } 会整棵记成一条
 version:'removed'，永远走不到 version.created 的剔除判定，
 4 条假 removed 就少剔了一条。下钻后路径也统一到叶子级。 */
        if (isPlainObject(rv) && Object.keys(rv).length) walk(MISSING, rv, p);
        else rows.push({ path: p, kind: 'removed', expected: undefined, actual: rv });
      } else if (rv === MISSING) {
        if (isPlainObject(lv) && Object.keys(lv).length) walk(lv, MISSING, p);
        else rows.push({ path: p, kind: 'added', expected: lv, actual: undefined });
      } else if (isPlainObject(lv) && isPlainObject(rv)) {
        walk(lv, rv, p);
      } else {
        /* 数组与对象一律整体比较（JSON 等价即 same）；标量额外走字符串化等价。
 两侧原始值原样带出，不被规范化改写——人要看到 ES 真实返回的形态。 */
        const same = JSON.stringify(lv) === JSON.stringify(rv) || scalarEquals(lv, rv);
        rows.push({ path: p, kind: same ? 'same' : 'changed', expected: lv, actual: rv });
      }
    }
  };

  walk(e.out, a.out, '');
  return rows.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
}

export function diffConfigSummary(rows: ConfigDiffRow[]): {
  added: number; removed: number; changed: number; same: number;
  ignored: number; conflict: number;
} {
  const out = { added: 0, removed: 0, changed: 0, same: 0, ignored: 0, conflict: 0 };
  for (const r of rows) out[r.kind] += 1;
  return out;
}
