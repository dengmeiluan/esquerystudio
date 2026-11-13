/**
 * 一千零四批·开发者工具「根级检索」范围规则的前端镜像。
 *
 * 后端 `guardAllIndexRead` 对根级 `/_search` / `/_count` / `/_field_caps` / `/_async_search`
 * / `/_terms_enum` / `/_rank_eval` / `/_search/template` 要求显式 index/indices（裸调用=全量读，
 * 会把控制面索引读出来）；唯一豁免是 body 带有效 `pit.id`（PIT 搜索按 ES 契约不带 index）。
 *
 * 此前前端一律放行 → 非 ADMIN 点「执行」才吃 403（看得见点不了）。这里把同一条规则前置，
 * 并让按钮 tooltip 说清怎么改（加 ?index= 或改用 PIT）。
 */
import { describe, it, expect } from 'vitest';
import { nonAdminRootSearchNeedsIndex, nonAdminDataPlaneWriteAllowed,
  nonAdminIndexQueryParamRejected, nonAdminControlIndexDenied } from '../utils/devtoolsScope';

describe('1004:根级检索缺索引范围 → 前端提前禁用', () => {
  it('裸根级检索需要索引', () => {
    for (const p of ['/_search', '/_count', '/_field_caps', '/_async_search',
      '/_terms_enum', '/_rank_eval', '/_search/template']) {
      expect(nonAdminRootSearchNeedsIndex(p), p).toBe(true);
    }
  });

  it('查询参数 index/indices 不构成限定（单独判定）', () => {
    /* 后端理由：无法证明目标端按其路由（忽略即全量），且与路径并存时目标二义 */
    expect(nonAdminIndexQueryParamRejected('/_search?index=logs')).toBe(true);
    expect(nonAdminIndexQueryParamRejected('/logs/_search?index=orders')).toBe(true);
    expect(nonAdminIndexQueryParamRejected('/_search?indices=a,b')).toBe(true);
    expect(nonAdminIndexQueryParamRejected('/_search?size=10')).toBe(false);
    expect(nonAdminIndexQueryParamRejected('/logs/_search')).toBe(false);
    /* 根级检索只认路径形式或 PIT：带 index 参数仍是「缺范围」 */
    expect(nonAdminRootSearchNeedsIndex('/_search?index=logs')).toBe(true);
  });

  it('控制面/系统索引与通配提前禁用', () => {
    expect(nonAdminControlIndexDenied('/esquerystudio_user/_doc/1')).toBe(true);
    expect(nonAdminControlIndexDenied('/.security/_search')).toBe(true);
    expect(nonAdminControlIndexDenied('/logs*_esquerystudio_lock/_search')).toBe(true);
    expect(nonAdminControlIndexDenied('/esq*/_search')).toBe(true);
    expect(nonAdminControlIndexDenied('/*/_search')).toBe(true);
    expect(nonAdminControlIndexDenied('/logs/_search')).toBe(false);
    expect(nonAdminControlIndexDenied('/orders-2026/_doc/1')).toBe(false);
    /* 系统 API 首段是 _，交给其它规则 */
    expect(nonAdminControlIndexDenied('/_search')).toBe(false);
  });

  it('PIT 搜索豁免（body 带有效 pit.id）', () => {
    expect(nonAdminRootSearchNeedsIndex('/_search', '{"pit":{"id":"abc"},"query":{"match_all":{}}}'))
      .toBe(false);
    expect(nonAdminRootSearchNeedsIndex('/_search', '{"pit":{"id":"  "}}')).toBe(true);
    expect(nonAdminRootSearchNeedsIndex('/_search', '{"query":{"match_all":{}}}')).toBe(true);
    expect(nonAdminRootSearchNeedsIndex('/_search', 'not-json')).toBe(true);
  });

  it('带索引前缀的路径与本规则无关', () => {
    expect(nonAdminRootSearchNeedsIndex('/logs/_search')).toBe(false);
    expect(nonAdminRootSearchNeedsIndex('/logs/_count')).toBe(false);
  });
});

describe('1004:范围规则接入数据面门（读写同规则）', () => {
  it('读形态：裸根检索禁用，查询参数不算限定', () => {
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_search')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_search?index=logs')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_cat/indices?format=json')).toBe(true);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/logs/_search')).toBe(true);
  });

  it('写形态：裸根检索禁用，PIT/显式 index 放行', () => {
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_search', '{"query":{"match_all":{}}}')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_search?index=logs', '{}')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_search', '{"pit":{"id":"abc"}}')).toBe(true);
    /* 既有放行项不回归 */
    expect(nonAdminDataPlaneWriteAllowed('POST', '/logs/_search', '{}')).toBe(true);
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_bulk', '{}')).toBe(true);
  });

  it('管理面写仍一律禁用（不受本规则影响）', () => {
    expect(nonAdminDataPlaneWriteAllowed('PUT', '/_cluster/settings', '{}')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('PUT', '/_template/x', '{}')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_pit', '{}')).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('DELETE', '/_pit', '{"id":"abc"}')).toBe(true);
  });
});
