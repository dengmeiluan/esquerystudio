import { describe, it, expect } from 'vitest';
import { redactIoBody } from '../api';

/* 观测环请求体脱敏：掩埋凭据样键的值，但不能把 ES settings 域的
   tokenizer / token_chars 键当凭据掩埋——IO 记录是排查配置问题的
   第一手证据，tokenizer 值显示 "***" 会误导定位方向。 */

describe('redactIoBody 凭据脱敏与 tokenizer 家族豁免', () => {
  it('tokenizer / token_chars / token_count 键的值保留', () => {
    const body = JSON.stringify({
      settings: {
        'index.analysis.analyzer.my_analyzer.tokenizer': 'keyword',
        'index.analysis.tokenizer.my_tk.type': 'ngram',
        'index.analysis.tokenizer.my_tk.token_chars': '[letter, digit]',
        'index.analysis.filter.my_f.type': 'token_count',
      },
    });
    const out = redactIoBody(body);
    expect(JSON.parse(out)).toEqual(JSON.parse(body));
  });

  it('token/secret/password 键的值掩埋为 ***', () => {
    const body = JSON.stringify({
      auth_token: 't-1',
      secret_value: 's-1',
      password: 'p-1',
      note: 'plain',
    });
    const out = redactIoBody(body);
    const parsed = JSON.parse(out);
    expect(parsed.auth_token).toBe('***');
    expect(parsed.secret_value).toBe('***');
    expect(parsed.password).toBe('***');
    expect(parsed.note).toBe('plain');
  });

  it('非 JSON 文本原样返回', () => {
    expect(redactIoBody('not-json')).toBe('not-json');
    expect(redactIoBody('')).toBe('');
  });
});
