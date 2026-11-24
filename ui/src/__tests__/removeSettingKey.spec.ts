import { describe, it, expect } from 'vitest';
import { removeSettingKey } from '../utils/removeSettingKey';

/* 「一键移除」共享内核——校验 issue.fix(REMOVE_SETTING) 的前端执行体。
 兼容审编框三种合法书写形态（Normalizer 输出/用户手写）：
 顶层平铺相对键 / 顶层 index. 前缀平铺键 / index 嵌套逐段（删后清空父）。 */

describe('removeSettingKey 三形态删键', () => {
  it('形态①：顶层平铺相对键', () => {
    const r = removeSettingKey(
      '{"replication.type":"segment","number_of_shards":"5"}', 'replication.type');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o).toEqual({ number_of_shards: '5' });
  });

  it('形态②：顶层 index. 前缀平铺键', () => {
    const r = removeSettingKey(
      '{"index.replication.type":"segment","index.number_of_shards":"5"}', 'replication.type');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o).toEqual({ 'index.number_of_shards': '5' });
  });

  it('形态③：index 嵌套逐段下钻，删后清理空父对象', () => {
    const r = removeSettingKey(
      '{"index":{"replication":{"type":"segment"},"number_of_shards":"5"}}', 'replication.type');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o).toEqual({ index: { number_of_shards: '5' } });
  });

  it('嵌套父有兄弟键时不误删父对象', () => {
    const r = removeSettingKey(
      '{"index":{"routing":{"allocation":{"include":{"_tier_preference":"data_content"}},"initial_recovery":{"id":"x"}}}}',
      'routing.allocation.include._tier_preference');
    expect(r.ok).toBe(true);
    const o = JSON.parse(r.json!);
    expect(o.index.routing.initial_recovery.id).toBe('x');
    expect(o.index.routing.allocation).toBeUndefined();
  });

  it('键不存在 → ok:false 报键名（不静默改写）', () => {
    const r = removeSettingKey('{"index":{"number_of_shards":"5"}}', 'replication.type');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('replication.type');
  });

  it('JSON 语法错误 → 原文不动，error 透出', () => {
    const r = removeSettingKey('not-json{', 'replication.type');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
