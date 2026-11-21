/**
 * 五百六十批·轨4（工蚁F）：编辑器外框剥壳三文件四面 + --sp 精确等值合并 4 文件 7 行。
 * 静态源码断言仿 flattenWave558b/557 范式（strip 注释后断言 + 组件本体零触防回流）。
 *
 * ① 编辑器外框剥壳 4 面（BulkEditor 主 NDJSON / SqlConsole SQL 主 / ConfigValidator
 *    settings+mapping 双编辑器）：MonacoEditor .monaco-host 组件自带 1px line 框+radius
 *    （组件黑名单零触），经视图侧同选择器独立规则追加退役（CSS 声明合并语义等价，
 *    558(b) av-left/br-pane 先例同语言）。分界承接：be-card-hd / sq-card-hd / cv-card-hd
 *    既有 border-bottom。被逐字锁钉死的 flex/260px 原行零触——剥壳后高度链零变动，
 *    锚同步更新移意图复核（selectorUnify532/flattenWave538/544/sqlLint534 在册）。
 * ② --sp 合并：theme.css 档表 --sp-0:2px，四处裸 2px padding 精确等值换算
 *    var(--sp-0)（GenericParams gp-k/gp-v、AggTreeNode agn-name/agn-op/agn-scalar、
 *    RawIoModal rim-method、WorkbenchLayout wl-bar）。AggTreeNode .agn-children
 *    border-left 2px solid 是结构分界非间距，保字面零触；GenericParams calc 深度因子
 *    等几何刻意值零触。layoutOcclusionGuard501 断言域（isFill/wl-fill-pane）不触及
 *    wl-bar 行——合并不新增红。
 *
 * 范围铁律：剥壳只动 scoped style（追加 border:none;border-radius:0），模板结构
 * 零变动；--sp 只做等值替换；高度/flex/padding 几何语义零变动；禁改件零触。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（558b lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ═══════════ ① 编辑器外框剥壳 4 面 ═══════════ */

describe('五百六十批①：编辑器外框剥壳 4 面（视图侧独立规则追加，组件本体零触）', () => {
  it('BulkEditorView：be-card-editor 面剥壳规则在场（flex 260px 锚行 selectorUnify532:84 逐字锁零触）', () => {
    const s = srcOf('views/BulkEditorView.vue');
    expect(s).toContain('.be-card-editor > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }');
    expect(s).toContain('.be-card-editor > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('SqlConsoleView：sq-editor 面剥壳规则在场（flex 行 flattenWave544/sqlLint534 逐字锁零触）', () => {
    const s = srcOf('views/SqlConsoleView.vue');
    expect(s).toContain('.sq-editor > :deep(.monaco-host) { flex: 1 1 0; min-height: 0; }');
    expect(s).toContain('.sq-editor > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('ConfigValidatorView：cv-card 面剥壳规则在场（260px 锚 selectorUnify532/flattenWave538 双源零触）', () => {
    const s = srcOf('views/ConfigValidatorView.vue');
    expect(s).toContain('.cv-card > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }');
    expect(s).toContain('.cv-card > :deep(.monaco-host) { border: none; border-radius: 0; }');
  });
  it('剥壳规则仅含 chrome 声明（border+radius），无 height/flex/padding 尺寸混入（高度链零变动）', () => {
    for (const f of ['views/BulkEditorView.vue', 'views/SqlConsoleView.vue', 'views/ConfigValidatorView.vue']) {
      const hits = strip(srcOf(f)).match(/:deep\(\.monaco-host\) \{[^}]*border: none;[^}]*\}/g) ?? [];
      expect(hits.length, `${f} 剥壳规则在场`).toBeGreaterThan(0);
      for (const h of hits) {
        expect(h, `${f} 剥壳声明纯 chrome`).toMatch(/^\S[^{}]*\{ border: none; border-radius: 0; \}$/);
      }
    }
  });
  it('MonacoEditor 组件本体零触（根元素与自带带框规则原样，防回流锚；黑名单件只读核对）', () => {
    const s = readFileSync(join(__dirname, '..', 'components', 'MonacoEditor.vue'), 'utf-8');
    expect(s).toContain('<div ref="hostRef" class="monaco-host" :style="{ height }"></div>');
    expect(s).toContain('.monaco-host { width: 100%; border: 1px solid var(--line); border-radius: var(--r-m); overflow: hidden; }');
  });
});

