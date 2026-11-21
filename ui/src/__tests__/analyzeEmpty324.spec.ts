/**
 * 三百二十四批：AnalyzeView 空态 EmptyState 合并（裸 div.empty 清零）+骨架 margin 归 gap。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/AnalyzeView.vue'), 'utf-8');

describe('AnalyzeView 空态（324 批）', () => {
  it('EmptyState 化+裸 empty 清零+骨架 gap', () => {
    expect(v).toMatch(/<EmptyState v-else-if="!tokens\.length" :icon="SearchCode"/);
    expect(v).not.toMatch(/class="empty">运行请求后/);
    expect(v).not.toMatch(/SkeletonBox[^>]*margin-bottom/);
    /* 五百二十七批同步更新：骨架容器 gap 收 --sp 半档（10px → --sp-2h），骨架语义不变 */
    expect(v).toMatch(/running" class="av-tokens" style="display:flex;flex-direction:column;gap:var\(--sp-2h\)"/);
  });
});
