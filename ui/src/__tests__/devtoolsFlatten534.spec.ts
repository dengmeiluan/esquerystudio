/**
 * 五百三十四批·轨2（工蚁 W2）：DevToolsView dt-hist 四刀降层 + 预设钮文案语义化 · 契约备案。
 *
 * ① dt-hist 四刀降层（纯视觉层）：border 壳退役→border-top 分节分隔；panel-2 头退役→
 *    sec-t 档行首横排；chip 行嵌套盒（panel-2 底+border-bottom）退役→行内裸排；列表内衬退役。
 * ② ⚠高度结构语义零变动同步更新声明（indexHubDevtools531/devtoolsLint532 锚）：
 *    .dt-hist flex-shrink:0 / .qhp-list max(240px,42vh) / .dt-body 定高链 / dt-hist 直挂 dt-body
 *    落位 / histCollapse444 折叠控件形态 / devtoolsLint532 22 例关键字面（mirrorHistAll 双行、
 *    lint 档路由 import 面）逐条在场——dt-hist 是 2.9.115/119 两次事故面，高度字面全部冻结。
 * ③ P1：WorkbenchLayout 预设钮文案语义化（DslQueryView L66-67 先例同款）——
 *    「请求优先/响应优先」替代通用「编辑/结果优先」（本页双 pane 即请求/响应）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('五百三十四批：dt-hist 四刀降层（源码锁）', () => {
  it('① border 壳退役→border-top 分节分隔（radius/通栏 border 不回流）', () => {
    expect(dt).toMatch(/\.dt-hist \{ border-top: 1px solid var\(--line\); margin-top: var\(--sp-2\); padding-top: var\(--sp-1h\); flex-shrink: 0; \}/);
    expect(dt, '旧 border 壳不回流').not.toMatch(/\.dt-hist \{ border: 1px solid/);
    expect(dt, '旧圆角壳不回流').not.toMatch(/\.dt-hist \{[^}]*border-radius/);
  });

  it('② panel-2 头退役→sec-t 档行首横排（控件形态 role=button 保留）', () => {
    expect(dt).toMatch(/\.dt-hist-tt \{ padding: var\(--sp-0\) 0; font-size: var\(--fs-sm\); font-weight: 600; color: var\(--tx1\);/);
    expect(dt, 'panel-2 头底色不回流').not.toMatch(/\.dt-hist-tt \{[^}]*background/);
    expect(dt, '头行 border-bottom 不回流').not.toMatch(/\.dt-hist-tt \{[^}]*border-bottom/);
    /* histCollapse444 同源锚：折叠控件语义形态同步更新零改 */
    expect(dt).toMatch(/<div class="dt-hist-tt" role="button" tabindex="0" :aria-expanded="histOpen"/);
  });

  it('③ chip 行嵌套盒退役→行内裸排（chip 本体语义保留）', () => {
    expect(dt).toMatch(/\.dt-hist-scope \{ display: flex; gap: var\(--sp-1h\); align-items: center; padding: var\(--sp-1h\) 0 0; \}/);
    expect(dt, 'chip 行 panel-2 底不回流').not.toMatch(/\.dt-hist-scope \{[^}]*background/);
    expect(dt, 'chip 行 border-bottom 不回流').not.toMatch(/\.dt-hist-scope \{[^}]*border-bottom/);
    expect(dt, 'chip 行内衬退役').toContain('.dt-hist-list { padding: var(--sp-1h) 0 0; }');
    expect(dt, 'chip 本体（本 Tab/全部切换）语义保留').toContain(`:class="{ on: histScope === 'tab' }"`);
    expect(dt, '跨 Tab 汇聚「全部」chip 保留').toContain(`:class="{ on: histScope === 'all' }"`);
  });
});

