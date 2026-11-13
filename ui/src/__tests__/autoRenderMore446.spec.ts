/**
 * 四百三十六批后新增：QRT 增量渲染滚动到底自动续渲——303 批按钮式「继续渲染下
 * 2000 行」在大结果集浏览中需反复精确点击；现哨兵行（截断提示行）进入视口即
 * 自动 renderMore（IntersectionObserver root=表格滚动容器、80px 预载边距），
 * 按钮保留作为兜底。数据重置（renderLimit 归位）后哨兵行 v-if 重挂自动重观察。
 * 五百二十八批 W-A 同步更新（TableShell 第二刀）：IO 全家随同构段抽至 useRenderMore
 * composable——源码锚改指 composable 本体 + QRT 接线行（解构重命名保模板引用面），
 * 模板哨兵行/按钮文案保位不动；行为抽样挂载锁见 tableShellSecondCut528。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rm = readFileSync(join(__dirname, '../composables/useRenderMore.ts'), 'utf-8');

describe('QRT 滚动自动续渲（446 批）', () => {
  it('哨兵行 ref+IntersectionObserver 自动 renderMore（528 同步更新：逻辑在 useRenderMore）', () => {
    /* 模板哨兵行保位；truncSentinel 解构自 composable，模板 ref 绑定不变 */
    expect(v).toMatch(/<tr v-if="renderTruncated" ref="truncSentinel" class="qrt-trunc-row">/);
    /* 五百五十四批同步更新（击穿者：tableKernelWave554 renderRows 截齐层）——composable 解构
       改名 renderRowsRaw 后接 computed 投影（visibleCols 陈旧清单与 rows 列数解耦时
       tbody 多渲染无表头列=产线实报 Diag 末两列无列名），锁意图=截断接线在案不破。
       五百五十四批二同步更新：截齐改按 shownCols 投影（数量 slice 在隐藏列交错时切错位+
       值串列，88 批自愈挂载态实证）；恒等态原数组直通保 rawIdxMap 引用匹配 */
    expect(v).toMatch(/const \{ rows: renderRowsRaw, truncated: renderTruncated, renderMore, truncSentinel \} =\s*useRenderMore\(\(\) => sortedRows\.value, \(\) => rootEl\.value\);/);
    expect(v).toMatch(/const renderRows = computed<any\[\]\[\]>\(\(\) => \{/);
    expect(v).toMatch(/if \(shown\.length === cols\.length && shown\.every\(\(c, i\) => c === cols\[i\]\)\) return renderRowsRaw\.value;/);
    expect(v).toMatch(/return renderRowsRaw\.value\.map\(r => idxs\.map\(ix => \(ix >= 0 \? r\[ix\] : undefined\)\)\);/);
    /* IO 全家（逐字同构段，随抽取迁 composable） */
    expect(rm).toMatch(/const truncSentinel = ref<HTMLElement \| null>\(null\);/);
    expect(rm).toMatch(/new IntersectionObserver\(\(entries\) => \{[\s\S]*?if \(en\.isIntersecting\) \{ renderMore\(\); break; \}/);
    expect(rm).toMatch(/\{ root: root\(\), rootMargin: '80px' \}/);
    expect(rm).toMatch(/autoMoreObserver\?\.disconnect\(\);/);
    expect(rm).toMatch(/onCleanup\(\(\) => autoMoreObserver\?\.disconnect\(\)\);/);
  });

  it('按钮兜底保留（显式触发路径不删）', () => {
    expect(v).toMatch(/@click="renderMore">继续渲染下 \{\{ MAX_RENDER \}\} 行/);
    expect(rm).toMatch(/function renderMore\(\) \{ renderLimit\.value \+= MAX_RENDER; \}/);
  });
});
