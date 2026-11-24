/**
 * R130 第一百零七批：别名大组行折叠（性能轴）——300 索引的别名组全量渲染
 * 卡顿滚动；默认前 12 条 + 「展开全部」钮（展开集合按 alias 存，搜索过滤时
 * 自动全量——找东西别折叠）。
 * 锁定（静态）：shownRows 折叠逻辑 + 展开钮门控 + 搜索直通。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/AliasesView.vue'), 'utf-8');

describe('别名大组折叠（一百零七批）', () => {
  it('shownRows 折叠逻辑（ROW_LIMIT + 搜索直通 + expandedGroups 例外）', () => {
    expect(src).toMatch(/const ROW_LIMIT = 12;/);
    expect(src).toMatch(/function shownRows\(g: Group\)/);
    expect(src).toMatch(/if \(query\.value\.trim\(\) \|\| expandedGroups\.value\.has\(g\.alias\)\) return g\.rows;/);
    expect(src).toMatch(/return g\.rows\.slice\(0, ROW_LIMIT\);/);
  });

  it('展开钮门控（大组且非搜索态才出）与文案', () => {
    /* 第十批收尾：门控补 !query.trim()——过滤态 shownRows 恒全量、折叠意图无处落地，
       钮与行为脱节困惑，改为过滤态直接不出钮（所见即所得） */
    expect(src).toMatch(/v-if="!query\.trim\(\) && g\.rows\.length > ROW_LIMIT"/);
    expect(src).toContain('展开全部 ${g.rows.length} 个索引');
  });
});
