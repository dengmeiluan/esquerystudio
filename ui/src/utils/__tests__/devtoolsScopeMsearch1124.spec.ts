import { describe, it, expect } from 'vitest';
import {
  nonAdminDataPlaneWriteAllowed,
  nonAdminBodyTargetsControl,
} from '../devtoolsScope';

/**
 * 1124：DevTools 作用域判定的**前端**一侧回归。
 *
 * <p>背景（真实分叉）：后端 `guardMsearchBody` 对根路径 `/_msearch` 的空头行
 * （`{}` = 不限索引）判为全量读并拒绝，但前端此前只检查头部有没有写控制面索引，
 * 于是 UI 亮着可执行、点下去 403 —— 恰是「有权限的人被拦、无权限的人被误导」的反面教材里
 * 最糟的一种：界面承诺了后端不认的能力。</p>
 *
 * <p>本用例锁住修正后的三条语义，并顺带锁住「ES 把路径索引当作头默认索引」的差异化放行，
 * 防止未来把 `/{index}/_msearch` 也一并误禁（那会拦住有权限的人）。</p>
 */
const NL = String.fromCharCode(10);
const head = (o: string) => o + NL + '{"query":{"match_all":{}}}' + NL;

describe('1124 DevTools scope：_msearch 空头语义', () => {
  it('根路径空头 = 不限索引，前端必须禁用', () => {
    expect(nonAdminBodyTargetsControl('/_msearch', head('{}'))).toBe(true);
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_msearch', head('{}'))).toBe(false);
  });

  it('路径前缀空头继承路径索引，必须放行（ES 既有语义）', () => {
    expect(nonAdminBodyTargetsControl('/logs/_msearch', head('{}'))).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('POST', '/logs/_msearch', head('{}'))).toBe(true);
  });

  it('根路径显式业务索引放行；显式控制面索引禁用', () => {
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_msearch', head('{"index":"logs"}'))).toBe(true);
    expect(nonAdminDataPlaneWriteAllowed('POST', '/_msearch', head('{"index":"esquerystudio_user"}'))).toBe(false);
  });

  it('查询串形态的根级检索同样禁用（q=* / source=）', () => {
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_search?q=*', null)).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_search?q=*&size=100', null)).toBe(false);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_count?q=*', null)).toBe(false);
  });

  it('_cat 索引族走结果侧行过滤：JSON 行式放行，聚合形态禁用', () => {
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_cat/aliases?format=json', null)).toBe(true);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_cat/shards?format=json', null)).toBe(true);
    expect(nonAdminDataPlaneWriteAllowed('GET', '/_cat/count', null)).toBe(false);
  });
});
