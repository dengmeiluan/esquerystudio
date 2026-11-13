/**
 * 1439：别名批量动作体（POST /_aliases）。
 *
 * 此前落 none 档：根键位零候选，actions[] 元素、add/remove 配置对象都只能凭记忆。
 * 现在按四层区域分派：根 actions / 元素动作键 / 各动作配置键 / 深层压制。
 * add 的配置键比 remove 多 filter/routing/is_write_index 等；remove_index 只认索引。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, aliasesBodyKeyItems, aliasActionKeyItems, aliasAddConfigKeyItems,
  aliasRemoveConfigKeyItems, aliasRemoveIndexConfigKeyItems, aliasesBodyRegionAt,
} from '../utils/dslCompletionContext';

describe('1439 别名批量动作体', () => {
  it('bodyKind：/_aliases 与 /<索引>/_aliases 归 aliases-body；单别名端点 alias-body 不回归', () => {
    expect(bodyKindForPath('/_aliases', 'POST')).toBe('aliases-body');
    expect(bodyKindForPath('/idx/_aliases', 'POST')).toBe('aliases-body');
    expect(bodyKindForPath('_aliases', 'POST')).toBe('aliases-body');
    expect(bodyKindForPath('/idx/_alias/my-alias', 'PUT')).toBe('alias-body');
    expect(bodyKindForPath('/idx/_alias', 'GET')).not.toBe('aliases-body');
    expect(bodyKindForPath('/idx/_aliasx', 'POST')).not.toBe('aliases-body');
  });

  it('区域：根 / 动作键 / add·remove·remove_index 配置 / 深层', () => {
    const at = (s: string) => aliasesBodyRegionAt(s, s.length);
    expect(at('{"')).toBe('root');
    expect(at('{"actions": [{')).toBe('action');
    expect(at('{"actions": [{"add": {"')).toBe('config-add');
    expect(at('{"actions": [{"remove": {"')).toBe('config-remove');
    expect(at('{"actions": [{"remove_index": {"')).toBe('config-remove-index');
    expect(at('{"actions": [{"add": {"filter": {"')).toBe('deep');
    expect(at('{"actions": [{"add": {"index": "a"}}, {')).toBe('action');
    expect(at('{"actions": [{"add": {"index": "a"}}]}')).toBe('root');
    expect(at('{"other": {"')).toBe('deep');
  });

  it('键表：动作三键；add 十一键含 filter/routing/is_write_index；remove 五键；remove_index 两键', () => {
    expect(aliasesBodyKeyItems().map(i => i.label)).toEqual(['actions']);
    expect(aliasActionKeyItems().map(i => i.label)).toEqual(['add', 'remove', 'remove_index']);
    const add = aliasAddConfigKeyItems().map(i => i.label);
    expect(add).toEqual([
      'index', 'indices', 'alias', 'aliases', 'filter', 'routing', 'index_routing',
      'search_routing', 'is_write_index', 'is_hidden', 'must_exist',
    ]);
    expect(aliasRemoveConfigKeyItems().map(i => i.label))
      .toEqual(['index', 'indices', 'alias', 'aliases', 'must_exist']);
    expect(aliasRemoveIndexConfigKeyItems().map(i => i.label)).toEqual(['index', 'indices']);
  });
});
