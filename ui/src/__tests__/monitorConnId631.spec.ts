/**
 * 六百三十一批：集群概览「集群监控历史」的**筛选集群下拉空白**修复——用户实报「这个不显示选中全部集群」。
 *
 * 实锚：用户产线截图里集群监控历史的三行筛选＝「筛选集群 / 全部状态 / 时间范围」（与模板顺序一致），
 * 其中第二三行正常显示「全部状态」「最近 1 小时」，**第一行空白**。
 *
 * 根因（name / id 语义错位）：`mhConn` 的 option 值是连接 **id**（`:value="c.id"`），同一个值又下推
 * `api.monitorHistory({ connId })`；但初始化写的是 `store.conns.find(...)?.name`。当数据面目标是
 * 远程集群时 `mhConn` = 连接**实名**，没有任何 option 命中 → 原生 `<select>` 渲染为空白；
 * 同时把实名当 connId 下推服务端。target 为空（宿主）时反而正常显示「全部集群」，故该缺陷只在
 * 选中远程集群后暴露。
 *
 * 修法：① `mhConn` 统一 id 语义；② 补「target 须在连接档案内」守卫——已删/失联 target 回落
 * 「全部集群」而不是再次落回空白坑；③ `watch(mhConnOfTarget)` 跟随顶部集群切换器（与
 * LiveDashboardView 599 批同律：切换器换集群重新跟随，同 target 内用户手改不回弹）。
 *
 * 风格：source-lock（cluster 视图既有 spec 全为源码锁，原生控件挂载易碎）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ov = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');

describe('筛选集群下拉不再空白（631 批·用户实报「不显示选中」）', () => {
  it('mhConn 初始化为 id 语义空值，不再用连接实名初始化', () => {
    expect(ov).toMatch(/const mhConn = ref\(''\);/);
    /* 红证据锚：旧行以 `store.target && store.conns.find(...)?.name` 初始化 */
    expect(ov).not.toMatch(/mhConn = ref\(store\.target/);
  });

  it('target→id 守卫：target 必须在连接档案内，否则回落「全部集群」空值', () => {
    expect(ov).toMatch(
      /mhConnOfTarget = computed\(\(\) => \(visibleConns\.value\.some\(c => c\.id === store\.target\) \? store\.target : ''\)\)/,
    );
  });

  it('跟随顶部集群切换器（watch immediate；切换器换集群重新跟随）', () => {
    expect(ov).toMatch(/watch\(mhConnOfTarget, \(id\) => \{ if \(id\) mhConn\.value = id; \}, \{ immediate: true \}\)/);
  });

  it('option 与下推参数同源 id 语义（既有契约不回退）', () => {
    expect(ov).toMatch(/<option value="">全部集群<\/option>/);
    expect(ov).toMatch(/<option v-for="c in visibleConns" :key="c\.id" :value="c\.id">\{\{ c\.name \}\}<\/option>/);
    /* 下推参数与下拉同源：conn 为 loadHistory 起手的筛选源快照（定义行锁同源性），
 迟到回包丢弃守卫不得改变「下推值=mhConn 快照」语义 */
    expect(ov).toMatch(/const conn = mhConn\.value/);
    expect(ov).toMatch(/connId: conn \|\| undefined/);
  });

  it('三筛选（集群/状态/时间范围）模板顺序不变——截图行序锚不回退', () => {
    const iConn = ov.indexOf('aria-label="筛选集群"');
    const iStatus = ov.indexOf('aria-label="筛选状态"');
    const iRange = ov.indexOf('aria-label="时间范围"');
    expect(iConn).toBeGreaterThan(-1);
    expect(iStatus).toBeGreaterThan(iConn);
    expect(iRange).toBeGreaterThan(iStatus);
  });
});
