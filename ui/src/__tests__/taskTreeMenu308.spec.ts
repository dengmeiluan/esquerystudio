/**
 * 三百零八批：TaskTreeView 任务行右键菜单（复制 taskId/复制信息/查看详情/取消 danger）。
 * 与详情栏动作同源（cancelOne/pick 复用），CellContextMenu 第三+场景。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/TaskTreeView.vue'), 'utf-8');

describe('TaskTree 右键菜单（308 批）', () => {
  it('contextmenu 绑定+菜单项齐', () => {
    expect(v).toMatch(/@contextmenu\.prevent="openRowMenu\(\$event, root\)"/);
    expect(v).toMatch(/<CellContextMenu v-if="rowMenu" :x="rowMenu\.x" :y="rowMenu\.y"/);
    for (const anchor of ["key: 'copy-id'", "key: 'copy-desc'", "key: 'detail'", "key: 'cancel', label: '取消任务', icon: X, danger: true"]) {
      expect(v, anchor).toContain(anchor);
    }
  });
  it('动作同源：cancelOne/pick 复用', () => {
    /* facts 改造后 cancelOne 追加第二参（执行节点名，确认弹窗 facts 用）——正则放宽参数尾，
       仍锚定「菜单取消项复用 cancelOne」的同源语义 */
    expect(v).toMatch(/void cancelOne\(rm\.n\.taskId(, rm\.n\.node)?\)/);
    expect(v).toMatch(/pick\(rm\.n\)/);
  });
});
