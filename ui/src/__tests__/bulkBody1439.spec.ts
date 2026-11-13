/**
 * 1439：_bulk 动作行补全。
 *
 * _bulk 是 NDJSON「动作行 + 文档行」对：动作行顶层给 index/create/update/delete，
 * 动作对象内给 _index/_id/routing… 元数据（update 多 retry_on_conflict）；
 * 文档行是裸文档，不出键。delete 动作不需要文档行（状态机与 ndjsonLint 同口径）。
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, bulkActionKeyItems, bulkActionMetaKeyItems, bulkLineKindAt, bulkActionMetaAt,
} from '../utils/dslCompletionContext';

const ACTION = '{"index":{"_index":"a","_id":"1"}}';
const DOC = '{"title":"x"}';

describe('1439 _bulk 动作行补全', () => {
  it('bodyKind：_bulk 升 bulk-body', () => {
    expect(bodyKindForPath('/_bulk', 'POST')).toBe('bulk-body');
    expect(bodyKindForPath('/idx/_bulk', 'POST')).toBe('bulk-body');
    expect(bodyKindForPath('_bulk', 'POST')).toBe('bulk-body');
  });

  it('行状态机：动作行→文档行→动作行；delete 动作后直接是动作行', () => {
    expect(bulkLineKindAt('{"')).toBe('action');
    expect(bulkLineKindAt(ACTION + '\n')).toBe('doc');
    expect(bulkLineKindAt(ACTION + '\n' + DOC)).toBe('doc');
    expect(bulkLineKindAt(ACTION + '\n' + DOC + '\n')).toBe('action');
    expect(bulkLineKindAt(ACTION + '\n' + DOC + '\n{"')).toBe('action');
    const del = '{"delete":{"_index":"a","_id":"1"}}';
    expect(bulkLineKindAt(del + '\n')).toBe('action');
    expect(bulkLineKindAt(del + '\n{"')).toBe('action');
  });

  it('动作内层判定：{"update": {" 返回 update；顶层动作/文档行内层不算', () => {
    expect(bulkActionMetaAt('{"update": {"')).toBe('update');
    expect(bulkActionMetaAt('{"index": {"')).toBe('index');
    expect(bulkActionMetaAt('{"delete": {"')).toBe('delete');
    expect(bulkActionMetaAt('{"')).toBeNull();
    expect(bulkActionMetaAt('{"title": {"')).toBeNull();
  });

  it('键表：动作四键；update 元数据含 retry_on_conflict，index/delete 不含', () => {
    expect(bulkActionKeyItems().map(i => i.label)).toEqual(['index', 'create', 'update', 'delete']);
    const upd = bulkActionMetaKeyItems('update').map(i => i.label);
    expect(upd).toEqual([
      '_index', '_id', 'routing', 'version', 'version_type', 'if_seq_no', 'if_primary_term', 'retry_on_conflict',
    ]);
    expect(bulkActionMetaKeyItems('index').map(i => i.label)).not.toContain('retry_on_conflict');
    expect(bulkActionMetaKeyItems('delete').map(i => i.label)).not.toContain('retry_on_conflict');
  });
});
