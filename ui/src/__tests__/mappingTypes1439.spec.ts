/**
 * 1439：mapping 核心类型目录单源。
 *
 * 背景：补全/lint 侧只有 18 项残缺表；Mapping 设计器的类型下拉另抄了 24 项，
 * 还写着**并不存在的裸 `range`**（选了写出 "type":"range"，ES 直接 400）。
 * 现在两处统一吃 dslCompletionContext.MAPPING_TYPES，并按 ES 8.x mapping 文档补全目录。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAPPING_TYPES } from '../utils/dslCompletionContext';
import { lintMappingBody } from '../utils/dslLint';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/** ES 8.x 核心字段类型（mapping 文档目录） */
const OFFICIAL = [
  'text', 'keyword', 'constant_keyword', 'wildcard', 'match_only_text', 'search_as_you_type',
  'annotated_text', 'semantic_text',
  'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float',
  'unsigned_long', 'token_count',
  'date', 'date_nanos', 'boolean', 'ip',
  'integer_range', 'long_range', 'float_range', 'double_range', 'date_range', 'ip_range',
  'object', 'nested', 'flattened', 'join', 'alias', 'version', 'aggregate_metric_double', 'histogram',
  'geo_point', 'geo_shape', 'shape', 'point',
  'binary', 'completion', 'percolator', 'rank_feature', 'rank_features', 'dense_vector', 'sparse_vector',
];

/** 类型目录缺口判据（负控用同一函数喂旧表样本） */
const missingTypes = (list: readonly string[]) => OFFICIAL.filter(t => !list.includes(t));

describe('1439 mapping 类型目录', () => {
  it('目录覆盖 ES 8.x 核心类型全集', () => {
    expect(missingTypes(MAPPING_TYPES)).toEqual([]);
  });

  it('目录里没有非法类型名（裸 range / OpenSearch 的 knn_vector）', () => {
    expect(MAPPING_TYPES).not.toContain('range');
    expect(MAPPING_TYPES).not.toContain('knn_vector');
  });

  it('Mapping 设计器类型下拉吃同一份目录', () => {
    const src = read('../views/MappingDesignerView.vue');
    expect(src).toContain("import { MAPPING_TYPES } from '../utils/dslCompletionContext';");
    expect(src).toContain('const TYPES = MAPPING_TYPES;');
  });

  it('lint 认所有目录内类型，且仍能抓拼写错', () => {
    const badTypes = MAPPING_TYPES.filter(t =>
      lintMappingBody({ properties: { x: { type: t } } }).some(f => f.rule === 'mapping-type'));
    expect(badTypes, '目录内类型被 lint 判错：' + badTypes.join(', ')).toEqual([]);
    const typo = lintMappingBody({ properties: { x: { type: 'keywrod' } } })
      .filter(f => f.rule === 'mapping-type').map(f => f.message).join(' | ');
    expect(typo).toContain('keyword');
  });

  it('负控：旧设计器表样本被点名（含非法 range、缺 wildcard/unsigned_long）', () => {
    const oldDesigner = [
      'keyword', 'text', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float',
      'boolean', 'date', 'date_nanos', 'binary', 'object', 'nested',
      'ip', 'geo_point', 'geo_shape', 'range', 'completion', 'flattened', 'search_as_you_type', 'histogram',
    ];
    expect(oldDesigner).toContain('range');
    const missing = missingTypes(oldDesigner);
    expect(missing).toEqual(expect.arrayContaining(['unsigned_long', 'wildcard', 'constant_keyword']));
  });
});
