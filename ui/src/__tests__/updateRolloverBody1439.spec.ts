/**
 * 1439：更新文档体（_update）与滚动索引体（_rollover）的补全分档。
 *
 * 此前 _update 被当裸文档体（键位零候选）、_rollover 落 none（Ctrl+Space 什么都没有）——
 * 两者的体都是结构化对象，键位应当出官方键；但 doc/upsert 内是裸文档、
 * conditions 内只有 max_*，这些边界要压住，不能把外层键灌进去。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, updateBodyKeyItems, scriptObjectKeyItems, updateBodyRegionAt,
  rolloverBodyKeyItems, rolloverConditionKeyItems, rolloverBodyRegionAt,
} from '../utils/dslCompletionContext';

describe('1439 更新体 / 滚动体分档', () => {
  it('bodyKind 分档：_update 单列、_update_by_query 走 ubq 专档、_rollover 单列、_doc 回归为 doc', () => {
    expect(bodyKindForPath('/idx/_update/1', 'POST')).toBe('update-body');
    expect(bodyKindForPath('/idx/_update/1?refresh=wait_for', 'POST')).toBe('update-body');
    expect(bodyKindForPath('/idx/_update_by_query', 'POST')).toBe('ubq-body');
    expect(bodyKindForPath('/logs/_rollover', 'POST')).toBe('rollover-body');
    expect(bodyKindForPath('/logs/_doc/1', 'PUT')).toBe('doc');
    expect(bodyKindForPath('/logs/_create/1', 'PUT')).toBe('doc');
  });

  it('更新体区域：根 / doc·upsert 裸文档 / script / 更深层压制；闭合后回根', () => {
    const at = (s: string) => updateBodyRegionAt(s, s.length);
    expect(at('{"')).toBe('root');
    expect(at('{"doc": {"')).toBe('doc');
    expect(at('{"doc": {"a": {"')).toBe('doc');
    expect(at('{"upsert": {"')).toBe('doc');
    expect(at('{"script": {"')).toBe('script');
    expect(at('{"script": {"params": {"')).toBe('deep');
    expect(at('{"doc": {"a": 1}, "')).toBe('root');
    expect(at('{"script": {"source": "x"}, "')).toBe('root');
  });

  it('滚动体区域：根 / conditions / settings / mappings / aliases；conditions 深层与闭合回根', () => {
    const at = (s: string) => rolloverBodyRegionAt(s, s.length);
    expect(at('{"')).toBe('root');
    expect(at('{"conditions": {"')).toBe('conditions');
    expect(at('{"conditions": {"max_age": "1d", "')).toBe('conditions');
    expect(at('{"conditions": {"max_age": {"')).toBe('deep');
    expect(at('{"settings": {"')).toBe('settings');
    expect(at('{"mappings": {"')).toBe('mapping');
    expect(at('{"aliases": {"a": {"')).toBe('aliases');
    expect(at('{"conditions": {}}, "')).toBe('root');
    expect(at('{"unknown": {"')).toBe('deep');
  });

  it('键表：更新体七键、脚本四键、滚动体四块、conditions 仅 max_*', () => {
    expect(updateBodyKeyItems().map(i => i.label)).toEqual([
      'doc', 'upsert', 'doc_as_upsert', 'script', 'scripted_upsert', 'detect_noop', '_source',
    ]);
    expect(scriptObjectKeyItems().map(i => i.label)).toEqual(['source', 'lang', 'params', 'id']);
    expect(rolloverBodyKeyItems().map(i => i.label)).toEqual(['conditions', 'settings', 'mappings', 'aliases']);
    const cond = rolloverConditionKeyItems().map(i => i.label);
    expect(cond).toEqual([
      'max_age', 'max_docs', 'max_size', 'max_primary_shard_size', 'max_primary_shard_docs',
    ]);
    expect(cond.some(k => k.startsWith('min_'))).toBe(false);
  });
});
