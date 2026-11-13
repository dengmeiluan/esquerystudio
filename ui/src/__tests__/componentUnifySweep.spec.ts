/**
 * 组件统一合并扫描（静态迁移面断言）：本次迁移的各视图不得残留被合并的本地实现。
 * 锁定：
 * ① 四视图（LiveDashboard/Overview/Aliases/Plugins）+ 源头视图 IndexHub 本地 meta CSS 定义退役、模板接 MetaStrip；
 * ② LiveDashboard 自建 .ld-page.fs 全屏壳退役，接 FocusableSurface headless；
 * ③ BrowserView 手搓翻页（上一页/下一页按钮）退役，接 Pagination；深链文档裸 stringify 文本退役，走 highlightJson；
 * ④ Templates/ProfileFlame/DiffEditor/ReindexPreview 裸编辑器（Monaco/textarea）合并 JsonArea；
 * ⑤ ReindexPreview 接 WorkbenchLayout + sessionStorage carry 去高级 Reindex；
 * ⑥ ClusterSwitcher 确认统一 askConfirm，useDialog 引用清零；
 * ⑦ Plugins/MappingDesigner 弹窗 z-index token 化，无 1000 字面量。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const live = read('../views/LiveDashboardView.vue');
const overview = read('../views/OverviewView.vue');
const aliases = read('../views/AliasesView.vue');
const plugins = read('../views/PluginsView.vue');
const mapping = read('../views/MappingDesignerView.vue');
const browser = read('../views/BrowserView.vue');
const templates = read('../views/TemplatesView.vue');
const profileFlame = read('../views/ProfileFlameView.vue');
const diffEditor = read('../views/DiffEditorView.vue');
const reindexPreview = read('../views/ReindexPreviewView.vue');
const clusterSwitcher = read('../components/ClusterSwitcher.vue');
const indexHub = read('../views/IndexHubView.vue');

describe('组件统一合并扫描（迁移面静态断言）', () => {
  it('四视图本地 meta 定义退役，模板接 MetaStrip 统一件', () => {
    expect(live).not.toMatch(/\.ld-meta[\s{.,:]/);
    expect(overview).not.toMatch(/\.ov-meta[\s{.:]/);
    expect(aliases).not.toMatch(/\.alv-hd-meta[\s{.:]/);
    expect(plugins).not.toMatch(/\.pl-meta[\s{.:-]/);
    expect(live).toContain('<MetaStrip');
    expect(overview).toContain('<MetaStrip');
    expect(aliases).toContain('<MetaStrip');
    expect(plugins).toContain('<MetaStrip');
  });

  it('IndexHubView 本地 meta 定义退役（源头视图吃 MetaStrip 统一件）', () => {
    /* .ih-meta-pos/.ih-meta-sep/.ih-meta-alias 是插槽落位类，前缀不触雷；本地五条形态定义必须清零 */
    expect(indexHub).not.toMatch(/\.ih-meta[\s{.,:]/);
    expect(indexHub).not.toContain('.ih-meta-u');
    expect(indexHub).toContain('<MetaStrip class="ih-meta-pos"');
    /* 五百三十批同步更新：管控跳转带 ?idx= 深链（别名页消费后置顶+强调该索引所在分组）；
       852 批同步更新：深链值 encodeURIComponent（localeEncodeGuard852 E 组同域） */
    expect(indexHub).toContain("goto('/aliases?idx=' + encodeURIComponent(cur))");
  });

  it('LiveDashboard 全屏壳统一 FocusableSurface headless（自建 .ld-page.fs 退役）', () => {
    expect(live).toMatch(/<FocusableSurface[^>]*headless/);
    expect(live).not.toContain('.ld-page.fs');
    expect(live).not.toMatch(/position:\s*fixed;\s*inset:\s*0/);
  });

  it('BrowserView 翻页合并（手写上一页/下一页按钮退役；529 反转：翻页随 QRT 换壳由内核 renderMore 增量渲染接管）', () => {
    expect(browser).not.toContain('上一页');
    expect(browser).not.toContain('下一页');
    /* 五百二十九批锚同步更新：<Pagination> 视图层退役 → QRT rows 型接线（大索引列表由内核
       MAX_RENDER 增量渲染+「继续渲染」行接管，排序/漏斗作用于全量所见集） */
    expect(browser).toContain('<QueryResultTable');
    expect(browser).toContain('storage-key="browser:indices"');
    expect(browser).not.toContain('bw-page-n');
  });

  it('BrowserView 深链文档走 highlightJson 范式（模板裸 stringify 退役）', () => {
    expect(browser).toContain("import { highlightJson } from '../utils/jsonc';");
    expect(browser).toMatch(/v-html="linkedDocHtml"/);
    expect(browser).not.toMatch(/>\{\{\s*JSON\.stringify\(linkedDoc/);
  });

  it('四处裸编辑器合并 JsonArea（Templates/ProfileFlame/DiffEditor/ReindexPreview）', () => {
    expect(templates).toContain('<JsonArea');
    expect(templates).not.toContain('<MonacoEditor');
    /* 551 同步更新：lint 划线接线补 ref="pfJaRef"（RankDebug rdJaRef 同款，vue 属性序 ref 在 v-model 前）——JsonArea 合并断言意图不变 */
    expect(profileFlame).toContain('<JsonArea ref="pfJaRef" v-model="dsl"');
    expect(profileFlame).not.toMatch(/<textarea/);
    expect(diffEditor).toContain('<JsonArea v-model="editedText" fill');
    expect(reindexPreview).toContain('<JsonArea v-model="queryBody"');
    expect(reindexPreview).not.toContain('<MonacoEditor');
    /* ReindexPreview 自建 JSON 校验红字退役（JsonArea 合法性圆点承担） */
    expect(reindexPreview).not.toContain('queryJsonErr');
    expect(reindexPreview).not.toContain('rp-json-err');
  });

  it('ReindexPreview 接 WorkbenchLayout，carry 契约去高级 Reindex', () => {
    expect(reindexPreview).toContain('<WorkbenchLayout :scope="rpScope" :panes="RP_PANES"');
    expect(reindexPreview).toContain('#pane-rp-query');
    expect(reindexPreview).toContain('#pane-rp-result');
    expect(reindexPreview).toContain("'esquerystudio.reindex-advanced.body'");
    expect(reindexPreview).toContain('goAdvanced');
    expect(reindexPreview).not.toContain('.rp-body');
  });

  it('ClusterSwitcher 确认统一 askConfirm（useDialog 引用清零）', () => {
    expect(clusterSwitcher).not.toContain('useDialog');
    expect(clusterSwitcher).not.toContain('dialog.warning');
    expect(clusterSwitcher).toContain("level: 'warn',");
    expect(clusterSwitcher).toContain("okText: '仍然切换',");
  });

  it('弹层 z-index token 化：Plugins/MappingDesigner 无 1000 字面量', () => {
    expect(plugins).not.toMatch(/z-index:\s*1000/);
    expect(mapping).not.toMatch(/z-index:\s*1000/);
    expect(plugins).toContain('z-index: var(--z-modal-view)');
    expect(mapping).toContain('z-index: var(--z-modal-view)');
  });

  it('AliasesView filter 全文走 n-popover + highlightJson（原生 title 塞 JSON 退役）', () => {
    expect(aliases).toContain('<n-popover');
    expect(aliases).toContain('highlightJson');
    expect(aliases).not.toMatch(/:title="'filter: '\s*\+\s*JSON\.stringify/);
  });
});
