/**
 * 1439：游标翻页 / 清理游标体（_search/scroll、_clear_scroll）。
 *
 * 两端点此前落 none 档：JSON 体被当 NDJSON 做配对检查、键位零候选。
 * 现在 scroll 体给 scroll/scroll_id，clear_scroll 体只给 scroll_id（可数组）。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, scrollBodyKeyItems, clearScrollBodyKeyItems,
} from '../utils/dslCompletionContext';

describe('1439 游标翻页 / 清理游标体', () => {
  it('bodyKind：/_search/scroll 与 /_clear_scroll 各自成档；相对写法同档；不再落 none', () => {
    expect(bodyKindForPath('/idx/_search/scroll', 'POST')).toBe('scroll-body');
    expect(bodyKindForPath('/_search/scroll', 'GET')).toBe('scroll-body');
    expect(bodyKindForPath('_search/scroll', 'POST')).toBe('scroll-body');
    /* DELETE 同路径是清理：只收 scroll_id */
    expect(bodyKindForPath('/_search/scroll', 'DELETE')).toBe('clear-scroll-body');
    expect(bodyKindForPath('/idx/_search/scroll', 'DELETE')).toBe('clear-scroll-body');
    expect(bodyKindForPath('/_clear_scroll', 'DELETE')).toBe('clear-scroll-body');
    expect(bodyKindForPath('idx/_clear_scroll', 'POST')).toBe('clear-scroll-body');
    expect(bodyKindForPath('/idx/_search', 'POST')).toBe('search');
  });

  it('键表：翻页体 scroll+scroll_id；清理体只 scroll_id', () => {
    expect(scrollBodyKeyItems().map(i => i.label)).toEqual(['scroll', 'scroll_id']);
    expect(clearScrollBodyKeyItems().map(i => i.label)).toEqual(['scroll_id']);
  });
});
