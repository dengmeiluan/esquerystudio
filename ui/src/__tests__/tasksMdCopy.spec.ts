/**
 * R130 一百四十四批：TasksView 任务列表 Markdown 复制（卡死任务排障贴群）。
 * 源码级锁：
 * 1) copyTasksMd 四列表（任务/节点/描述/时长）+ 复制通知；
 * 2) 「Markdown」按钮接线（flatList 有数据才显示，排在展开钮之前）；
 * 3) 行序=flatList（当前展开状态所见即所得）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/TasksView.vue'), 'utf-8');

describe('TasksView Markdown 复制（144 批）', () => {
  it('copyTasksMd 四列表结构+复制通知', () => {
    expect(src).toMatch(/async function copyTasksMd\(\)/);
    expect(src).toContain('| 任务 | 节点 | 描述 | 运行时长 |');
    expect(src).toContain('个任务（Markdown）');
  });

  it('按钮接线且行序跟随 flatList', () => {
    expect(src).toMatch(/v-if="flatList\.length" class="btn sm ghost" style="margin-left:auto" @click="copyTasksMd"/);
    expect(src).toMatch(/const rows = flatList\.value;/);
  });
});
