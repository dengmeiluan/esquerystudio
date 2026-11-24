/**
 * R130 一百八十六批：TasksView 任务节点右键菜单（E 组逐表过 dbx 清单）。
 * 锁定：行 contextmenu 接 CellContextMenu——复制 taskId/复制任务信息/
 * 取消任务（仅 cancellable，danger+sep，走既有 askConfirm 链）。
 * 判定：任务树是层级清单非列式表格，列管理/冻结列不适配（记录防重扫）。
 * 源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/TasksView.vue'), 'utf-8');

describe('TasksView 任务节点右键菜单（一百八十六批）', () => {
  it('行接 contextmenu；CellContextMenu 渲染；菜单项齐备', () => {
    expect(src).toMatch(/@contextmenu\.prevent="openTaskMenu\(\$event, t\)"/);
    expect(src).toMatch(/<CellContextMenu v-if="taskMenu" :x="taskMenu\.x" :y="taskMenu\.y" :title="taskMenu\.t\.taskId"/);
    expect(src).toContain("key: 'copy-id', label: '复制 taskId'");
    expect(src).toContain("key: 'copy-row', label: '复制任务信息'");
    /* 963：右键取消项同受角色门（canWrite=OPERATOR+），viewer 不再看到取消入口 */
    expect(src).toMatch(/\.\.\.\(t\.cancellable && canWrite\.value \? \[\{ key: 'cancel', label: '取消任务…', icon: X, danger: true, sep: true, run: \(\) => cancelOne\(t\) \}\] : \[\]\)/);
  });

  it('任务信息事实串含诊断关键字段', () => {
    expect(src).toContain('taskId=${t.taskId} action=${t.action} node=${t.node} running=${fmtDur(t.runningMs)}');
  });
});

describe('任务树取消原因透传（一百九十五批补·原 183 口径）', () => {
  it('取消失败原因按 taskId 持久展示在任务行上（cancelFailures Map）', () => {
    expect(src).toMatch(/const cancelFailures = ref\(new Map<string, string>\(\)\);/);
    expect(src).toMatch(/cancelFailures\.value\.set\(t\.taskId, reason\)/);
    expect(src).toMatch(/cancelFailures\.value\.delete\(t\.taskId\)/);
    expect(src).toMatch(/v-if="cancelFailures\.has\(t\.taskId\)" class="tv-cancel-err"/);
    expect(src).toMatch(/const reason = friendlyEsError\(String\(e\?\.message \|\| e\)\);/);
  });
});
