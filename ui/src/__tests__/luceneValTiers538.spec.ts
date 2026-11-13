/**
 * 五百三十八批：LuceneInput value 段 boolean/ip 静态候选档看守。
 *
 * SQL 侧先例 sqlCompletion.VAL_FORMAT_HINTS（boolean→true/false、ip→192.168.0.1 静态档）
 * 同语义平移：value 段分档判定在 keyword/date/numeric 三档外补 boolean/ip 两档，hint 的
 * known 判定同步扩档（滤空出「无候选值」提示与既有档同权）。UI 形态零变化：仍走 534 批
 * 锁定的三段 segs 统一渲染（withSegs 同款包装，本件锁数据面不锁渲染）。
 *
 * 源锚口径（luceneInputSplitMark534 同理由）：弹层渲染是 happy-dom Teleport 行为
 * （luceneInput.spec 已覆盖 textContent 等价），静态断言锁「档位数据面」形态契约，不挂 Monaco。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const li = readFileSync(join(SRC, 'components/LuceneInput.vue'), 'utf-8');
/* SQL 先例只读参照（语义平移出处，松锚自证基线，不锁其文案细节） */
const sql = readFileSync(join(SRC, 'utils/sqlCompletion.ts'), 'utf-8');

describe('A boolean/ip 两档静态候选（SQL VAL_FORMAT_HINTS 同语义平移）', () => {
  it('SQL 先例在場（平移基线自证：true/false 字面 + 点分 ip 示例）', () => {
    expect(sql).toContain("'true', 'false'");
    expect(sql).toContain("'192.168.0.1'");
  });

  it('常量表：BOOL_HINTS / IP_HINTS 与 SQL 档同值', () => {
    expect(li).toContain("const BOOL_HINTS = ['true', 'false'];");
    /* 551 同步更新：ip 档补 CIDR 形态档（网段匹配语法，sqlCompletion D1 姊妹面同批对齐）——
       原契约意图保持：'192.168.0.1' 点分示例逐字不动，只增 CIDR 档 */
    expect(li).toContain("const IP_HINTS = ['192.168.0.1', '192.168.0.0/24'];");
  });

  it('items 分档判定补两档：withSegs 同款包装（前缀 startsWith 本地过滤同既有三档）', () => {
    expect(li).toContain("if (t === 'boolean') return BOOL_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain("if (t === 'ip') return IP_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
  });
});

describe('B hint known 判定同步扩档', () => {
  it('boolean/ip 并入 known：滤空出「无候选值」提示与 keyword/date/numeric 同权', () => {
    /* 548 锁同步更新：known 行扩 wildcard/date_nanos 两档（548 D1 约定，值位候选档已 546 齐备，
       滤空提示随档同权）；原契约意图保持——keyword/date/boolean/ip/numeric 五档逐字不动。
       550 同步更新：known 行再补 t === 'text' 档（值位 .keyword 子字段建议 550 约定，
       滤空提示随档同权并附「.keyword 子字段」文案），五档既有内容仍逐字不动。
       552 同步更新：known 行补 t === 'constant_keyword' 档（keyword 族值语义，
       sqlCompletion.KEYWORD_VALUE_TYPES 同族，滤空提示随档同权），既有各档仍逐字不动。
       554 同步更新：known 行收口 KEYWORD_VALUE_TYPES 族表（keyword/wildcard/constant_keyword
       三档经族表在册）+ geo_point 新档随权——原 keyword/date/boolean/ip/numeric 档语义不变。
       560 同步更新：known 行头部补 `s.field === '_exists_'`（值位候选改出字段清单 560 约定，
       滤空提示随权）、尾部补 t === 'version'（静态档 560 约定）——既有各档语义仍不变 */
    expect(li).toContain("const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t) || t === 'date' || t === 'boolean' || t === 'ip' || t === 'date_nanos' || t === 'text' || t === 'geo_point' || t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);");
  });

  it('548 扩档：wildcard/date_nanos 滤空出「无候选值」提示（与既有档同权，known 判定在場）', () => {
    expect(li).toContain("t === 'wildcard'");
    expect(li).toContain("t === 'date_nanos'");
  });

  it('既有三档不回退（keyword terms / date / numeric 分支原样在場）', () => {
    /* 554 同步更新：keyword 本名判定收口 AGG_KEYWORD_TYPES 族表（KEYWORD_VALUE_TYPES 去
       wildcard，constant_keyword 同走 terms-agg）——原 keyword 档行为为族表真子集，不回退。
       561 同步更新：keyword 值位接精确前缀置顶稳定排序（filter 后 sort 后 map，sqlCompletion
       558 先例同款字面）——候选集与 startsWith 过滤口径不变，仅精确命中项置前 */
    expect(li).toContain("if (AGG_KEYWORD_TYPES.includes(t)) return suggestions.value.filter(v => !p || v.toLowerCase().startsWith(p)).sort((a, b) => Number(b.toLowerCase() === p) - Number(a.toLowerCase() === p)).map(withSegs);");
    expect(li).toContain("if (t === 'date') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);");
    expect(li).toContain('if (NUMERIC_TYPES.includes(t)) return NUM_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);');
  });
});
