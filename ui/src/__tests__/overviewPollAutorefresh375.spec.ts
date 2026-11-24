/**
 * 三百七十五批：Overview 5s 进度轮询合并 useAutoRefresh（358 批 Xmigrate 同款）——
 * 此前裸 setInterval 只挂 onBeforeUnmount，KeepAlive 失活/后台标签页照跑；
 * 合并后 KeepAlive/visibilitychange/卸载全链停续。动态续停语义保留：每轮 load 尾部
 * restart 按 hasActiveJob 重估间隔（任务终态自然停），guard 双保险防隐藏态回切多刷。
 * 全站自制数据轮询孤岛至此清零（Adhoc 单作业 2s 盯梢/DslQuery 读秒/Workspace 时钟
 * 为不同语义不计）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');
const ar = readFileSync(join(__dirname, '../composables/useAutoRefresh.ts'), 'utf-8');

describe('Overview 轮询合并（375 批）', () => {
  it('useAutoRefresh 接管：hasActiveJob getter + guard + setOn，裸 setInterval 清零', () => {
    expect(v).toMatch(/const ovRefresher = useAutoRefresh\(load, \{/);
    expect(v).toMatch(/ms: \(\) => \(hasActiveJob\.value \? 5000 : 0\),/);
    expect(v).toMatch(/guard: \(\) => hasActiveJob\.value,/);
    expect(v).toMatch(/ovRefresher\.setOn\(true\);/);
    expect(v).not.toMatch(/setInterval\(/);
    expect(v).not.toMatch(/pollTimer/);
  });

  it('每轮 load 尾部 restart（间隔随任务态重估，终态自然停）', () => {
    expect(v).toMatch(/ovRefresher\.restart\(\);/);
    expect(v).toMatch(/const hasActiveJob = computed\(\(\) => \(overview\.value\?\.indices \|\| \[\] as any\[\]\)\.some\(\(i: any\) => i\?\.job && isActiveStage\(i\.job\.stage\)\)\);/);
  });

  it('useAutoRefresh 自带卸载清理（视图不再自挂 onBeforeUnmount 停轮询）', () => {
    expect(ar).toMatch(/onBeforeUnmount\(\(\) => \{\s*stop\(\);/);
    expect(v).not.toMatch(/onBeforeUnmount\(stopPoll\)/);
  });
});
