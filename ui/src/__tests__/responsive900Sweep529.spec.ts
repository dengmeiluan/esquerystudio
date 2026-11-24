/* 五百二十九批 W-D：900 第二档收尾守卫——§6q 遗留 15 视图补齐 @media (max-width: 900px)
 * 紧凑微调档（此前只有 1100 堆叠档、900 全缺，§6q 台账遗留清零）。
 * 口径照 528 W-E 六视图先例（Xmigrate/TaskTree/Browser/Templates/QueryHub/IndexHub）：
 * 只加 CSS 零结构动；分栏单列化归 1100 档，900 档只做 wrap 换行 / 侧距收窄 / 下限钳制。
 * 锁三件事：
 * ① 15 视图 900 档在场且档内非空（防回删、防空壳档）；
 * ② 新增档不踩 responsiveGuard239 锚①口径（无 ≥300px 裸 width）与锚④口径
 *    （视图侧不得自写 min-width:901px——901 补集单源在 theme.css，勿散落视图侧）；
 * ③ 1100 堆叠档仍全体在场（900 档是补强不是替代，两档职责不同不许合并）。
 * 防空跑：①③ 为白名单全量断言，删任一视图档位即红。
 *
 * 五百三十一批扩容：9 视图纳入同一清单（Workbench 五视图 SearchSandbox/Analyze/BulkEditor/
 * SqlBridge/Rest + 简单四页 Lifecycle/Favorites/Plugins/AnalysisSettings）。五视图 pane 堆叠
 * 由 WorkbenchLayout <1100 JS 档兜底、四简单页本就无 1100 CSS 档，故只进 ①②（900 档在场 +
 * 纪律口径），不进 ③（1100 档在场断言仍以 VIEWS_529 为界）。纪律断言 ② 已有全局口径，
 * 按约定只扩文件清单不加新断言。
 *
 * 五百三十三批扩容：15 视图纳入（当时 900 档未全覆盖页清单外的 18 视图列为不入册名单，
 * 其中 7 个系 529/531 历史批次已在清单；其余 11 个虽部分含 900 档按当时边界）。本清单
 * 即历史各批次的并集记录，非永久封阻——后续批次逐批合并（534 批见下）。
 * ReindexAdvancedView 虽有 900 档但暂不入册：其档为单行写法，与本 spec 的多行块提取正则
 * （block900Of）不兼容，且该文件不在 534 批 owned 清单。
 *
 * 五百三十四批扩容：9 视图纯入册（AdhocRebuild/Aliases/IndexHub/IndexOptimizer/
 * IndexSettings/LiveDashboard/ProfileFlame/Security/System/Xmigrate 中实测与 block900Of
 * 兼容的 9 个——SecurityView 的 900 档是两处单行写法，与 ReindexAdvanced 同因，
 * 待其 owned 工蚁把档改多行后入册）。纪律：只扩文件清单不加新断言。
 *
 * 五百三十五批扩容：5 视图纯入册（SearchTemplates/Slm/TemplateGallery/Topology/Watcher
 * ——533 批名单中实测与 block900Of 兼容者，多行档逐个核过非空且无 ≥300px 裸 width）。
 * LuceneQuery/ReindexAdvanced/Security 维持不入册（单行档与提取正则不兼容）。
 *
 * 五百三十八批扩容：MatchMatrixView 纯入册（补 900 档——单列纵 flex 页 + .mm-hd 本就
 * flex-wrap，档内只收页头 gap 一档，与 528 W-E「只加 CSS 零结构动」同口径）。
 * 豁免备案（零 @media 文件；538 批时为三文件，五百五十一批勘误——DevToolsView 已于 547 批
 * 补 900 档并随勘误入册，现仅余两文件，同 531 批五视图不入册口径）：
 * ForbiddenView/NotFoundView = 静态居中页，无分栏可塌、无固定宽可收，补 900 档无对象；
 * （勘误备案：DevToolsView 原「pane 堆叠由 WorkbenchLayout <1100 JS 档兜底，无 CSS 档必要」
 * 裁决于 547 批被推翻补档——全站最后一个零 @media 主工作页，实测与 block900Of 提取正则
 * 兼容，故随五百五十一批勘误入册断言面。） */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VIEWS_529 = [
  'AnalyzerLabView', 'ConfigValidatorView', 'DiagView', 'DiffEditorView', 'DslQueryView',
  'IlmView', 'MappingDesignerView', 'MappingView', 'PainlessLabView', 'PitScrollView',
  'RankDebugView', 'ScoreExplainView', 'SqlConsoleView', 'SynonymsManagerView', 'UpdateByQueryView',
] as const;

/* 五百三十一批：Workbench 五视图（pane 堆叠归 JS，无 CSS 1100 档）+ 简单四页。
 * 五百五十二批出册 SearchSandboxView（击穿者：flattenWave552 ① ss-bar card 壳退役）——
 * 其 900 档内容=壳体侧距收窄，styled 对象随壳退役删除，pane 堆叠仍由 WorkbenchLayout
 * <1100 JS 档兜底，非回删除档（TopologyView 同刀但 tp-canvas 档有独立对象维持入册） */
