/**
 * W-C 批收口看守：裸 JSON 直插模板渲染清零 + 全局类落位。
 *
 * 背景：全站已有 highlightJson 范式（utils/jsonc.ts 的 highlightJson(prettyJson(x)) 输出
 * 已转义 HTML + <pre class="json-view" v-html>，DslQueryView/SystemView 为参考实现），
 * 但 13 个视图仍散落 `{{ JSON.stringify(x, null, 2) }}` 裸插值——无着色、且长文本裸 pre。
 * 统一收口到范式。本 spec 静态断言（渲染后取色在 happy-dom 下是死断言，见 themeTokenGuard 同理）：
 *   1) 上述视图 <template> 段不再出现 JSON.stringify( 直插（script 内逻辑用途豁免：
 *      序列化存草稿/_prefill/复制等是正当逻辑，不是渲染）；
 *   2) theme.css 全局类落位：.toolrow / .m-put（方法语义色轮）在场；.meta-strip 全局块
 *      已随五百三十五批整块退役（形态单一出处归 MetaStrip 组件 .ms），该锚反转为负向锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

/** 收口的视图（含范式出生地 DevToolsView 与组件 IntegrationGuide） */
const SWEPT = [
  'views/DevToolsView.vue',
  'views/TaskTreeView.vue',
  'views/SnapshotsView.vue',
  'views/HealthReportView.vue',
  'views/IlmView.vue',
  'views/SecurityView.vue',
  'views/SearchSandboxView.vue',
  'views/UpdateByQueryView.vue',
  'views/XmigrateView.vue',
  'views/AnalysisSettingsView.vue',
  'views/IndexSettingsView.vue',
  'views/BoostTunerView.vue',
  'views/RemoteClustersView.vue',
  'views/DiagView.vue',
  'components/IntegrationGuide.vue',
];

/** 剔除 script/style 块，剩下的即 template（含模板注释，注释里也不该出现渲染用 stringify） */
function templateOf(src: string): string {
  return src.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '');
}

describe('codeTextHighlightSweep：裸 JSON.stringify 模板渲染清零（W-C 批）', () => {
  for (const f of SWEPT) {
    it(`${f} 的 <template> 不再直插 JSON.stringify(（script 内逻辑豁免）`, () => {
      const tpl = templateOf(read(f));
      expect(tpl, `${f} 模板内发现裸 JSON.stringify 直插，请换 highlightJson(prettyJson(x)) + <pre class="json-view" v-html> 范式`)
        .not.toContain('JSON.stringify(');
    });
  }

  it('收口视图确实走 highlightJson 通道（抽查范式落点）', () => {
    expect(read('views/TaskTreeView.vue')).toContain('v-html="detailHtml"');
    expect(read('views/SnapshotsView.vue')).toContain('v-html="highlightJson(prettyJson(s))"');
    expect(read('views/SecurityView.vue')).toContain('v-html="detailHtml"');
    expect(read('views/DiagView.vue')).toContain('v-html="hotThreadsHtml"');
    expect(read('components/IntegrationGuide.vue')).toContain('v-html="s.html"');
  });
});

describe('theme.css 全局类落位（W-C 批提升）', () => {
  const css = read('theme.css');

  it('.toolrow 工具行类存在', () => {
    expect(css).toMatch(/\.toolrow\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/);
  });

  /* 五百三十五批反转：原「.meta-strip 存在」正向锁随全局块整块删除改为退役负向锁（sweep524 Ilm 先例形态） */
  it('.meta-strip 全局类退役不回潮（535 批）', () => {
    expect(css, '.meta-strip 全局块必须退役（theme.css 不许回潮，形态归 MetaStrip 组件 .ms）').not.toMatch(/\.meta-strip/);
  });

  it('.m-put 等 HTTP 方法语义色轮存在', () => {
    for (const cls of ['.m-get', '.m-post', '.m-put', '.m-delete', '.m-head']) {
      expect(css, `${cls} 缺失`).toContain(cls + ' { color: var(--');
    }
  });
});
