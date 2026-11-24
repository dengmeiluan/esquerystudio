/* 五百九十批轨5【--sp 精确等值轮转合并+负值出血豁免约定】看守。
 *
 * 全站审计（views+components 的 gap/margin/padding 声明对照 theme.css:102-103 档表）：
 *  · 唯一可收等值残量 = DevToolsView .dt-tb-sep margin: 0 2px → var(--sp-0)；
 *  · 负值出血三先例（.ar-dest-err margin:-4px / .ih-list margin:0 -4px /
 *    .tv-tree margin:-6px）按 527 批豁免约定保字面——负 margin 是与同值正 padding
 *    配对的列表出血微调，非间距阶梯语义，强收 calc(-1*var(--sp-N)) 破坏配对可读性；
 *  · ExplainTree 缩进 calc(6px + var(--xt-depth) * 14px) 属计算系，6px 非独立间距值；
 *  · font-size 裸 px 全站（views+components，黑名单两文件豁免）零残量，立扫描锁防回潮。
 * 六百五十一批增补：LiveChartCard .ld-expand padding: 2px → var(--sp-0)（theme.css:103
 *  同值档精确等值，渲染零变化）；自此 --sp 可收残量清零，余 2 处负值出血豁免域（.ih-list/.hk-x）。
 * 审计误命中教训：注释行内的「gap:6px」字样会被声明正则扫中——守卫一律按声明级
 * 切分（spSweep538 SPACING_DECL 形态），注释不构成残量。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('五百九十批：--sp 残量轮转合并与豁免约定', () => {
  it('DevToolsView .dt-tb-sep margin 0 2px → var(--sp-0)（theme.css:103 同值档）', () => {
    const css = src('views/DevToolsView.vue');
    expect(css).toMatch(/\.dt-tb-sep\s*\{[^}]*margin:\s*0\s+var\(--sp-0\)/);
    expect(css, '裸 2px margin 不得回潮').not.toMatch(/\.dt-tb-sep\s*\{[^}]*margin:\s*0\s+2px/);
  });

  it('LiveChartCard .ld-expand padding 2px → var(--sp-0)（651 批合并，--sp 可收残量清零）', () => {
    const css = src('components/LiveChartCard.vue');
    expect(css).toMatch(/\.ld-expand\s*\{[^}]*padding:\s*var\(--sp-0\)/);
    expect(css, '裸 2px padding 不得回潮').not.toMatch(/\.ld-expand\s*\{[^}]*padding:\s*2px/);
  });

  it('负值出血三先例保字面（527 批豁免约定：出血配对非间距阶梯，防顺手过收）', () => {
    expect(src('views/AdhocRebuildView.vue')).toMatch(
      /\.ar-dest-err\s*\{[^}]*margin:\s*-4px\s+0\s+var\(--sp-2\)/,
    );
    expect(src('views/IndexHubView.vue')).toMatch(
      /\.ih-list\s*\{[^}]*margin:\s*0\s+-4px[^}]*padding:\s*0\s+var\(--sp-1\)/,
    );
    expect(src('views/TasksView.vue')).toMatch(
      /\.tv-tree\s*\{[^}]*margin:\s*var\(--sp-1\)\s+-6px\s+-6px/,
    );
  });

  it('ExplainTree 缩进 calc 计算系豁免锁（6px 在 calc 公式内非独立间距值）', () => {
    expect(src('components/ExplainTree.vue')).toContain(
      'padding: 3px var(--sp-1h) 3px calc(6px + var(--xt-depth) * 14px);',
    );
  });

  it('font-size 裸 px 全站零残量扫描（views+components；--fs 档表 10~44px 全档在案）', () => {
    const SKIP = new Set(['LiveDashboardView.vue', 'LifecycleView.vue']); /* 对方域热文件豁免 */
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else if (/\.vue$/.test(f) && !SKIP.has(f)) {
          const lines = readFileSync(p, 'utf-8').split(/\r?\n/);
          lines.forEach((l, i) => {
            if (/font-size\s*:\s*\d+(?:\.\d+)?px/.test(l)) hits.push(`${p}:${i + 1}`);
          });
        }
      }
    };
    walk(join(__dirname, '..', 'views'));
    walk(join(__dirname, '..', 'components'));
    expect(hits, `font-size 裸 px 残量回潮：${hits.join(', ')}`).toEqual([]);
  });
});