describe('五百三十四批：高度结构语义零变动同步更新声明（2.9.115/119 事故面冻结）', () => {
  it('⚠恒高兄弟红线：.dt-hist flex-shrink:0 + .qhp-list max(240px, 42vh) 字面冻结', () => {
    expect(dt).toMatch(/\.dt-hist \{[^}]*flex-shrink: 0; \}/);
    expect(dt).toContain('.dt-hist-list :deep(.qhp-list) { max-height: max(240px, 42vh); }');
    expect(dt, 'clamp 旧档不回流（531 约定）').not.toContain('clamp(200px, 34vh, 420px)');
  });

  it('⚠dt-body 定高链同步更新声明（indexHubDevtools531 P0 根治锚逐字在场）', () => {
    expect(dt).toContain('.dt-body { padding: var(--sp-3) var(--sp-1); display: flex; flex-direction: column; gap: var(--sp-2); height: calc(100vh - var(--vh-offset)); }');
    expect(dt).toContain('.dt-body :deep(.wl) { flex: 1 1 auto; min-height: 0; }');
    expect(dt).toContain('正反馈棘轮');
  });

  it('⚠dt-hist 直挂 dt-body 落位同步更新声明（</WorkbenchLayout> 之后）', () => {
    const wlEndAt = dt.indexOf('</WorkbenchLayout>');
    const histAt = dt.indexOf('class="dt-hist"');
    expect(histAt).toBeGreaterThan(wlEndAt);
    expect(dt.slice(wlEndAt, histAt)).not.toContain('pane-devtools');
  });

  it('⚠devtoolsLint532 用例零破坏声明：关键源码字面逐条在场（lint 档路由 + 汇聚镜像双行）', () => {
    /* 1439 迁移：导入清单允许增长（lintStructuredBody 共享分派），锁「模块 + 关键符号」不锁整行 */
    expect(dt).toMatch(/import \{[\s\S]*?\} from '\.\.\/utils\/dslLint';/);
    for (const sym of ['lintDsl', 'lintSettingsBody', 'lintMappingBody', 'lintStructuredBody', 'lintNdjsonBody']) {
      expect(dt).toMatch(new RegExp(`\\b${sym}\\b`));
    }
    /* 1439：NDJSON 配对 lint 抽到 dslLint（与 REST 同源），DevTools 不再直连 bulkNdjson */
    expect(dt).not.toContain("from '../utils/bulkNdjson'");
    expect(dt).toContain('const dtLint = computed<Finding[]>(() => {');
    expect(dt).toContain('if (kind === \'settings\') return lintSettingsBody(JSON.parse(body));');
    expect(dt).toContain('if (kind === \'mapping\') return lintMappingBody(JSON.parse(body));');
    expect(dt).toContain('if (kind === \'search\') return lintDsl(JSON.parse(body), { fields: dtFields.value });');
    expect(dt).toContain('mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: true, took: t.took });');
    expect(dt).toContain('mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: false, took: t.took });');
    /* 2.9.119 文案重叠根治三件套（wl-body min-height:0 + Monaco 弹性化 + lint flex-shrink:0）不回退 */
    expect(dt).toContain('.dt-page :deep(.wl-body) { min-height: 0; }');
    expect(dt).toMatch(/\.dt-body-monaco \{ height: auto !important; flex: 1 1 auto; min-height: 220px; \}/);
    expect(dt).toMatch(/\.dt-lint \{ flex-shrink: 0; \}/);
  });
});

describe('五百三十四批 P1：WorkbenchLayout 预设钮文案语义化', () => {
  it('「请求优先/响应优先」接线（DslQueryView L66-67 先例同款 props 通道）', () => {
    expect(dt).toMatch(/<WorkbenchLayout :scope="wbScope" :panes="DEVTOOLS_PANES" axis="vertical" mode="search"\s*\n\s*preset-editor-label="请求优先" preset-editor-title="请求区优先（响应收窄）"\s*\n\s*preset-result-label="响应优先" preset-result-title="响应区优先（请求收窄）">/);
  });
});
