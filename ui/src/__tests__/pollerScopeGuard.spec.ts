/**
 * R130 一百九十批：全局轮询器权限感知（审计刷屏架构修复的前端止血层）。
 * 根因链：VIEWER（宿主 SPI 白名单不含 diag/xmigrate/adhoc-rebuild）停留任意页面时，
 * TopBar 常驻 jobTracker（每 20s 轮询 adhoc+xmigrate jobs）与实时大屏 liveMonitor
 * （采样 pending-tasks）对无权限端点持续 403 → 后端逐条落 PAGE_DENIED → 审计流被
 * 同质心跳刷屏（产线实证：每分钟 3 条、无限重复）。
 * 修复：①轮询器权限感知——白名单不含对应页时跳过该请求（本文件锁定）；
 * ②后端 DedupConsoleOpsAuditStore 聚合兜底（Java 单测覆盖）。
 * 五百五十七批（锁同步更新+扩员）：grantedPages 为连接键形态（conn:{id}:{page}，宿主
 * 连接菜单模型）时裸 includes 恒 false——①有授权被静默跳过（能力反向丢失）②快照通道
 * 不看 snapshots 页授权每 20s 裸打（产线 81,572 条 PAGE_DENIED 的循环主源）。改为
 * effectivePagesForTarget 按当前目标解析有效页集判定；连接模型数据面须目标钉选；
 * 无授权连接的全停形态给用户一次性明示。
 * 源码锁（轮询时序的权限行为依赖异步 grantedPages 到达，组件级难以稳定行为化）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const jobTracker = readFileSync(join(__dirname, '../stores/jobTracker.ts'), 'utf-8');
const liveMonitor = readFileSync(join(__dirname, '../stores/liveMonitor.ts'), 'utf-8');

describe('全局轮询器权限感知（一百九十批+五百五十七批连接键感知）', () => {
  it('jobTracker：poll 按有效页集裁剪 adhoc/xmigrate 通道（连接键解析）', () => {
    expect(jobTracker).toMatch(/const eff = admin \? null : effectivePagesForTarget\(granted, target\);/);
    expect(jobTracker).toMatch(/const can = \(pageKey: string\) => admin \|\| \(\(eff == null \|\| eff\.has\(pageKey\)\) && auth\.envAllows\(pageKey, target\)\);/);
    expect(jobTracker).toMatch(/can\('adhoc-rebuild'\)/);
    expect(jobTracker).toMatch(/can\('xmigrate'\)/);
    expect(jobTracker).toMatch(/wantAdhoc \? api\.adhoc\.jobs\(\)/);
    expect(jobTracker).toMatch(/wantXm \? api\.xb\.jobs\(30\)/);
  });

  it('jobTracker：快照通道受 snapshots 页授权约束+连接模型须目标钉选（20s PAGE_DENIED 循环根治）', () => {
    expect(jobTracker).toMatch(/const dataReady = !!app\.target \|\| \(\!\!app\.hostVisible && !connModel\);/);
    expect(jobTracker).toMatch(/const wantSnaps = dataReady && can\('snapshots'\);/);
    expect(jobTracker).toMatch(/wantSnaps \? api\.snapshotStatus\(\)/);
    /* 用户感知：无授权连接的全停形态一次性明示（不再静默） */
    expect(jobTracker).toMatch(/connModel && !dataReady && app\.conns\.length > 0 && !pollSilentNotified/);
  });

  it('liveMonitor：无 diag 权限时跳过 pending-tasks 采样（连接键感知）', () => {
    expect(liveMonitor).toMatch(/const eff = admin \? null : effectivePagesForTarget\(auth\.grantedPages, target\);/);
    expect(liveMonitor).toMatch(/const canDiag = canAny\(\['diag'\]\);/);
    expect(liveMonitor).toMatch(/canDiag \? api\.pendingTasks\(\)/);
  });
});
