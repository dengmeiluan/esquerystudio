/**
 * 五百二十五批：RT 增量渲染（QRT 303 批同款平移，renderMore 对标唯一内核增量）。
 * 锁定：renderLimit 状态 + 行集变化自动回首批 + renderMore；截断行 sentinel +
 * 「继续渲染下 2000 行」钮 + 兜底文案；IntersectionObserver 自动续渲接线；
 * 计数/查找提示行动态口径（renderHits.length——续渲后 2000→4000 不再失真）。
 * 行为初始态（2000 行+提示行）由 renderGuard/rtRenderNavTrunc 既有锚护住，此处源码锁为主。
 * 五百二十八批 W-A 同步更新（TableShell 第二刀）：逻辑同构段抽至 useRenderMore——源码锚改指
 * composable 本体 + RT 接线行（行集重命名 renderHits 保 228 批 M1 引用面），模板文案保位不动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const rm = readFileSync(join(__dirname, '../composables/useRenderMore.ts'), 'utf-8');

describe('RT 增量渲染（五百二十五批，QRT 303 平移）', () => {
  it('renderLimit 状态 + 行集变化自动回首批 + renderMore（528 同步更新：逻辑在 useRenderMore）', () => {
    expect(rm).toMatch(/const renderLimit = ref\(MAX_RENDER\);/);
    expect(rm).toMatch(/watch\(\(\) => sorted\(\)\.length, \(\) => \{ renderLimit\.value = MAX_RENDER; \}\);/);
    expect(rm).toMatch(/const rows = computed\(\(\) => sorted\(\)\.slice\(0, renderLimit\.value\)\);/);
    expect(rm).toMatch(/const truncated = computed\(\(\) => sorted\(\)\.length > renderLimit\.value\);/);
    expect(rm).toMatch(/function renderMore\(\) \{ renderLimit\.value \+= MAX_RENDER; \}/);
    expect(rt).toContain('继续渲染下 {{ MAX_RENDER }} 行');
    /* RT 接线：行集重命名 renderHits（HitNav/键盘行导航/右键取行唯一行源，引用面保位） */
    expect(rt).toMatch(/const \{ rows: renderHits, truncated: renderTruncated, renderMore, truncSentinel \} =\s*useRenderMore\(\(\) => sortedHits\.value, \(\) => rootEl\.value\);/);
  });

  it('截断行 sentinel + IntersectionObserver 自动续渲接线（root=组件根）', () => {
    expect(rt).toMatch(/<tr v-if="renderTruncated" ref="truncSentinel" class="rt-trunc-row">/);
    expect(rm).toMatch(/const truncSentinel = ref<HTMLElement \| null>\(null\);/);
    expect(rm).toContain('new IntersectionObserver');
    expect(rm).toMatch(/root: root\(\), rootMargin: '80px'/);
    /* happy-dom 无 IntersectionObserver 时的环境守卫（QRT 同款早退） */
    expect(rm).toMatch(/typeof IntersectionObserver === 'undefined'/);
  });

  it('计数/查找/截断行三处提示改动态口径（renderHits.length，续渲不失真）', () => {
    expect(rt).toMatch(/已渲染前 \{\{ renderHits\.length \}\} 行（导出不受影响）/);
    expect(rt).toMatch(/≈ 前 \{\{ renderHits\.length \}\} 行/);
    expect(rt).toMatch(/已渲染前 \{\{ renderHits\.length \}\} 行（共 \{\{ sortedHits\.length \}\} 行命中排序与筛选）/);
    /* 兜底文案保留（renderGuard:44 锚「完整数据请用「导出」」） */
    expect(rt).toContain('完整数据请用「导出」，或缩小查询 size');
  });
});
