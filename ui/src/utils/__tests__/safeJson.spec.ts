import { describe, it, expect } from 'vitest';
import { quoteBigInts, parseJsonSafe, readStoredJson } from '../safeJson';

/* R87：JSON 长整型精度保真契约——19 位雪花 ID 经原生 JSON.parse 尾数抹零是数据污染级
   缺陷（读出→编辑→回写全链路失真），此处逐条锁死安全边界与字符串跳过语义。 */

describe('parseJsonSafe 精度保真', () => {
  it('19 位雪花 jobId 不失真（原生 parse 的失真反例先立此存照）', () => {
    const raw = '{"jobId":2018093000000045397}';
    /* 注意：源码里的数字字面量同样会被 JS 截断，必须与字符串比对才能暴露失真 */
    expect(String(JSON.parse(raw).jobId)).not.toBe('2018093000000045397'); // 原生必失真（尾数抹零）
    expect(parseJsonSafe(raw).jobId).toBe('2018093000000045397'); // 保真为字符串，一位不丢
  });

  it('负数长整型同样保真', () => {
    expect(parseJsonSafe('{"v":-9223372036854775807}').v).toBe('-9223372036854775807');
  });

  it('MAX_SAFE_INTEGER 边界：9007199254740991 保持 number，+1 转字符串', () => {
    expect(parseJsonSafe('{"a":9007199254740991}').a).toBe(9007199254740991);
    expect(parseJsonSafe('{"a":9007199254740992}').a).toBe('9007199254740992');
  });

  it('16 位但未超界的整数保持 number（长度相同走字典序比较）', () => {
    expect(parseJsonSafe('{"a":1234567890123456}').a).toBe(1234567890123456);
  });

  it('常规数值零干扰：毫秒时间戳/计数/小数/科学计数原样', () => {
    const r = parseJsonSafe('{"ts":1753795200000,"n":42,"f":3.14,"e":1.2e30,"neg":-0.5}');
    expect(r.ts).toBe(1753795200000);
    expect(r.n).toBe(42);
    expect(r.f).toBe(3.14);
    expect(r.e).toBe(1.2e30);
    expect(r.neg).toBe(-0.5);
  });

  it('长整数打头的小数不误引号（如 19 位数字后跟小数点）', () => {
    expect(parseJsonSafe('{"f":2018093000000045397.5}').f).toBe(2018093000000045397.5);
  });

  it('字符串内部的数字绝不误改（含转义引号）', () => {
    const raw = '{"s":"id=2018093000000045397","q":"he said \\"9007199254740993\\""}';
    const r = parseJsonSafe(raw);
    expect(r.s).toBe('id=2018093000000045397');
    expect(r.q).toBe('he said "9007199254740993"');
  });

  it('数组与深层嵌套中的长整型全部保真', () => {
    const r = parseJsonSafe('{"hits":[{"_id":9223372036854775001},{"_id":9223372036854775002}]}');
    expect(r.hits[0]._id).toBe('9223372036854775001');
    expect(r.hits[1]._id).toBe('9223372036854775002');
  });
});

describe('quoteBigInts 快速通道', () => {
  it('无 16 位以上整数时原文返回（引用同一实例，零开销）', () => {
    const raw = '{"a":1,"b":"x","ts":1753795200000}';
    expect(quoteBigInts(raw)).toBe(raw);
  });

  it('字符串里的长数字触发慢通道但输出不变', () => {
    const raw = '{"s":"2018093000000045397"}';
    expect(quoteBigInts(raw)).toBe(raw);
  });
});

/* 851 批：存储通道防御性读取单源（G85 同族余量清扫）。
   病灶家族：组件挂载期裸 `JSON.parse(localStorage.getItem(k) || '[]')`——用户手改/
   旧版残留的脏值让 parse 抛错，setup 顶层即崩（SideNav 是全站导航件，崩=白屏级）。
   726 G85 已修 useTablePrefs.restoreCols 单点并立法「parse 不抛不代表形态对」；
   本单源把「坏 JSON 回落 + 形态校验回落」收编为可复用原语，消费点=851 三处
   （CmdPalette es_cmd_recent / SideNav nav.collapsed / RestView es_rest_hist）。 */
describe('readStoredJson 存储通道防御读取', () => {
  const mem = (v: string | null) => ({ getItem: (_k: string) => v });

  it('合法 JSON 且形态过校验 → 原值返回', () => {
    expect(readStoredJson(mem('["a","b"]'), 'k', [], Array.isArray)).toEqual(['a', 'b']);
  });

  it('坏 JSON（parse 抛错）→ 回落 fallback', () => {
    expect(readStoredJson(mem('{"a":'), 'k', ['x'], Array.isArray)).toEqual(['x']);
  });

  it('合法 JSON 但形态不符（对象冒充数组）→ 回落 fallback（G85 立法：parse 不抛不代表形态对）', () => {
    expect(readStoredJson(mem('{"evil":1}'), 'k', ['d'], Array.isArray)).toEqual(['d']);
  });

  it('键缺失（getItem 返回 null）→ 回落 fallback', () => {
    expect(readStoredJson(mem(null), 'k', { n: 1 }, () => true)).toEqual({ n: 1 });
  });

  it('形态校验缺省 = 恒真（任何合法 JSON 原样返回）', () => {
    expect(readStoredJson(mem('42'), 'k', 0)).toBe(42);
  });

  it('对象形态校验范式：非对象/数组冒充对象一律回落（SideNav collapsed 消费形态）', () => {
    const isRecord = (v: any) => v != null && typeof v === 'object' && !Array.isArray(v);
    expect(readStoredJson(mem('[1,2]'), 'k', {}, isRecord)).toEqual({});
    expect(readStoredJson(mem('"str"'), 'k', {}, isRecord)).toEqual({});
    expect(readStoredJson(mem('null'), 'k', {}, isRecord)).toEqual({});
    expect(readStoredJson(mem('{"g":true}'), 'k', {}, isRecord)).toEqual({ g: true });
  });
});
