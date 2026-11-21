/**
 * 索引设置页统一件合并（源码锁）：
 * ① 索引选择 n-select（裸 label/value，无健康度/别名补全）→ IndexPicker 统一件
 *    （R42-e「全站禁止裸 index input」口径），picked 即拉 settings；
 * ② 完整 settings 预 max-height 460px 定高 → calc(100vh - var(--vh-offset)) 视口弹性
 *    （theme.css :root 已定义 --vh-offset=210px，按 BrowserView/MappingView 先例不写本地
 *    fallback 防两处漂移；大屏不再「定高滚动+下方大片空白」，矮屏不撑破视口）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/IndexSettingsView.vue'), 'utf-8');

describe('IndexSettingsView：IndexPicker 合并 + raw 弹性高度', () => {
  it('索引选择改用 CurrentIdxChip 只读件（五百三十二批：页内 IndexPicker 退役，选索引收敛顶栏）', () => {
    expect(src).toContain('<CurrentIdxChip />');
    expect(src, '页内 IndexPicker 退役').not.toMatch(/<IndexPicker/);
  });

  it('n-select 裸下拉与本地 options 退役（indexOpts 不回潮）', () => {
    /* 1445 锚更新：本锁原为「全文件禁 <n-select/NSelect」——那是索引选择裸下拉退役时的口径。
       1445 批 blocks.* 三个布尔设置项由原生 select 换 NSelect（散页廉价控件清理），锁面
       精确化：n-select 仅限 blocks.* 设置下拉；索引选择唯一入口仍是顶栏 CurrentIdxChip，
       页内裸索引下拉与本地 indexOpts 均不回潮（负向锁收窄为 indexOpts + 三处限定） */
    const nsel = src.match(/<n-select[^>]*/g) ?? [];
    expect(nsel.length, 'n-select 仅限 blocks.* 三处设置下拉').toBe(3);
    for (const tag of nsel) {
      expect(tag, '每处 n-select 必须绑 blocks.* 设置字段').toContain("v-model:value=\"form['blocks.");
    }
    expect(src, 'indexOpts 随索引下拉退役').not.toMatch(/indexOpts/);
  });

  it('完整 settings 预视口弹性 max-height（--vh-offset 口径，460px 定高退役）', () => {
    expect(src).toMatch(/\.is-raw pre \{ max-height: calc\(100vh - var\(--vh-offset\)\); overflow: auto;/);
    expect(src, '定高兜底值不残留').not.toMatch(/\.is-raw pre[^}]*460px/);
  });

  it('「用当前索引」回填钮随 chip 即当前索引退役（五百三十二批；follow+guard 接管，selectorUnify532 看守）', () => {
    expect(src, '回填钮退役（chip 即当前索引，无第二份 target 可回填）').not.toMatch(/data-test="use-current-idx"/);
    expect(src, '就地覆盖函数随钮退役').not.toMatch(/function useCurrentIdx\(\)/);
  });
});
