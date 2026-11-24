/**
 * 1439：索引名里含端点动词时，body 分档不得被抢。
 *
 * 缺陷形态：`p.includes('_bulk')` / `p.includes('_reindex')` / `p.includes('_sql')` 这类
 * 子串口径，会把索引名 `logs_reindex` 的创建/搜索请求当成 reindex 体——
 * 补全给 source/dest、lint 按重建体校验，用户写正常索引体反而报错。
 * 端点动词按「路径段」精确匹配，索引名里的同名字串不再参与判定。
 */
import { describe, it, expect } from 'vitest';
import { bodyKindForPath } from '../utils/dslCompletionContext';

const COLLIDING = [
  'logs_bulk', 'logs_reindex', 'logs_sql', 'logs_rollover', 'logs_source', 'logs_analyze',
  'logs_index_template', 'logs_component_template', 'logs_delete_by_query', 'logs_update_by_query',
];

describe('1439 索引名端点动词碰撞', () => {
  it('同名索引的创建/搜索/文档写入不被端点动词抢档', () => {
    for (const name of COLLIDING) {
      expect(bodyKindForPath('/' + name, 'PUT'), name).toBe('index-body');
      expect(bodyKindForPath('/' + name + '/_search', 'POST'), name).toBe('search');
      expect(bodyKindForPath('/' + name + '/_doc/1', 'PUT'), name).toBe('doc');
    }
  });

  it('真端点动词仍按段命中', () => {
    expect(bodyKindForPath('/_bulk', 'POST')).toBe('bulk-body');
    expect(bodyKindForPath('/idx/_bulk', 'POST')).toBe('bulk-body');
    expect(bodyKindForPath('/_reindex', 'POST')).toBe('reindex-body');
    expect(bodyKindForPath('/_sql', 'POST')).toBe('sql-body');
    expect(bodyKindForPath('/_sql/translate', 'POST')).toBe('sql-body');
    expect(bodyKindForPath('/idx/_rollover', 'POST')).toBe('rollover-body');
    expect(bodyKindForPath('/idx/_source/1', 'GET')).toBe('doc');
    expect(bodyKindForPath('/idx/_doc/1/_source', 'GET')).toBe('doc');
    expect(bodyKindForPath('/_analyze', 'POST')).toBe('analyze');
    expect(bodyKindForPath('/idx/_analyze', 'POST')).toBe('analyze');
    expect(bodyKindForPath('/_index_template/t1', 'PUT')).toBe('template');
    expect(bodyKindForPath('/_component_template/c1', 'PUT')).toBe('template');
    expect(bodyKindForPath('/_template/t1', 'PUT')).toBe('template');
    expect(bodyKindForPath('/idx/_delete_by_query', 'POST')).toBe('dbq-body');
    expect(bodyKindForPath('/idx/_update_by_query', 'POST')).toBe('ubq-body');
  });

  it('索引名形如端点动词前缀/后缀（如 my_bulk_logs）同样不误伤', () => {
    expect(bodyKindForPath('/my_bulk_logs', 'PUT')).toBe('index-body');
    expect(bodyKindForPath('/my_bulk_logs/_search', 'POST')).toBe('search');
    expect(bodyKindForPath('/my_reindex_logs/_mapping', 'PUT')).toBe('mapping');
    expect(bodyKindForPath('/my_sql_logs/_settings', 'PUT')).toBe('settings');
  });

  it('索引名含下划线仍是创建索引体（只排除 _ 开头的系统路径）', () => {
    expect(bodyKindForPath('/my_index', 'PUT')).toBe('index-body');
    expect(bodyKindForPath('/logs_2026.08', 'PUT')).toBe('index-body');
    expect(bodyKindForPath('/my_index/_alias/a1', 'PUT')).toBe('alias-body');
    expect(bodyKindForPath('/_cluster', 'PUT')).toBe('search');
  });
});
