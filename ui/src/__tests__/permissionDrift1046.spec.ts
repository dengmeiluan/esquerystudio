import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  nonAdminBodyTargetsControl,
  nonAdminControlIndexDenied,
  nonAdminDataPlaneWriteAllowed,
  nonAdminHealthLevelEnumeration,
  nonAdminRootSearchNeedsIndex,
  nonAdminWildcardTargetAdvisory,
} from '../utils/devtoolsScope';

/* 1046：账号切换与 DevTools 前后端同口径回归锚。 */
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
const auth = read('stores/auth.ts');
const appVue = read('App.vue');
const appStore = read('stores/app.ts');
const api = read('api.ts');
const terms = read('composables/useTermsSuggest.ts');
const aliases = read('composables/useAliases.ts');

describe('1046 账号切换：工作现场与词项缓存不再跨账号', () => {
  it('登录先换令牌再触发换人清理（轮询不带上一个身份）', () => {
    const body = auth.slice(auth.indexOf('async function login('), auth.indexOf('async function login(') + 900);
    expect(body.indexOf('setToken(r.token)')).toBeGreaterThan(-1);
    expect(body.indexOf('setToken(r.token)')).toBeLessThan(body.indexOf('purgeIfUserChanged(r.username)'));
    expect(body.indexOf('invalidateIdentity()')).toBeLessThan(body.indexOf('purgeIfUserChanged(r.username)'));
  });

  it('查询工作台会话/词项持久档/暂存/健康快照/确认免打扰纳入换人清理', () => {
    for (const key of [
      "'esquerystudio.qw.session:'", "'esquerystudio_terms_stash'", "'esquerystudio.qb.subtree'",
      "'esquerystudio.pref.sqlbridge.sql'", "'esquerystudio.health-report.last'", "'es_vars'", "'es_confirm_skip:'",
    ]) {
      expect(auth).toContain(key);
    }
  });

  it('App 换人时清模块级缓存并剥掉深链载荷', () => {
    expect(appVue).toContain('clearSuggestCache();');
    expect(appVue).toContain('clearTermsStash();');
    expect(appVue).toContain('__clearFieldCache();');
    expect(appVue).toContain('__clearAliasCache();');
    expect(appVue).toContain('router.replace({ path: route.path, query: {} })');
    expect(terms).toContain('export function clearTermsStash()');
    expect(aliases).toContain('export function __clearAliasCache()');
  });

  it('app 内存重置覆盖未消费通知与在飞世代', () => {
    expect(appStore).toContain('indicesSeq++;');
    expect(appStore).toContain('connsSeq++;');
    expect(appStore).toContain('notifyQueue.value = [];');
    expect(appStore).toContain('verInflight = null;');
  });

  it('用户管理/重绑仅在 ADMIN 时发车（初始化窗口除外）', () => {
    expect(auth).toContain("clean.includes('/auth/users') && !isAdmin()");
    expect(auth).toContain("clean.endsWith('/setup/rebind')");
  });

  it('客户端拦截提示明确「请求未发出」且给出下一步', () => {
    expect(api).toContain('请求未发出');
    expect(api).toContain('页面/连接的写权限');
  });
});

describe('1046 DevTools 前后端同口径（UI 不再亮必 403 的执行钮）', () => {
  it('系统 API 路径的后续索引用段同样做控制面判定', () => {
    expect(nonAdminControlIndexDenied('/_cat/indices/esquerystudio_user')).toBe(true);
    expect(nonAdminControlIndexDenied('/_cluster/state/metadata/esquerystudio_users')).toBe(true);
    expect(nonAdminControlIndexDenied('/_cat/indices/_all')).toBe(true);
    expect(nonAdminControlIndexDenied('/_all')).toBe(true);
  });

  it('业务索引/文档 id 不被过度误杀', () => {
    expect(nonAdminControlIndexDenied('/logs/_search')).toBe(false);
    expect(nonAdminControlIndexDenied('/app_esquerystudio_logs/_search')).toBe(false);
    expect(nonAdminControlIndexDenied('/logs/_doc/1')).toBe(false);
  });

  it('_msearch 的 indices 字符串形态也校验', () => {
    expect(nonAdminBodyTargetsControl('/_msearch', '{"indices":"esquerystudio_user"}\n{"query":{"match_all":{}}}\n')).toBe(true);
    expect(nonAdminBodyTargetsControl('/_msearch', '{"indices":"logs"}\n{"query":{"match_all":{}}}\n')).toBe(false);
  });

  it('SQL FROM 逗号列表逐个目标校验', () => {
    expect(nonAdminBodyTargetsControl('/_sql', '{"query":"SELECT * FROM logs, esquerystudio_user"}')).toBe(true);
    expect(nonAdminBodyTargetsControl('/_sql', '{"query":"SELECT * FROM logs"}')).toBe(false);
  });

  it('检索 body 的二级数据源（terms lookup / wrapper / MLT）同权校验', () => {
    const lookup = '{"query":{"terms":{"u":{"index":".security","id":"1","path":"username"}}}}';
    expect(nonAdminBodyTargetsControl('/logs/_search', lookup)).toBe(true);
    const inner = JSON.stringify({ terms: { u: { index: 'esquerystudio_user' } } });
    const wrapper = JSON.stringify({ query: { wrapper: { query: inner } } });
    expect(nonAdminBodyTargetsControl('/_search', wrapper)).toBe(true);
    const mlt = '{"query":{"more_like_this":{"like":[{"_index":"esquerystudio_user","_id":"1"}]}}}';
    expect(nonAdminBodyTargetsControl('/logs/_search', mlt)).toBe(true);
    expect(nonAdminBodyTargetsControl('/logs/_search', '{"query":{"term":{"user":"alice"}}}')).toBe(false);
  });

  it('health 索引级视图与编码分隔符按后端 fail-closed', () => {
    expect(nonAdminHealthLevelEnumeration('/_cluster/health?level=indices')).toBe(true);
    expect(nonAdminHealthLevelEnumeration('/_cluster/health?level=shards')).toBe(true);
    expect(nonAdminHealthLevelEnumeration('/_cluster/health?level=cluster')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/logs%2F_search')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/logs%3Bx/_search')).toBe(false);
  });

  it('?source= 的 PIT 搜索不被 UI 误禁（后端允许即有权限的人可执行）', () => {
    const source = encodeURIComponent('{"pit":{"id":"p1"}}');
    expect(nonAdminRootSearchNeedsIndex(`/_search?source=${source}`)).toBe(false);
    expect(nonAdminRootSearchNeedsIndex('/_search')).toBe(true);
  });
});

describe('1048 通配/日期数学目标的前置提示', () => {
  it('通配/日期数学/跨集群目标给出后端解析提示', () => {
    for (const p of ['/logs-*/_search', '/remote:logs/_search', '/logs-<2026.01.01>/_search']) {
      expect(nonAdminWildcardTargetAdvisory(p), p).toContain('后端解析');
    }
    expect(nonAdminWildcardTargetAdvisory('/logs/_search')).toBeNull();
  });

  it('body 二级目标的通配同样提示', () => {
    expect(nonAdminWildcardTargetAdvisory('/_bulk', '{"index":{"_index":"logs-*"}}')).toContain('后端解析');
    expect(nonAdminWildcardTargetAdvisory('/_bulk', '{"index":{"_index":"logs"}}')).toBeNull();
    expect(nonAdminWildcardTargetAdvisory('/_sql', '{"query":"SELECT * FROM logs-*"}')).toContain('SQL');
  });
});