const VIEWS_531 = [
  'AnalyzeView', 'BulkEditorView', 'SqlBridgeView', 'RestView',
  'LifecycleView', 'FavoritesView', 'PluginsView', 'AnalysisSettingsView',
] as const;

/* 五百三十三批：非黑名单且含 900 档的漏网视图合并（13 既有 + 2 补档） */
const VIEWS_533 = [
  'BoostTunerView', 'BrowserView', 'ClusterSettingsView', 'ConfigDriftView', 'HealthReportView',
  'OverviewView', 'QueryHubView', 'QueryXrayView', 'ReindexPreviewView',
  'RemoteClustersView', 'SnapshotsView', 'TaskTreeView', 'TasksView', 'TemplatesView', 'WorkspaceView',
] as const;

/* 五百三十四批：900 档既有视图纯入册 9 个（SecurityView 单行档与提取正则不兼容，见头注） */
const VIEWS_534 = [
  'AdhocRebuildView', 'AliasesView', 'IndexHubView', 'IndexOptimizerView', 'IndexSettingsView',
  'LiveDashboardView', 'ProfileFlameView', 'SystemView', 'XmigrateView',
] as const;

/* 五百三十五批：900 档既有视图纯入册 5 个（多行档实测兼容；LuceneQuery/ReindexAdvanced/
   Security 单行档维持，见头注） */
const VIEWS_W9 = [
  'SearchTemplatesView', 'SlmView', 'TemplateGalleryView', 'TopologyView', 'WatcherView',
] as const;

/* 五百三十八批：MatchMatrixView 补 900 档后入册 */
const VIEWS_538 = ['MatchMatrixView'] as const;

/* 五百四十七批补档 + 五百五十一批勘误入册：DevToolsView（原三文件豁免成员，547 批补 900 档） */
const VIEWS_547 = ['DevToolsView'] as const;

const VIEWS_ALL = [
  ...VIEWS_529, ...VIEWS_531, ...VIEWS_533, ...VIEWS_534, ...VIEWS_W9, ...VIEWS_538, ...VIEWS_547,
];

const srcOf = (name: string) => readFileSync(join(__dirname, '..', 'views', `${name}.vue`), 'utf-8');
/* 900 档块提取：规则全为单行，非贪婪到首个行首 `}` 即块尾（块内无行首大括号） */
const block900Of = (src: string) => src.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);

describe('五百二十九批：900 第二档补齐 15 视图（§6q 遗留清零，W-D；531/533/534/535/538/547 批扩容至 55 视图）', () => {
  it('① 54 视图 @media (max-width: 900px) 档全部在场且档内非空（552 出册 SearchSandbox 见 VIEWS_531 注）', () => {
    for (const name of VIEWS_ALL) {
      const block = block900Of(srcOf(name));
      expect(block, `${name}.vue 缺 900 紧凑微调档`).toBeTruthy();
      expect(block![0], `${name}.vue 900 档为空壳`).toMatch(/\{[^{}]+\}/);
    }
  });

  it('② 900 档内无 ≥300px 裸 width（锚①同口径）；视图侧无 min-width:901px（锚④单源）', () => {
    for (const name of VIEWS_ALL) {
      const src = srcOf(name);
      expect(src, `${name}.vue 视图侧不得自写 901 补集（单源在 theme.css）`).not.toContain('min-width: 901px');
      for (const line of block900Of(src)![0].split('\n')) {
        const m = line.match(/(?:^|[^-.\w])width:\s*(\d{3,})px/);
        expect(!!m && Number(m[1]) >= 300, `${name}.vue 900 档出现 ≥300px 裸 width：${line.trim()}`).toBe(false);
      }
    }
  });

  /* 五百三十一批：仅 VIEWS_529 界内锚 1100 档——531 九视图五者 pane 堆叠由 WorkbenchLayout
     <1100 JS 档承担、四简单页从无 CSS 1100 档，两档职责边界不同，不并入本断言 */
  it('③ 1100 堆叠档仍全体在场（900 补强不替代，两档职责不合并）', () => {
    for (const name of VIEWS_529) {
      expect(srcOf(name), `${name}.vue 1100 档丢失`).toContain('@media (max-width: 1100px)');
    }
  });

  /* 五百五十七批扩锚：断点钳 min() 字面锁——529 批「下限钳制」范式在基样式层的落点
     （XmigrateView .xm-jobs-kw min(240px,100%) 同款）：基样式宽在极窄容器不撑破父级，
     900 档 100% 独占行（BrowserView .bw-search flex:0 0 100%）不受影响。退回裸 px 即红。 */
  it('④ 断点钳 min() 字面在场（基样式极窄溢出钳制，退回裸 px 即红）', () => {
    expect(srcOf('BrowserView'), 'BrowserView .bw-search 应为 min(240px,100%) 钳制')
      .toContain('width: min(240px, 100%)');
    expect(srcOf('AnalyzeView'), 'AnalyzeView .av-tk-kw 应为 min(180px,100%) 钳制')
      .toContain('width: min(180px, 100%)');
  });
});
