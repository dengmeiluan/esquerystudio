/**
 * 二百四十八批：TasksView / TopologyView / TaskTreeView 轮询合并 useAutoRefresh。
 * 此前三视图各自手搓 setInterval：页面隐藏（后台标签页）与 KeepAlive 失活时照跑不止，
 * 与 DslQueryView 的 useAutoRefresh（P1-4）双轨并存。合并后全站轮询一个内核：
 * KeepAlive onActivated/onDeactivated + visibilitychange + onBeforeUnmount 全链停续，
 * tick 时再验 guard（loading 中跳过）。
 * 源码锁（照 pollerScopeGuard 口径）：useAutoRefresh 接线 + 裸 setInterval 清零。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('三视图轮询合并 useAutoRefresh（248 批）', () => {
  it('TasksView：useAutoRefresh 接线（ms 读 autoRefresh/intervalMs，guard 验 loading），无裸 setInterval', () => {
    const s = read('../views/TasksView.vue');
    expect(s).toMatch(/const refresher = useAutoRefresh\(load, \{/);
    expect(s).toMatch(/ms: \(\) => \(autoRefresh\.value \? intervalMs\.value : 0\)/);
    expect(s).toMatch(/guard: \(\) => !loading\.value/);
    expect(s).toMatch(/watch\(autoRefresh, \(v\) => \{ if \(v\) load\(\); refresher\.restart\(\); \}\)/);
    expect(s).not.toMatch(/setInterval\(/);
    expect(s).not.toMatch(/let timer/);
  });

  it('TopologyView：频率档接线（默认 10s 档保留，524 批换 AutoRefreshSelect），无裸 setInterval', () => {
    const s = read('../views/TopologyView.vue');
    expect(s).toMatch(/const refresher = useAutoRefresh\(load, \{/);
    expect(s).toMatch(/ms: \(\) => \(autoRefresh\.value \? tpIntervalMs\.value : 0\)/);
    expect(s).not.toMatch(/setInterval\(/);
    expect(s).not.toMatch(/let timer/);
  });

  it('TaskTreeView：refreshMs 档接线，无裸 setInterval', () => {
    const s = read('../views/TaskTreeView.vue');
    expect(s).toMatch(/const refresher = useAutoRefresh\(load, \{/);
    expect(s).toMatch(/ms: \(\) => \(autoRefresh\.value \? refreshMs\.value : 0\)/);
    expect(s).not.toMatch(/setInterval\(/);
    expect(s).not.toMatch(/let timer/);
  });
});
