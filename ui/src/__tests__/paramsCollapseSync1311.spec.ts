/**
 * 构建区收起时，检索参数块不得残留展开（持久化残留收敛）。
 *
 * 真机复现（1440×1000，全新会话）：
 *   buildExpanded: false   ← 构建区收起（持久化缺省 true）
 *   dqMainH:       0       ← 条件树/编辑器高度 0
 *   paramsTg:      true    ← 检索参数却展开
 *   paramsBodyH:   135     ← 占 135px 三行 chips
 * 即页面上看不到编辑器，却摆着三排检索参数——纯占位噪音。
 *
 * 根因：`watch(buildCollapsed)` 只在**状态变化**时触发；buildCollapsed 本身是持久化偏好，
 * 刷新后进来就是 true，watch 不触发，于是持久化的 paramsOpen=true 残留下来。
 *
 * 判据：挂载时补一次收敛（源码锚）。负控：只留 watch、去掉挂载同步，必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('构建区收起 → 参数块收敛', () => {
  it('既有 watch 联动仍在（状态变化时能收）', () => {
    expect(src).toMatch(/watch\(buildCollapsed,\s*\(collapsed\)\s*=>\s*\{\s*if\s*\(collapsed\)\s*paramsOpen\.value\s*=\s*false;?\s*\}\)/);
  });

  it('挂载时补一次同步（持久化残留能被收敛）', () => {
    /* 没有这一条，刷新后「构建区收起 + 参数块展开」的矛盾态就会常驻。 */
    expect(src, '必须在挂载时收敛一次').toMatch(/if\s*\(buildCollapsed\.value\s*&&\s*paramsOpen\.value\)\s*paramsOpen\.value\s*=\s*false;/);
  });

  it('收敛只单向：展开构建区不自动展开参数（还原动作交还用户）', () => {
    /* 防止有人把同步写成双向：`if (collapsed) A else B` 那种会替用户做决定。 */
    const block = src.slice(src.indexOf('if (buildCollapsed.value && paramsOpen.value)'), src.indexOf('if (buildCollapsed.value && paramsOpen.value)') + 200);
    expect(block, '收敛分支不得出现 else / 反向赋值').not.toMatch(/else/);
  });

  it('负控：判据能识别「只有 watch 没有挂载同步」的写法', () => {
    const stripped = 'watch(buildCollapsed, (c) => { if (c) paramsOpen.value = false; });';
    expect(stripped, '只有 watch 时挂载同步判据必须不通过').not.toMatch(/if\s*\(buildCollapsed\.value\s*&&\s*paramsOpen\.value\)/);
  });
});
