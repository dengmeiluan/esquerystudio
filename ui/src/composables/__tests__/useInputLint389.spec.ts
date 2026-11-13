/**
 * 三百八十九批：useInputLint 行为级单测——ux2 Task 11 输入防呆内核（实体查重/
 * 命名规则/格式值校验的执行机）。五契约：首个命中规则胜出/trim 空串放行/
 * indexNameRule 四分支（大写/非法字符/保留前缀/字节超长——中文按字节数非字符数）/
 * dupRule warn 与 err 双档文案差异/patternRule+TIME_RE 结构化值。
 */
import { describe, it, expect } from 'vitest';
import { useInputLint, indexNameRule, dupRule, patternRule, TIME_RE } from '../useInputLint';

describe('useInputLint 行为契约（389 批）', () => {
  it('首个命中规则胜出；check 返回是否通过；clear 清态', () => {
    const lint = useInputLint([
      v => (v.includes('x') ? { msg: '含 x' } : null),
      v => (v.length > 2 ? { msg: '过长', level: 'warn' } : null),
    ]);
    expect(lint.check('xxlong'), '两条都命中，首条胜出').toBe(false);
    expect(lint.hint.value).toBe('含 x');
    expect(lint.level.value).toBe('err');
    expect(lint.check('abc'), '第二规则命中 warn').toBe(false);
    expect(lint.hint.value).toBe('过长');
    expect(lint.level.value).toBe('warn');
    lint.clear();
    expect(lint.hint.value).toBe('');
    expect(lint.level.value).toBe('');
  });

  it('trim 空串放行（空值语义交必填逻辑）', () => {
    const lint = useInputLint([() => ({ msg: '永远命中' })]);
    expect(lint.check('')).toBe(true);
    expect(lint.check('   ')).toBe(true);
    expect(lint.hint.value).toBe('');
  });

  it('indexNameRule 四分支：大写/非法字符/保留前缀/字节超长（中文按字节）', () => {
    const lint = useInputLint([indexNameRule()]);
    expect(lint.check('MyIndex')).toBe(false);
    expect(lint.hint.value).toBe('索引名必须全小写');
    lint.check('bad name'); expect(lint.hint.value).toContain('非法字符');
    lint.check('.hidden'); expect(lint.hint.value).toContain('不得以 . 或 _ 开头');
    // 130 个中文字符 = 390 字节 > 255（字符数 130 却不超）
    lint.check('中'.repeat(130));
    expect(lint.hint.value).toContain('超长');
    expect(lint.check('ok-index-1')).toBe(true);
  });

  it('dupRule：命中按档位出文案（err 硬失败 / warn 提示覆盖）', () => {
    const names = ['alpha', 'beta'];
    const errLint = useInputLint([dupRule(() => names, '索引', 'err')]);
    errLint.check('alpha');
    expect(errLint.hint.value).toBe('索引「alpha」已存在');
    expect(errLint.level.value).toBe('err');
    const warnLint = useInputLint([dupRule(() => names, '模板')]);
    warnLint.check('beta');
    expect(warnLint.hint.value).toBe('模板「beta」已存在，保存将覆盖');
    expect(warnLint.level.value).toBe('warn');
  });

  it('patternRule + TIME_RE：时间值结构化判定', () => {
    const lint = useInputLint([patternRule(TIME_RE, '时间格式：-1 或 30s/5m/2h/7d')]);
    for (const ok of ['-1', '500ms', '30s', '5m', '2h', '7d']) expect(lint.check(ok), ok).toBe(true);
    for (const bad of ['5x', '1h30m', 's']) expect(lint.check(bad), bad).toBe(false);
  });
});
