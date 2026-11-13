/**
 * 1439：结构化体值域封闭键的枚举值补全（STRUCTURED_VALUE_ENUMS）。
 *
 * 键位补全写对了，值位此前仍要凭记忆：version_type 只认 internal/external(_gte)、
 * is_write_index 等是布尔、slices 可写 "auto"。本表是单一真源；
 * 反向普查保证表里的键都还在某个结构化体目录里（目录改名不会留下死键）。
 */
import { describe, it, expect } from 'vitest';
import {
  STRUCTURED_VALUE_ENUMS, mgetDocKeyItems, aliasAddConfigKeyItems, aliasRemoveConfigKeyItems,
  updateBodyKeyItems, dbqBodyKeyItems, ubqBodyKeyItems, sqlBodyKeyItems, termvectorsKeyItems,
  reindexBodyKeyItems, scriptExecuteBodyKeyItems, eqlBodyKeyItems,
  rerouteCommandParamKeyItems, allocationExplainBodyKeyItems,
  snapshotRepoBodyKeyItems, snapshotCreateBodyKeyItems, snapshotRestoreBodyKeyItems,
  securityUserBodyKeyItems, securityRoleMappingBodyKeyItems, securityRoleIndexKeyItems,
  mlJobBodyKeyItems, mlDetectorKeyItems, ingestSimulateBodyKeyItems,
  mlCalendarEventKeyItems, graphControlsKeyItems, securityApiKeyGrantBodyKeyItems,
  securityApiKeyInvalidateBodyKeyItems, watchExecuteBodyKeyItems, snapshotMountBodyKeyItems,
} from '../utils/dslCompletionContext';

describe('1439 结构化体值枚举', () => {
  it('关键枚举在场且引号口径正确', () => {
    expect(STRUCTURED_VALUE_ENUMS.version_type).toEqual({
      values: ['internal', 'external', 'external_gte'], quoted: true, detail: '版本类型',
    });
    expect(STRUCTURED_VALUE_ENUMS.slices.quoted).toBe(true);
    expect(STRUCTURED_VALUE_ENUMS.op_type).toEqual({
      values: ['index', 'create'], quoted: true, detail: '写入形态（create=已存在则失败）',
    });
    expect(STRUCTURED_VALUE_ENUMS.context.values).toEqual(['painless_test', 'score', 'filter']);
    expect(STRUCTURED_VALUE_ENUMS.grant_type).toEqual({
      values: ['access_token', 'password'], quoted: true, detail: '代授 API Key 的授权方式',
    });
    expect(STRUCTURED_VALUE_ENUMS.result_position).toEqual({
      values: ['tail', 'head'], quoted: true, detail: 'EQL 结果位置',
    });
    for (const k of ['is_write_index', 'is_hidden', 'must_exist', 'detect_noop', 'scripted_upsert',
      'doc_as_upsert', 'columnar', 'field_multi_value_leniency', 'allow_partial_search_results',
      'keep_on_completion', 'index_include_frozen', '_source', 'case_sensitive',
      'allow_primary', 'accept_data_loss', 'primary', 'include_disk_info', 'include_yes_decisions',
      'verify', 'ignore_unavailable', 'include_global_state', 'partial', 'include_aliases',
      'enabled', 'allow_restricted_indices', 'allow_lazy_open', 'use_null', 'verbose',
      'skip_result', 'skip_model_update', 'use_significance', 'owner',
      'ignore_condition', 'record_execution', 'allow_partial_sequence_results',
      'offsets', 'positions', 'term_statistics', 'field_statistics']) {
      expect(STRUCTURED_VALUE_ENUMS[k], k).toBeTruthy();
      expect(STRUCTURED_VALUE_ENUMS[k].quoted, k).toBe(false);
      expect(STRUCTURED_VALUE_ENUMS[k].values, k).toEqual(expect.arrayContaining(['true', 'false']));
    }
  });

  it('反向普查：表里的每个键都仍在某个结构化体目录中（无死键）', () => {
    const union = new Set([
      ...mgetDocKeyItems(), ...aliasAddConfigKeyItems(), ...aliasRemoveConfigKeyItems(),
      ...updateBodyKeyItems(), ...dbqBodyKeyItems(), ...ubqBodyKeyItems(), ...sqlBodyKeyItems(),
      ...termvectorsKeyItems(),
      ...reindexBodyKeyItems('dest'),
      ...scriptExecuteBodyKeyItems(),
      ...eqlBodyKeyItems(),
      ...rerouteCommandParamKeyItems('cancel'),
      ...rerouteCommandParamKeyItems('allocate_empty_primary'),
      ...allocationExplainBodyKeyItems(),
      ...snapshotRepoBodyKeyItems(),
      ...snapshotCreateBodyKeyItems(),
      ...snapshotRestoreBodyKeyItems(),
      ...securityUserBodyKeyItems(),
      ...securityRoleMappingBodyKeyItems(),
      ...securityRoleIndexKeyItems(),
      ...mlJobBodyKeyItems(),
      ...mlDetectorKeyItems(),
      ...ingestSimulateBodyKeyItems(),
      ...mlCalendarEventKeyItems(),
      ...graphControlsKeyItems(),
      ...securityApiKeyGrantBodyKeyItems(),
      ...securityApiKeyInvalidateBodyKeyItems(),
      ...watchExecuteBodyKeyItems(),
      ...snapshotMountBodyKeyItems(),
    ].map(i => i.label));
    for (const k of Object.keys(STRUCTURED_VALUE_ENUMS)) {
      expect(union.has(k), k + ' 已不在任何结构化体目录中').toBe(true);
    }
  });
});
