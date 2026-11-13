/* 五百五十一批 W5(轨5 自适应与全栈):useAutoRefresh 接线全域审计反锁(零产品码改动,纯反锁)。
 * 口径:useAutoRefresh 是全站自动刷新单源(composables/useAutoRefresh.ts:18 暴露 setOn,
 * 间隔变更经 setOn 重启定时器);裸 setInterval 自拉轮询会绕开该单源(页隐藏不暂停/间隔
 * 变更不生效/卸载泄漏),248 批合并后 views 内应只剩本地秒表/读秒类计时器。
 *
 * ① 11 消费点 13 接线双锚在场(readFileSync 源码锁各文件含 useAutoRefresh( 与 .setOn():
 *    IlmView/AdhocRebuildView(双接线:jobPoller+手动档)/DslQueryView(watch 档)/OverviewView(
 *    双接线:主加载+监控历史自动刷新,后者曾整实例漏 setOn 成死开关)/SlmView/DiagView/
 *    TopologyView/TaskTreeView/SnapshotsView/TasksView/XmigrateView),
 *    拆任一接线即红;
 * ② views 内裸 setInterval 白名单恰 4 文件(AdhocRebuildView/DslQueryView/PitScrollView/
 *    WorkspaceView——block/elapsed/读秒/时钟本地计时,与自动刷新轮询语义无关),出现第 5
 *    文件即红(新轮询必须走 useAutoRefresh)。
 * ③(五百五十七批扩锚)XmigrateView 轮询启停同源反锁——ms getter 只在 start() 采样一次
 *    (useAutoRefresh 契约「间隔变更由调用方重启」):零 RUNNING 挂载→首作业转 RUNNING 后
 *    轮询永不启动、RUNNING 中→转终态永不停表(556 备案件)。修复形态=hasRunningJob
 *    computed + watch → xmRefresher.restart() 双向接线(OverviewView 每轮 restart 先例),
 *    拆任一半边即红;不新增 setOn(锚①总数随 OverviewView 双接线升 13 守恒)。
 *
 * 豁免备案(views 外 4 处,不在断言面):composables/useQueryRun.ts:23 读秒器(查询耗时显示)/
 * composables/useNow.ts:13 单例心跳(30s now 广播,全站共享时钟单源)/stores/jobTracker.ts:307
 * 作业轮询器(ACTIVE/IDLE 双频调度)/stores/liveMonitor.ts:259 live 指标轮询器(effectiveMs
 * 自适应)——四者均为 store/composable 级全局单例或短生命周期读秒,非视图轮询,维持豁免。 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* 11 消费点(AdhocRebuildView/OverviewView 双接线单独断言 setOn 恰 2,其余各恰 1) */
const CONSUMERS = [
  'IlmView', 'AdhocRebuildView', 'DslQueryView', 'OverviewView', 'SlmView', 'DiagView',
  'TopologyView', 'TaskTreeView', 'SnapshotsView', 'TasksView', 'XmigrateView',
] as const;

/* ② 白名单:views 内裸 setInterval 恰此 4 文件(注释文字提及不算新接线,按文件级集合断言) */
const SETINTERVAL_ALLOWLIST = [
  'AdhocRebuildView', 'DslQueryView', 'PitScrollView', 'WorkspaceView',
] as const;

const viewsDir = join(__dirname, '..', 'views');
const srcOf = (name: string) => readFileSync(join(viewsDir, `${name}.vue`), 'utf-8');

describe('五百五十一批 W5:useAutoRefresh 接线全域审计(11 消费点双锚 + 裸 setInterval 白名单)', () => {
  it('① 11 消费点 useAutoRefresh( 与 .setOn( 双锚在场;AdhocRebuildView 双接线恰 2、其余各恰 1', () => {
    for (const name of CONSUMERS) {
      const src = srcOf(name);
      expect(src, `${name}.vue 丢 useAutoRefresh( 接线(不得回退裸轮询)`).toMatch(/useAutoRefresh\(/);
      expect(src, `${name}.vue 丢 .setOn( 间隔变更接线`).toMatch(/\.setOn\(/);
    }
    /* 双接线点:AdhocRebuildView jobPoller+手动档、OverviewView 主加载+监控历史自动刷新
     (九三九批补齐 mh 实例整漏的 setOn 接线)两处 setOn;其余 9 文件各 1,合计 13 接线 */
    const adhoc = srcOf('AdhocRebuildView').match(/\.setOn\(/g) ?? [];
    expect(adhoc.length, 'AdhocRebuildView 应保持双 setOn 接线(jobPoller+手动档)').toBe(2);
    const ovw = srcOf('OverviewView').match(/\.setOn\(/g) ?? [];
    expect(ovw.length, 'OverviewView 应保持双 setOn 接线(主加载+监控历史自动刷新)').toBe(2);
    let total = adhoc.length + ovw.length;
    for (const name of CONSUMERS) {
      if (name === 'AdhocRebuildView' || name === 'OverviewView') continue;
      total += (srcOf(name).match(/\.setOn\(/g) ?? []).length;
    }
    expect(total, '全站 useAutoRefresh setOn 接线总数(11 消费点)').toBe(13);
  });

  it('② views 内裸 setInterval 白名单恰 4 文件(第 5 文件=绕开单源的新轮询,即红)', () => {
    const hits: string[] = [];
    for (const f of readdirSync(viewsDir).filter((x) => x.endsWith('.vue')).sort()) {
      if (/setInterval\(/.test(readFileSync(join(viewsDir, f), 'utf-8'))) {
        hits.push(f.replace(/\.vue$/, ''));
      }
    }
    expect(hits.sort()).toEqual([...SETINTERVAL_ALLOWLIST].sort());
  });

  /* 五百五十七批扩锚:Xmigrate 轮询静默修复反锁(源码锁,启停判据与 ms 同源) */
  it('③ XmigrateView 轮询启停同源:hasRunningJob computed + watch → xmRefresher.restart() 在场', () => {
    const src = srcOf('XmigrateView');
    expect(src, '丢 hasRunningJob computed(启停判据与 ms 必须同源,不得回散两份 some())')
      .toMatch(/const hasRunningJob = computed\(/);
    expect(src, '丢 watch(hasRunningJob)→restart() 接线(零 RUNNING 挂载首作业转 RUNNING 不启表/RUNNING 转终态不停表即复发)')
      .toMatch(/watch\(hasRunningJob[\s\S]{0,120}xmRefresher\.restart\(\)/);
  });
});
