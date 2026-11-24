import { describe, it, expect } from 'vitest';
import { addSettingKey } from '../utils/addSettingKey';

/* 「一键补充」共享内核——校验 issue.fix(ADD_SETTING) 的前端执行体。
 与 removeSettingKey 对称：已有键按原书写形态覆盖（三形态识别），
 新键写入 index 嵌套对象（无壳则建）；纯数字建议值写成数字。 */

describe('addSettingKey 补键三形态', () => {
  it('形态①：顶层平铺相对键——原形态覆盖为数字值', () => {
    const r = addSettingKey('{"max_ngram_diff":1,"number_of_shards":"5"}', 'max_ngram_diff', '39');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o).toEqual({ max_ngram_diff: 39, number_of_shards: '5' });
  });

  it('形态②：顶层 index. 前缀平铺键——保持书写形态', () => {
    const r = addSettingKey('{"index.max_ngram_diff":1}', 'max_ngram_diff', '39');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o).toEqual({ 'index.max_ngram_diff': 39 });
  });

  it('形态③：index 嵌套——写入既有壳（审编框主流形态 {index:{...}}）', () => {
    const r = addSettingKey('{"index":{"number_of_shards":5,"analysis":{"analyzer":{}}}}', 'max_ngram_diff', '39');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o.index.max_ngram_diff).toBe(39);
    expect(o.index.number_of_shards).toBe(5);
    expect(o.index.analysis.analyzer).toEqual({});
  });

  it('无 index 壳的空/缺省 settings——建壳写入', () => {
    const r1 = addSettingKey('', 'max_ngram_diff', '39');
    expect(r1.ok).toBe(true);
    expect(JSON.parse(r1.json!)).toEqual({ index: { max_ngram_diff: 39 } });
    const r2 = addSettingKey('{"number_of_shards":3}', 'max_ngram_diff', '39');
    expect(r2.ok).toBe(true);
    const o2 = JSON.parse(r2.json!);
    expect(o2.index.max_ngram_diff).toBe(39);
    expect(o2.number_of_shards).toBe(3);
  });

  it('settings 壳宽容剥一层（GET _settings 原样形态）', () => {
    const r = addSettingKey('{"settings":{"index":{"number_of_shards":5}}}', 'max_ngram_diff', '39');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o.settings.index.max_ngram_diff).toBe(39);
  });

  it('非数字建议值写原样字符串', () => {
    const r = addSettingKey('{"index":{}}', 'refresh_interval', '30s');
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.json!).index.refresh_interval).toBe('30s');
  });

  it('JSON 语法错误 → 原文不动，error 透出', () => {
    const r = addSettingKey('not-json{', 'max_ngram_diff', '39');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('空键 → ok:false', () => {
    expect(addSettingKey('{}', '', '39').ok).toBe(false);
  });
});
