/**
 * 五百六十一批：lint 体检提示条单源合并（工蚁5 · lint-bar 改用批）源码锚。
 *  theme.css :560 约定（.lint-bar/.lint-bar-warn/.lint-bar-err 单源）后，四视图私有形态退役：
 *  DevToolsView .dt-lint 形态壳 / SearchSandboxView .ss-lint 族 / AliasesView .alv-lint 族 /
 *  MatchMatrixView .mm-lint 族 → 模板纯类名改用（DOM 保形）。
 *  附 SearchSandboxView 两件：.ss-err 私造红壳合并 .err-bar（558 批 mm/bt/pf 先例）、
 *  hits 结果面查找 input（inline max-width 违规）改用 SearchFilterBar 统一件。
 *  高度链红线自证：DevToolsView .dt-lint 只留 531 flex-shrink + 532 P1-2 max-height 两钉。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const dt = read('../views/DevToolsView.vue');
const ss = read('../views/SearchSandboxView.vue');
const alv = read('../views/AliasesView.vue');
const mm = read('../views/MatchMatrixView.vue');
const theme = read('../theme.css');

describe('561 lint-bar 单源改用（四视图）', () => {
  it('theme.css 单源三件套在位（约定基线）', () => {
    expect(theme).toContain('.lint-bar { display: flex; flex-direction: column;');
    expect(theme).toContain('.lint-bar-warn { background: var(--warn-soft); color: var(--warn); }');
    expect(theme).toContain('.lint-bar-err { background: var(--err-soft); color: var(--err); }');
  });

  it('DevToolsView：lint-bar 双档改用在位；dt-lint 形态壳退役、高度链两钉保留', () => {
    expect(dt).toContain('class="lint-bar dt-lint lint-bar-err"');
    expect(dt).toContain('class="lint-bar dt-lint lint-bar-warn"');
    expect(dt, '形态壳（display/gap/padding/radius/字号/行高）退役').not.toContain('.dt-lint { display: flex');
    expect(dt, 'warn/err 底色档退役').not.toMatch(/^\.dt-lint-warn|^\.dt-lint-err/m);
    expect(dt, '531 定高链钉：恒高兄弟不收缩').toContain('.dt-lint { flex-shrink: 0; }');
    expect(dt, '532 P1-2 max-height 钳制钉（devtoolsLint532 锁面）').toContain('max-height: 88px; overflow: auto;');
  });

  it('SearchSandboxView：lint-bar 三处改用在位；ss-lint 族规则退役', () => {
    expect(ss).toContain('class="lint-bar lint-bar-err"');
    expect(ss).toContain('class="lint-bar lint-bar-warn"');
    expect(ss, 'row 版私有形态与 svg 内衬退役').not.toMatch(/^\.ss-lint/m);
    expect(ss, 'warn/err 底色档退役').not.toMatch(/^\.ss-lint-warn|^\.ss-lint-err/m);
  });

  it('AliasesView / MatchMatrixView：lint-bar 改用在位；alv-lint/mm-lint 族规则退役', () => {
    expect(alv).toContain('class="lint-bar lint-bar-err"');
    expect(alv).toContain('class="lint-bar lint-bar-warn"');
    expect(alv).not.toMatch(/^\.alv-lint/m);
    expect(mm).toContain('class="lint-bar lint-bar-err"');
    expect(mm).toContain('class="lint-bar lint-bar-warn"');
    expect(mm).not.toMatch(/^\.mm-lint/m);
  });
});

describe('561 SearchSandbox 附带两件：ss-err → err-bar + hits 查找条 SearchFilterBar', () => {
  it('失败面板合并全局 err-bar（role=alert 补齐）；内层 body/h/pre 布局件保留', () => {
    expect(ss).toContain('role="alert" class="err-bar ss-err"');
    expect(ss, '私造红壳（padding+err 色+err-soft 底）退役').not.toMatch(/^\.ss-err \{[^\n]*err-soft/m);
    expect(ss, '本类只留 icon+body 顶对齐（mm-err 同口径）').toMatch(/^\.ss-err \{ align-items: flex-start; \}/m);
    expect(ss, '内层布局件保留（layoutOcclusionGuard501 锁 ss-err-pre 同步更新面）').toContain('.ss-err-body { flex: 1; min-width: 0; }');
    expect(ss).toContain('.ss-err-pre { font-size: var(--fs-xs);');
  });

  it('hits 结果面查找改用 SearchFilterBar：inline max-width 违规退役，placeholder 兼 aria-label', () => {
    expect(ss).toContain("import SearchFilterBar from '../components/SearchFilterBar.vue';");
    expect(ss).toContain('<SearchFilterBar v-model="hitsKw" class="ss-hits-find-bar"');
    expect(ss, 'inline max-width:220px 违规退役（注释提及不算回潮，锚 style 属性形态）').not.toContain('style="max-width:220px"');
    expect(ss, 'placeholder 逐字保留（组件内兼 aria-label）').toContain('placeholder="在结果内查找（_id/_index）…"');
    expect(ss, '558b 三件套过滤链零触（hintWave558b 锁面）').toContain("const hitsKw = ref('');");
  });
});
