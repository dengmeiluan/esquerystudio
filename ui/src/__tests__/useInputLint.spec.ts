import { describe, it, expect } from 'vitest';
import {
  useInputLint, indexNameRule, dupRule, patternRule, jqLiteRule,
  TIME_RE, SLICES_RE, RPS_RE,
} from '../composables/useInputLint';

describe('ux2 Task 11：useInputLint 规则矩阵', () => {
  describe('check 门面', () => {
    it('空串/空白一律放行且清 hint', () => {
      const l = useInputLint([() => ({ msg: 'x' })]);
      expect(l.check('')).toBe(true);
      expect(l.check('   ')).toBe(true);
      expect(l.hint.value).toBe('');
    });
    it('首个命中胜出 + 默认级别 err + clear 手动清', () => {
      const l = useInputLint([() => ({ msg: '第一' }), () => ({ msg: '第二' })]);
      expect(l.check('v')).toBe(false);
      expect(l.hint.value).toBe('第一');
      expect(l.level.value).toBe('err');
      l.clear();
      expect(l.hint.value).toBe('');
      expect(l.level.value).toBe('');
    });
    it('全规则放行 → true 且 hint 空', () => {
      const l = useInputLint([() => null, () => null]);
      expect(l.check('v')).toBe(true);
      expect(l.hint.value).toBe('');
    });
  });

  describe('indexNameRule', () => {
    const r = indexNameRule();
    it.each(['orders-v2', 'a', 'logs-2026.08.11', 'a-b-c-1'])('合法：%s', v => {
      expect(r(v)).toBeNull();
    });
    it.each(['Orders', 'ABC'])('大写拒绝：%s', v => {
      expect(r(v)!.msg).toContain('小写');
    });
    it.each(['a/b', 'a\\b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a b', 'a,b', 'a#b', 'a:b'])('非法字符拒绝：%s', v => {
      expect(r(v)!.msg).toContain('非法字符');
    });
    it.each(['.hidden', '_sys'])('保留开头拒绝：%s', v => {
      expect(r(v)!.msg).toContain('开头');
    });
    it('超 255 字节拒绝、恰 255 放行', () => {
      expect(r('a'.repeat(256))!.msg).toContain('255');
      expect(r('a'.repeat(255))).toBeNull();
    });
  });

  describe('dupRule', () => {
    it('命中默认 warn + 覆盖文案；miss 放行', () => {
      const r = dupRule(() => ['a', 'b'], '模板');
      expect(r('a')).toEqual({ msg: '模板「a」已存在，保存将覆盖', level: 'warn' });
      expect(r('c')).toBeNull();
    });
    it('level=err 时无覆盖文案', () => {
      const r = dupRule(() => ['a'], '索引', 'err');
      expect(r('a')).toEqual({ msg: '索引「a」已存在', level: 'err' });
    });
  });

  describe('格式正则矩阵', () => {
    it.each(['5m', '1h', '-1', '30s', '500ms', '7d'])('TIME_RE 过：%s', v => {
      expect(patternRule(TIME_RE, 'x')(v)).toBeNull();
    });
    it.each(['5', 'm5', '5x', '--1', '1.5h'])('TIME_RE 拒：%s', v => {
      expect(patternRule(TIME_RE, 'x')(v)).toEqual({ msg: 'x' });
    });
    it.each(['auto', '0', '8'])('SLICES_RE 过：%s', v => {
      expect(patternRule(SLICES_RE, 'x')(v)).toBeNull();
    });
    it.each(['AUTO', '-1', '1.5'])('SLICES_RE 拒：%s', v => {
      expect(patternRule(SLICES_RE, 'x')(v)).toEqual({ msg: 'x' });
    });
    it.each(['-1', '500', '0.5'])('RPS_RE 过：%s', v => {
      expect(patternRule(RPS_RE, 'x')(v)).toBeNull();
    });
    it.each(['auto', '-2', '1.'])('RPS_RE 拒：%s', v => {
      expect(patternRule(RPS_RE, 'x')(v)).toEqual({ msg: 'x' });
    });
  });

  describe('jqLiteRule（一律 warn）', () => {
    it.each(['.hits.hits', '[.a[], .b]', '{a: .}', '.'])('合法：%s', v => {
      expect(jqLiteRule()(v)).toBeNull();
    });
    it('非 . / [ 起始 → warn', () => {
      expect(jqLiteRule()('abc')).toEqual({ msg: 'jq 表达式通常以 . 或 [ 起始', level: 'warn' });
    });
    it.each(['(.a', '.a[.b'])('未闭合 → warn：%s', v => {
      expect(jqLiteRule()(v)!.msg).toContain('未闭合');
      expect(jqLiteRule()(v)!.level).toBe('warn');
    });
    it.each(['.a)', '.a]'])('闭合无匹配 → warn：%s', v => {
      expect(jqLiteRule()(v)!.msg).toContain('无匹配');
    });
  });
});
