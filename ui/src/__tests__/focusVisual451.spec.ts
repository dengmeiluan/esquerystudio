/**
 * 四百五十一批：聚焦面视觉减扰+聚焦工具行样式收口——
 * ① 非聚焦态聚焦钮浮于内容上方半透明（hover/键盘聚焦全显），减轻对 Monaco/工具行的遮挡感；
 * ② Lucene/PIT/DslQuery 三处聚焦工具行内联 style 抽 theme.css .focus-tools（429 收口精神）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const fs = readFileSync(join(SRC, 'components/FocusableSurface.vue'), 'utf-8');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');

describe('聚焦面视觉减扰（451 批）', () => {
  /* 五百零五批：451 半透明退役（用户裁决「压线遮挡」）——非聚焦钮不透明+内移坐实面板内 */
  /* 五百零八批:终态=工具行一体化(507 hover-reveal 退役)——聚焦钮为头部行行首元素,
     业务工具按钮经 actions slot 与之同排,「浮在面板线上的孤钮」结构性消除 */
  it('头部行为文档流工具行(可换行+底色+底线),聚焦钮常显为行首元素', () => {
    expect(fs).not.toContain('opacity: .55');
    expect(fs).not.toContain('opacity: 0');
    /* 五百四十五批:fs-head 残量收口(row-gap: 4px→var(--sp-1)、padding: 4px 8px→
       var(--sp-1) var(--sp-2),纯值等值替换,spSweep545 反锁),结构断言意图不变 */
    expect(fs).toMatch(/\.fs-head \{ display: flex; align-items: center; flex-wrap: wrap; row-gap: var\(--sp-1\); gap: var\(--sp-1\); position: relative; padding: var\(--sp-1\) var\(--sp-2\); z-index: 3; background: var\(--bg1\); border-bottom: 1px solid var\(--line\); \}/);
    expect(fs).toContain('<slot name="actions" />');
  });

  it('.focus-tools 全局类+视图消费（v3.0.1:DslQuery 改 headless 移除）', () => {
    expect(theme).toContain('.focus-tools { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-bottom: 8px; }');
    const anchors: [string, string][] = [
      ['LuceneQueryView.vue', 'lc-hd-r focus-tools'],
      ['PitScrollView.vue', 'class="focus-tools"'],
    ];
    for (const [f, cls] of anchors) {
      const v = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(v, f).toContain(cls);
      expect(v, f).not.toContain('style="display:flex;gap:8px;margin-bottom:8px"');
    }
  });
});
