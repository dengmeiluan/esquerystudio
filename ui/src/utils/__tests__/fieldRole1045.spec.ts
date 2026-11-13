/* 1045 批：字段业务角色 / 中文业务词别名 / 角色优先排序 / 默认算子。
   只验证「按 mapping 名+类型推断，推断不出就退 other」——不假设任何生产索引或字段一定存在。 */
import { describe, it, expect } from 'vitest';
import { fieldRoleOf, rolePriorityForOp, defaultOpForField, aliasStemsFor } from '../fieldRole';
import { searchFields } from '../fieldSearch';

describe('1045 fieldRole 业务角色推断', () => {
  it('标识 / 名称实体 / 正文 / 时间 / 分类 / 指标 / 空间 / 向量', () => {
    expect(fieldRoleOf('unified_social_credit_code', 'keyword')).toBe('identifier');
    expect(fieldRoleOf('entity_name', 'text')).toBe('entity');
    expect(fieldRoleOf('report_title', 'text')).toBe('entity');
    expect(fieldRoleOf('content', 'text')).toBe('text');
    expect(fieldRoleOf('publish_time', 'date')).toBe('date');
    expect(fieldRoleOf('credit_rating', 'keyword')).toBe('category');
    /* 1061：keyword 的 name/title 是主体/名称入口，不再是分类 */
    expect(fieldRoleOf('name', 'keyword')).toBe('entity');
    expect(fieldRoleOf('report_title', 'keyword')).toBe('entity');
    expect(fieldRoleOf('issuer_name', 'keyword')).toBe('entity');
    expect(fieldRoleOf('name_code', 'keyword')).toBe('identifier');
    /* 1069 续：分类词根优先于实体/名称前缀——生产里 issuer_type/industry_name/source_name
       是分类维度，不能被主体 Top/每主体最新误当主体字段 */
    expect(fieldRoleOf('issuer_type', 'keyword')).toBe('category');
    expect(fieldRoleOf('company_industry', 'keyword')).toBe('category');
    expect(fieldRoleOf('source_name', 'keyword')).toBe('category');
    expect(fieldRoleOf('industry_name', 'keyword')).toBe('category');
    expect(fieldRoleOf('company_name', 'keyword')).toBe('entity');
    expect(fieldRoleOf('person_name', 'keyword')).toBe('entity');
    expect(fieldRoleOf('coupon_rate', 'double')).toBe('metric');
    expect(fieldRoleOf('location', 'geo_point')).toBe('geo');
    expect(fieldRoleOf('embedding', 'dense_vector')).toBe('vector');
    expect(fieldRoleOf('custom_blob', 'object')).toBe('other');
  });

  it('算子角色优先序：term 标识优先、match 正文优先、range 时间优先', () => {
    expect(rolePriorityForOp('term')[0]).toBe('identifier');
    expect(rolePriorityForOp('match')[0]).toBe('text');
    expect(rolePriorityForOp('range')[0]).toBe('date');
    expect(rolePriorityForOp('terms')[0]).toBe('category');
  });

  it('默认算子按类型/角色：date→range、text→match、metric→range、keyword→term', () => {
    expect(defaultOpForField('publish_time', 'date')).toBe('range');
    expect(defaultOpForField('title', 'text')).toBe('match');
    expect(defaultOpForField('coupon_rate', 'double')).toBe('range');
    expect(defaultOpForField('status', 'keyword')).toBe('term');
    expect(defaultOpForField('is_deleted', 'boolean')).toBe('term');
    expect(defaultOpForField('location', 'geo_point')).toBe('geo_distance');
  });

  it('新型 mapping 类型：match_only_text→match、semantic_text→semantic、range 族→range、join→parent_id', () => {
    expect(defaultOpForField('title', 'match_only_text')).toBe('match');
    expect(defaultOpForField('suggest', 'search_as_you_type')).toBe('match');
    expect(defaultOpForField('vec', 'semantic_text')).toBe('semantic');
    expect(defaultOpForField('window', 'integer_range')).toBe('range');
    expect(defaultOpForField('window', 'date_range')).toBe('range');
    expect(defaultOpForField('join_field', 'join')).toBe('parent_id');
    expect(defaultOpForField('ver', 'version')).toBe('term');
  });
});

describe('1045 中文业务词别名扩展', () => {
  it('主体/公告/研报/债券/舆情 → 真实字段词根（最长别名优先）', () => {
    expect(aliasStemsFor('主体名称')).toEqual(expect.arrayContaining(['entity', 'company', 'name']));
    expect(aliasStemsFor('公告')).toContain('announcement');
    expect(aliasStemsFor('研报')).toContain('report');
    expect(aliasStemsFor('债券')).toContain('bond');
    expect(aliasStemsFor('舆情情绪')).toEqual(expect.arrayContaining(['sentiment', 'polarity']));
    expect(aliasStemsFor('随便输入')).toEqual([]);
  });

  it('零直配时抬出别名命中的真实字段；不生成任何字段', () => {
    const fields = [
      { path: 'entity_name', type: 'text' },
      { path: 'bond_code', type: 'keyword' },
      { path: 'publish_time', type: 'date' },
    ];
    const r = searchFields({ fields, query: '债券' });
    expect(r.flat.map(h => h.path)).toContain('bond_code');
    expect(r.flat.every(h => fields.some(f => f.path === h.path))).toBe(true);
    expect(r.flat.find(h => h.path === 'bond_code')?.alias).toBe(true);
  });

  it('直接匹配存在时不做别名扩展（不打扰正常搜索）', () => {
    const fields = [{ path: 'bond_code', type: 'keyword' }, { path: 'bond_name', type: 'text' }];
    const r = searchFields({ fields, query: 'bond' });
    expect(r.flat.every(h => !h.alias)).toBe(true);
  });
});
