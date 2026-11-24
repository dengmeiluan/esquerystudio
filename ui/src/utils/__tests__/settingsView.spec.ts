import { describe, it, expect } from 'vitest';
import {
  settingValueText, flattenSettings, toSettingRows, mergeDefaultRows,
  dotKeySegments, filterSettingRows, type SettingRow,
} from '../settingsView';

/* R88：settings 呈现统一层契约测试——SettingsGrid / DotKey / 三视图共用口径，锁死。 */

describe('settingValueText', () => {
  it('null/undefined → 空串', () => {
    expect(settingValueText(null)).toBe('');
    expect(settingValueText(undefined)).toBe('');
  });
  it('数组拼逗号', () => expect(settingValueText(['lowercase', 'asciifolding'])).toBe('lowercase, asciifolding'));
  it('嵌套数组递归展开', () => expect(settingValueText([1, [2, 3]])).toBe('1, 2, 3'));
  it('对象转 JSON', () => expect(settingValueText({ a: 1 })).toBe('{"a":1}'));
  it('布尔/数字转字符串', () => {
    expect(settingValueText(true)).toBe('true');
    expect(settingValueText(0)).toBe('0');
  });
});

describe('flattenSettings', () => {
  it('嵌套形态拍平成 dot-key（GET _settings）', () => {
    expect(flattenSettings({ index: { number_of_replicas: '1', search: { slowlog: { threshold: { query: { info: '2s' } } } } } }))
      .toEqual({ 'index.number_of_replicas': '1', 'index.search.slowlog.threshold.query.info': '2s' });
  });
  it('flat 形态原样透传（inspect 端点）', () => {
    expect(flattenSettings({ 'index.number_of_replicas': '1' })).toEqual({ 'index.number_of_replicas': '1' });
  });
  it('数组是叶子，不往下钻', () => {
    expect(flattenSettings({ analysis: { filter: ['lowercase', 'trim'] } }))
      .toEqual({ 'analysis.filter': 'lowercase, trim' });
  });
  it('空对象叶子给 {}', () => {
    expect(flattenSettings({ index: { lifecycle: {} } })).toEqual({ 'index.lifecycle': '{}' });
  });
  it('null 叶子给空串', () => {
    expect(flattenSettings({ index: { routing: null } })).toEqual({ 'index.routing': '' });
  });
  it('非对象入参给空结果', () => {
    expect(flattenSettings(null)).toEqual({});
    expect(flattenSettings('str')).toEqual({});
  });
});

describe('toSettingRows', () => {
  it('拍平 + 字典序排序', () => {
    const rows = toSettingRows({ index: { b: '2', a: '1' } });
    expect(rows.map(r => r.k)).toEqual(['index.a', 'index.b']);
    expect(rows[0]).toEqual({ k: 'index.a', v: '1', def: false });
  });
  it('opts.def 标默认值行', () => {
    expect(toSettingRows({ a: '1' }, { def: true })[0].def).toBe(true);
  });
  it('空入参给空数组', () => expect(toSettingRows(null)).toEqual([]));
});

describe('mergeDefaultRows', () => {
  const explicit: SettingRow[] = [{ k: 'index.number_of_replicas', v: '2' }];
  const defaults: SettingRow[] = [
    { k: 'index.number_of_replicas', v: '1' },
    { k: 'index.refresh_interval', v: '1s' },
  ];
  it('默认值只补显式没有的 key，且标 def', () => {
    const merged = mergeDefaultRows(explicit, defaults);
    expect(merged).toHaveLength(2);
    expect(merged.find(r => r.k === 'index.number_of_replicas')).toEqual({ k: 'index.number_of_replicas', v: '2' });
    expect(merged.find(r => r.k === 'index.refresh_interval')?.def).toBe(true);
  });
  it('合并后整体重排字典序', () => {
    const merged = mergeDefaultRows([{ k: 'z', v: '' }], [{ k: 'a', v: '' }]);
    expect(merged.map(r => r.k)).toEqual(['a', 'z']);
  });
});

describe('dotKeySegments', () => {
  it('点后分段（末段无点）', () => expect(dotKeySegments('a.b.c')).toEqual(['a.', 'b.', 'c']));
  it('无点单段', () => expect(dotKeySegments('refresh_interval')).toEqual(['refresh_interval']));
  it('null 容错给单空段', () => expect(dotKeySegments(null as unknown as string)).toEqual(['']));
  it('分段拼回等于原 key（零丢字契约）', () => {
    const k = 'index.search.slowlog.threshold.query.info';
    expect(dotKeySegments(k).join('')).toBe(k);
  });
});

describe('filterSettingRows', () => {
  const rows: SettingRow[] = [
    { k: 'index.number_of_replicas', v: '1' },
    { k: 'index.refresh_interval', v: '30s' },
  ];
  it('key 命中（大小写不敏感）', () => {
    expect(filterSettingRows(rows, 'REPLICAS')).toHaveLength(1);
  });
  it('value 命中', () => {
    expect(filterSettingRows(rows, '30s')[0].k).toBe('index.refresh_interval');
  });
  it('空关键字原样返回', () => expect(filterSettingRows(rows, '  ')).toBe(rows));
  it('无命中给空数组', () => expect(filterSettingRows(rows, 'xxx')).toEqual([]));
});
