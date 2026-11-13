/**
 * 一千四百三十二批：「双逗号删一」不能再删进字符串里。
 *
 * 515/513 的自动修复会**改写用户的 DSL**，改错的代价比不修更大。
 * 实测原实现是 `line.indexOf(',,')`：
 *  ① `{"a":"x,,y",,}` 会命中**字符串内部**的 `,,`，把逗号删进字符串里 —— 改坏数据；
 *  ② 同一行有两处 `,,` 时取第一处，而 marker 指的是出错的第二处。
 *
 * 修法：只认字符串外部（跳过 `\"` 转义）的 `,,`，并取离 marker 列最近的那个。
 * 抽象成纯函数 nearestDoubleCommaOutsideString，直接单测边界。
 */
import { describe, it, expect } from 'vitest';
import { nearestDoubleCommaOutsideString as find } from '../utils/monacoJsonQuickFix';

describe('1432 双逗号定位（字符串感知）', () => {
  it('① 跳过字符串内部的 ,,（旧实现会删坏数据）', () => {
    const line = '{"a":"x,,y",,}';
    const idx = find(line, 13);
    expect(idx, '必须命中字符串外那处').toBe(11);
    /* 自证：删掉 idx 起两个字符后，字符串仍完整 */
    const fixed = line.slice(0, idx) + ',' + line.slice(idx + 2);
    expect(fixed).toBe('{"a":"x,,y",}');
    expect(fixed).toContain('"x,,y"');
  });

  it('② 只有字符串内部有 ,, → 不提供修复点（-1）', () => {
    expect(find('{"a":"x,,y"}', 5)).toBe(-1);
    expect(find('{"note":"a,,b,,c"}', 1)).toBe(-1);
  });

  it('③ 多处 ,, 时取离 marker 最近的那一处', () => {
    const line = '{"a":1,,"b":2,,"c":3}';
    /* 两处：idx 6 与 idx 13 */
    expect(find(line, 7)).toBe(6);
    expect(find(line, 14)).toBe(13);
  });

  it('④ 转义引号不影响字符串状态判断', () => {
    /* 值里含 \" —— 不能让状态提前翻转到「字符串外」 */
    const line = '{"a":"say \\"hi,,there\\"",,}';
    const idx = find(line, line.length);
    expect(idx, '必须在最后的字符串外逗号上').toBe(line.lastIndexOf(',,'));
    expect(line.slice(0, idx)).toContain('say \\"hi,,there\\"');
  });

  it('⑤ 三连逗号取第一对（删完还剩一对，用户可再修一次）', () => {
    expect(find('{"a":1,,,}', 7)).toBe(6);
  });

  it('⑥ 无 ,, → -1；空行/单字符安全', () => {
    expect(find('{"a":1,}', 5)).toBe(-1);
    expect(find('', 1)).toBe(-1);
    expect(find(',', 1)).toBe(-1);
  });
});