/* ═══════════ ② --sp 精确等值合并 7 行 ═══════════ */

describe('五百六十批②：--sp-0 精确等值合并 7 行（theme.css 档表 --sp-0:2px 等值锚）', () => {
  it('theme.css 档表等值锚：--sp-0 === 2px（换算精确性单一出处）', () => {
    expect(srcOf('theme.css')).toContain('--sp-0: 2px;');
  });
  it('GenericParams：gp-k/gp-v 裸 2px 合并（calc 深度因子等几何刻意值零触）', () => {
    const s = srcOf('components/builder/GenericParams.vue');
    expect(s).toMatch(/\.gp-k \{ width: 110px; height: 28px; font-size: var\(--fs-sm\); padding: var\(--sp-0\) var\(--sp-2\); \}/);
    expect(s).toMatch(/\.gp-v \{ height: 28px; font-size: var\(--fs-sm\); padding: var\(--sp-0\) var\(--sp-2\); flex: 1 1 100px; min-width: 0; \}/);
    expect(strip(s), 'gp 规则域裸 2px 清零').not.toMatch(/\.(gp-k|gp-v) \{[^}]*padding: 2px/);
  });
  it('AggTreeNode：agn-name/agn-op/agn-scalar 裸 2px 合并；agn-children 结构 border-left 2px 保字面', () => {
    const s = srcOf('components/builder/AggTreeNode.vue');
    expect(s).toMatch(/\.agn-name \{ width: 110px; height: 28px; font-size: var\(--fs-sm\); padding: var\(--sp-0\) var\(--sp-2\); \}/);
    /* 聚合类型改二段式选择器（AggOpPicker）后 .agn-op 退役；尺寸锚移到包装类，
       内层输入框的 2px 归零约束在全站选择器组件里同源（.agp-inp 无 padding 字面） */
    expect(s).toMatch(/\.agn-op-pick \{ width: 130px; \}/);
    expect(s).toMatch(/\.agn-scalar \{ width: 180px; height: 28px; font-size: var\(--fs-sm\); padding: var\(--sp-0\) var\(--sp-2\); \}/);
    expect(s).toContain('.agn-children { margin-top: var(--sp-2); padding-left: var(--sp-2); border-left: 2px solid var(--line); }');
    expect(strip(s), 'agn 缩进域裸 2px padding 清零').not.toMatch(/\.(agn-name|agn-op|agn-scalar) \{[^}]*padding: 2px/);
  });
  it('RawIoModal：rim-method 裸 2px 合并（rim-method 胶囊间距归档位）', () => {
    const s = srcOf('components/RawIoModal.vue');
    expect(s).toMatch(/\.rim-method \{ flex-shrink: 0; font-size: var\(--fs-2xs\); font-weight: 650; letter-spacing: \.04em; padding: var\(--sp-0\) var\(--sp-1h\); border-radius: var\(--r-s\); background: var\(--ac-soft\); color: var\(--ac-hi\); \}/);
    expect(strip(s), 'rim-method 裸 2px 清零').not.toMatch(/\.rim-method \{[^}]*padding: 2px/);
  });
  it('WorkbenchLayout：wl-bar 裸 2px 合并（layoutOcclusionGuard501 断言域 isFill/wl-fill-pane 不涉及本行）', () => {
    const s = srcOf('components/WorkbenchLayout.vue');
    expect(s).toMatch(/\.wl-bar \{ display: flex; gap: var\(--sp-1\); align-items: center; justify-content: flex-end; padding: var\(--sp-0\) 0 var\(--sp-2\); \}/);
    expect(strip(s), 'wl-bar 裸 2px 清零').not.toMatch(/\.wl-bar \{[^}]*padding: 2px/);
  });
});
