/**
 * 二百六十八批：RT 内置 loading 骨架（QRT 四态互斥同款）——宿主手搓骨架合并。
 * 骨架优先于空态/表格；IndexHub 外部骨架 div 退役改传 :loading。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rt = read('../components/ResultTable.vue');
const ih = read('../views/IndexHubView.vue');

describe('RT 内置加载骨架（268 批）', () => {
  it('prop/骨架优先级/双表互斥', () => {
    expect(rt).toMatch(/loading\?: boolean;/);
    expect(rt).toMatch(/<template v-if="loading">/);
    expect(rt).toMatch(/<EmptyState v-else-if="!hits\.length"/);
    expect(rt).toMatch(/v-if="!loading && !effTranspose"/);
    expect(rt).toMatch(/v-else-if="!loading" class="tbl rt-tbl rt-transposed"/);
    expect(rt).toContain('SkeletonBox');
  });
  it('IndexHub 外部骨架退役改传 :loading', () => {
    expect(ih).toMatch(/:loading="docsLoading"/);
    expect(ih, 'docs 表外部骨架退役（其余区块骨架不在此锁）').not.toMatch(/docsLoading\" style|v-if="docsLoading" style="padding/);
    expect(ih).toMatch(/<template v-if="docsRan">/);
  });
});
