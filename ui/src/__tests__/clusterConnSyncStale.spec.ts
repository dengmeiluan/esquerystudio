/**
 * 连接中心自动同步批:失联标记(STALE)前端契约——
 * ①api.ts 类型面:ClusterConnView.syncState + ClusterSyncReport + 两同步端点方法;
 * ②ClusterSwitcher:切换菜单行与管理弹窗行对 syncState==='STALE' 置灰+「源已失联」角标
 *   (保留展示,人工确认后删——用户裁决:不自动删);③样式档在场。
 * source-lock 风格(本件既有 ClusterSwitcher spec 全为 source-lock,挂载走 naive 弹层易碎)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');
const apiSrc = readFileSync(join(__dirname, '../api.ts'), 'utf-8');

describe('api.ts 连接中心同步契约面', () => {
  it('ClusterConnView 带 syncState 可选键', () => {
    expect(apiSrc).toMatch(/syncState\?: string \| null;/);
  });
  it('ClusterSyncReport 报告形状在案(计数+notes+contributorBroken)', () => {
    expect(apiSrc).toMatch(/^interface ClusterSyncReport \{/m); /* 七百九十一批同步更新：export 声明形态→^行锚（791 私有化零外部消费） */
    expect(apiSrc).toContain('contributorBroken: boolean;');
    expect(apiSrc).toContain('markedStale: number;');
    expect(apiSrc).toContain('notes: string[];');
  });
  it('clustersSyncStatus/clustersSyncRun 指向 /clusters/sync(/run)', () => {
    expect(apiSrc).toContain("clustersSyncStatus: () => get<ClusterSyncReport | null>('/clusters/sync')");
    expect(apiSrc).toContain("clustersSyncRun: () => post<ClusterSyncReport>('/clusters/sync/run')");
  });
});

describe('ClusterSwitcher 失联角标与置灰', () => {
  it('切换菜单行:stale 类绑定+「源已失联」角标带说明 title', () => {
    expect(cs).toMatch(/\{ on: store\.target === c\.id, stale: c\.syncState === 'STALE' \}/);
    expect(cs).toContain(`<span v-if="c.syncState === 'STALE'" class="cs-stale"`);
    expect(cs).toContain('连接中心已无此连接');
  });
  it('管理弹窗行:stale 类绑定+同款角标', () => {
    expect(cs).toMatch(/:class="\{ err: c\.health\?\.status === 'RED', stale: c\.syncState === 'STALE' \}"/);
    expect(cs).toContain('确认不再需要可删除');
  });
  it('样式档:.cs-item.stale/.cm-row.stale/.cs-stale 在场(token 化配色不新增裸色值)', () => {
    expect(cs).toContain('.cs-item.stale');
    expect(cs).toContain('.cm-row.stale');
    expect(cs).toContain('.cs-stale');
  });
});
