/**
 * 五百四十七批·轨4（工蚁）：任务 2 表格包裹壳退役 · 契约备案。
 *
 * 538 SystemView .sy-res / 546 BrowserView .bw-res 同语言续扫：
 * XmigrateView 作业列表 `<div class="card" style="padding:0;overflow:hidden">` 壳 +
 * card-t 内联 padding → border-top 分节（.xm-res/.xm-res-t 承接；QRT 本就全出血）；
 * ⚠ .xm-group 531 旧 border 盒死规则（被 534 覆盖行压死的死规则）一并退役——
 *   rebuildMigrate531:268 / rebuildFlat534:94 两处字面锁同步更新（死规则退役，断言改 not.toMatch）；
 * 顺带 .xm-jobs-kw width:240px → min(240px,100%) 极窄溢出钳制（529 responsive 带兜底范式，
 *   AnalysisSettingsView:366 min(320px,100%) 同款）。
 *
 * 范围铁律：分节 border-top 不改盒模型尺寸（padding:0/overflow:hidden 内联随壳退役，
 * QRT 高度链零触）；adhocJobsTable524 的 .xm-jobs-kw DOM 锚类名保留。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const xm = read('../views/XmigrateView.vue');

describe('五百四十七批：XmigrateView 作业列表 .card 壳退役 → border-top 分节（sy-res/bw-res 同语言）', () => {
  it('包裹壳与 card-t 内联 padding 双退役；.xm-res/.xm-res-t 分节形逐字在场', () => {
    expect(xm, 'card 壳（padding:0;overflow:hidden 内联）退役')
      .not.toMatch(/<div class="card" style="padding:0;overflow:hidden">/);
    expect(xm, 'card-t 内联 padding 随壳退役').not.toMatch(/class="card-t" style="padding:var\(--sp-3\) var\(--sp-4\) 0"/);
    expect(xm, '.xm-res 分节形逐字在场（546 bw-res 同款）').toMatch(/\.xm-res \{ border-top: 1px solid var\(--border\); \}/);
    expect(xm, '.xm-res-t 落位类承接原内联 padding').toMatch(/\.xm-res-t \{ padding: var\(--sp-3\) var\(--sp-4\) 0; \}/);
    expect(xm, '分节容器在场').toContain('<div class="xm-res">');
    expect(xm, '分节头挂落位类').toContain('<div class="card-t xm-res-t">');
  });

  it('QRT 与工具行仍在分节内（结构序零变动）', () => {
    const secAt = xm.indexOf('<div class="xm-res">');
    expect(secAt).toBeGreaterThan(-1);
    const qrtAt = xm.indexOf('<QueryResultTable v-else-if="jobs.length"');
    expect(qrtAt, 'QRT 在分节内').toBeGreaterThan(secAt);
    expect(xm.indexOf('class="xm-jobs-tools"'), '工具行在分节内').toBeGreaterThan(secAt);
  });

  it('.xm-group 531 旧 border 盒死规则退役（534 覆盖行承接，锁同步更新记录在 rebuildMigrate531/rebuildFlat534）', () => {
    /* 死规则（被下一行覆盖行压死）退役：531 字面形不再在场 */
    expect(xm, '531 旧 border 盒死规则退役').not.toMatch(/\.xm-group \{ margin-bottom: var\(--sp-3\); padding: var\(--sp-2\) var\(--sp-3\); border: 1px solid var\(--line\); border-radius: var\(--r-m\); \}/);
    /* 534 覆盖行（现行生效形态）逐字零触 */
    expect(xm, '534 覆盖行现行形态零触').toContain('.xm-group { margin-bottom: 0; padding: var(--sp-2) 0 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; }');
    expect(xm, '去 background 约定不回潮（531 ②）').not.toMatch(/\.xm-group \{[^}]*background/);
  });

  it('.xm-jobs-kw 极窄溢出钳制：min(240px,100%)（529 带兜底范式），DOM 锚类保留', () => {
    expect(xm, '裸 240px 不回流').not.toMatch(/\.xm-jobs-kw \{ width: 240px; \}/);
    expect(xm, 'min() 钳制在场（AnalysisSettingsView:366 同款）').toMatch(/\.xm-jobs-kw \{ width: min\(240px, 100%\); \}/);
    expect(xm, 'DOM 锚类保留（adhocJobsTable524 消费）').toMatch(/class="inp xm-jobs-kw"/);
  });
});
