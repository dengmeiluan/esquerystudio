/**
 * 1439：安全体系写体——角色 / 用户 / 角色映射 / API Key。
 *
 * 四个端点此前落 search 档（根键给 query/aggs 全是非法键）。各自结构：
 *   role: {cluster, indices[{names,privileges,field_security,query,allow_restricted_indices}], applications[...], run_as, …}
 *   user: {password|password_hash, roles, full_name, email, metadata, enabled, role_templates[...]}
 *   role_mapping: {roles, enabled, rules, metadata}
 *   api_key: {name, expiration, role_descriptors, metadata}
 */
import { describe, it, expect } from 'vitest';
import {
  bodyKindForPath, securityRoleBodyKeyItems, securityRoleIndexKeyItems, securityRoleFieldSecurityKeyItems,
  securityRoleAppKeyItems, securityRoleRegionAt, securityUserBodyKeyItems, securityUserRegionAt,
  securityRoleTemplateKeyItems, securityRoleMappingBodyKeyItems, securityApiKeyBodyKeyItems,
  securityRoleBodyRootKeys, securityRoleIndexKeys, securityRoleFieldSecurityKeys, securityRoleAppKeys,
  securityUserBodyRootKeys, securityRoleTemplateKeys, securityRoleMappingBodyRootKeys, securityApiKeyBodyRootKeys,
  securityRoleMappingRuleKeyItems, securityRoleMappingRegionAt,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const ROLE = {
  cluster: ['monitor'],
  indices: [{ names: ['logs-*'], privileges: ['read'], field_security: { grant: ['*'], except: ['secret'] }, allow_restricted_indices: false }],
  applications: [{ application: 'kibana', privileges: ['read'], resources: ['*'] }],
  global: { application: { manage: ['myapp'] } },
  run_as: ['user1'],
  metadata: {},
  transient_metadata: { enabled: true },
};
const USER = {
  password: 'change-me',
  roles: ['viewer'],
  full_name: '张三',
  email: 'user@example.com',
  enabled: true,
  role_templates: [{ template: { source: 'mustache' }, format: 'string' }],
};

describe('1439 安全体系写体分档', () => {
  it('路径分派：role/user/role_mapping（PUT/POST）与 api_key（POST 专属）', () => {
    expect(bodyKindForPath('/_security/role/analyst', 'PUT')).toBe('security-role-body');
    expect(bodyKindForPath('/_xpack/security/role/analyst', 'POST')).toBe('security-role-body');
    expect(bodyKindForPath('/_security/user/jdoe', 'PUT')).toBe('security-user-body');
    expect(bodyKindForPath('/_security/role_mapping/devs', 'PUT')).toBe('security-role-mapping-body');
    expect(bodyKindForPath('/_security/api_key', 'POST')).toBe('security-api-key-body');
    /* 代授 API Key 是独立体（grant_type + api_key），不与创建体并档 */
    expect(bodyKindForPath('/_security/api_key/grant', 'POST')).toBe('security-api-key-grant-body');
    /* 只读/其他动作不抢档 */
    expect(bodyKindForPath('/_security/role/analyst', 'GET')).toBe('search');
    expect(bodyKindForPath('/_security/user/jdoe', 'DELETE')).toBe('search');
    expect(bodyKindForPath('/_security/api_key/grant', 'GET')).toBe('search');
  });

  it('目录：角色根键与三层嵌套；用户/映射/API Key 根键', () => {
    expect(securityRoleBodyRootKeys).toEqual([
      'cluster', 'indices', 'applications', 'global', 'run_as', 'metadata', 'transient_metadata',
    ]);
    expect(securityRoleIndexKeys).toEqual(['names', 'privileges', 'field_security', 'query', 'allow_restricted_indices']);
    expect(securityRoleFieldSecurityKeys).toEqual(['grant', 'except']);
    expect(securityRoleAppKeys).toEqual(['application', 'privileges', 'resources']);
    expect(securityUserBodyRootKeys).toEqual([
      'password', 'password_hash', 'roles', 'full_name', 'email', 'metadata', 'enabled', 'role_templates',
    ]);
    expect(securityRoleTemplateKeys).toEqual(['template', 'format']);
    expect(securityRoleMappingBodyRootKeys).toEqual([
      'roles', 'enabled', 'rules', 'role_templates', 'run_as', 'metadata',
    ]);
    expect(securityRoleMappingRuleKeyItems().map(i => i.label)).toEqual(['field', 'all', 'any', 'except']);
    expect(securityApiKeyBodyRootKeys).toEqual(['name', 'expiration', 'role_descriptors', 'metadata']);
    expect(securityRoleBodyKeyItems().find(i => i.label === 'indices')?.detail).toContain('索引权限');
    expect(securityUserBodyKeyItems().find(i => i.label === 'enabled')?.detail).toContain('启用');
    expect(securityApiKeyBodyKeyItems().find(i => i.label === 'expiration')?.detail).toContain('有效期');
  });

  it('区域：角色根/indices 元素/field_security/applications 元素；用户根/role_templates 元素', () => {
    const roleAt = (s: string) => securityRoleRegionAt(s, s.length);
    expect(roleAt('{')).toBe('root');
    expect(roleAt('{"indices": [{')).toBe('index');
    expect(roleAt('{"indices": [{"field_security": {')).toBe('field-security');
    expect(roleAt('{"indices": [{"query": {')).toBe('query');
    expect(roleAt('{"indices": [{"query": {"bool": {')).toBe('query');
    expect(roleAt('{"applications": [{')).toBe('app');
    expect(roleAt('{"indices": [{"names": [')).toBe('deep');

    const userAt = (s: string) => securityUserRegionAt(s, s.length);
    expect(userAt('{')).toBe('root');
    expect(userAt('{"role_templates": [{')).toBe('role-template');
    expect(userAt('{"role_templates": [{"template": {')).toBe('template-script');

    const rmAt = (s: string) => securityRoleMappingRegionAt(s, s.length);
    expect(rmAt('{')).toBe('root');
    expect(rmAt('{"rules": {')).toBe('rules');
    expect(rmAt('{"rules": {"all": [{')).toBe('rule');
    expect(rmAt('{"rules": {"any": [{')).toBe('rule');
    expect(rmAt('{"rules": {"except": {')).toBe('rule');
    expect(rmAt('{"rules": {"field": {')).toBe('deep');
    expect(rmAt('{"role_templates": [{')).toBe('role-template');
    expect(rmAt('{"role_templates": [{"template": {')).toBe('template-script');
  });

  it('lint：合法体静默；根键/索引权限/应用/角色模板拼错分段点名；search 根键被拒', () => {
    expect(lintStructuredBody('security-role-body', JSON.stringify(ROLE))).toEqual([]);
    expect(lintStructuredBody('security-user-body', JSON.stringify(USER))).toEqual([]);
    expect(lintStructuredBody('security-role-mapping-body', JSON.stringify({
      roles: ['viewer'], enabled: true, rules: { field: { username: 'jdoe' } }, metadata: {},
    }))).toEqual([]);
    expect(lintStructuredBody('security-api-key-body', JSON.stringify({
      name: 'k1', expiration: '1d', role_descriptors: {}, metadata: {},
    }))).toEqual([]);
    expect(lintStructuredBody('security-api-key-body', JSON.stringify({
      name: 'k1', role_descriptors: { admin: { cluster: ['monitor'], indices: [{ names: ['*'], privileges: ['read'] }] } },
    }))).toEqual([]);

    const root = lintStructuredBody('security-role-body', JSON.stringify({ clusters: [] }));
    expect(root.some(f => f.message.includes('安全角色体') && f.message.includes('最接近：cluster'))).toBe(true);

    const idx = lintStructuredBody('security-role-body', JSON.stringify({ indices: [{ namez: ['x'] }] }));
    expect(idx.some(f => f.message.includes('安全角色索引权限') && f.message.includes('最接近：names'))).toBe(true);

    const app = lintStructuredBody('security-role-body', JSON.stringify({ applications: [{ applicaton: 'x' }] }));
    expect(app.some(f => f.message.includes('安全角色应用权限') && f.message.includes('最接近：application'))).toBe(true);

    const rt = lintStructuredBody('security-user-body', JSON.stringify({ role_templates: [{ formatt: 'string' }] }));
    expect(rt.some(f => f.message.includes('安全用户角色模板') && f.message.includes('最接近：format'))).toBe(true);

    const q = lintStructuredBody('security-api-key-body', JSON.stringify({ query: {}, name: 'k' }));
    expect(q.some(f => f.message.includes('API Key 体') && f.message.includes('query'))).toBe(true);

    const rdc = lintStructuredBody('security-api-key-body', JSON.stringify({
      name: 'k', role_descriptors: { admin: { clusterr: [] } },
    }));
    expect(rdc.some(f => f.message.includes('API Key 角色 admin') && f.message.includes('最接近：cluster'))).toBe(true);

    const grdc = lintStructuredBody('security-api-key-grant-body', JSON.stringify({
      grant_type: 'access_token', access_token: 't',
      api_key: { name: 'k', role_descriptors: { admin: { clusterr: [] } } },
    }));
    expect(grdc.some(f => f.message.includes('代授 Key 角色 admin') && f.message.includes('最接近：cluster'))).toBe(true);
  });
});
