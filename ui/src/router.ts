import { createRouter, createWebHashHistory, type LocationQuery } from 'vue-router';
import { legacyRedirect, LEGACY_QUERY_PATHS } from './utils/queryHub';
import { useAuthStore } from './stores/auth';
import { useAppStore } from './stores/app';
import { useUiConfigStore } from './stores/uiConfig';
import pagesContract from '@contract';
import { writeStoredRaw, removeStoredRaw } from './utils/safeJson';
import { PAGE_BY_ROUTE } from './utils/uiConfig';

/* 侧边栏分组与导航项（2.5.0 起）从页面契约 esquerystudio-pages.json 派生——
 契约是 Java 拦截器 / 本前端 / 宿主菜单注册器三端的唯一事实源，禁止回到手工维护（防漂移）。
 组序 = 契约 sort 升序；NavItem.key = 契约 hotkey（vim 跳转与 ⌘K 沿用）。
 IA 分组语义、 查询入口收敛等历史决策已固化进契约文件。 */
export const NAV_GROUPS: readonly { id: string; name: string }[] =
  [...pagesContract.groups].sort((a, b) => a.sort - b.sort).map(g => ({ id: g.id, name: g.name }));

/* 导航项类型——minVer 为功能要求的最低 ES 版本（major.minor），
 当前集群版本低于它时侧边栏入口显示「需 x.x+」降级徽标（预警不禁止，不允许点进去才 400）。
 2.5.0 增 pageKey：页面级授权（菜单 SPI）的判定单元，与契约 pages[].key 一一对应。 */
interface NavItem {
  path: string; name: string; icon: string; key: string; group: string;
  pageKey: string; minVer?: string;
}

export const NAV_ITEMS: readonly NavItem[] = pagesContract.pages.map(p => ({
  path: p.route, name: p.name, icon: p.icon, key: p.hotkey, group: p.group,
  pageKey: p.key, minVer: p.minVer ?? undefined,
}));

/* 连接模型键解析(与后端 EnvPagesResolver.connPagesOf/effectivePages 同构):
 grantedPages 键 = conn:{connId}:{pageKey} / conn:{connId}:w:{pageKey}(写键页面同可见,写门另判)
 + 静态 key(全局页,对所有目标生效)。targetId 空=宿主(host 下仅静态键可见——连接键不跨连接)。
 返回 null 仅当 grantedPages 未启用(null),语义与三态一致。 */
const CONN_KEY_RE = /^conn:([^:]+):(?:w:)?(.+)$/;

export function effectivePagesForTarget(
  grantedPages: readonly string[] | null,
  targetId: string | null | undefined,
): Set<string> | null {
  if (grantedPages == null) return null;
  const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : targetId;
  const out = new Set<string>();
  for (const g of grantedPages) {
    const m = CONN_KEY_RE.exec(g);
    if (m) {
      if (m[1] === tid) out.add(m[2]);
    } else {
      out.add(g);
    }
  }
  return out;
}

/* 路由路径归一：Vue Router 对大小写/尾斜杠是宽松匹配（/INDICES、/indices/ 都能进 /indices），
 但页面门此前的精确串比对会 miss 后放行——深链/收藏即可绕过菜单门。判定前统一小写去尾斜杠。 */
export function normalizeRoutePath(path: string): string {
  const p = String(path || '').split('?')[0].split('#')[0];
  const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
  return trimmed.toLowerCase();
}

/* 2.5.0 页面级授权判定（纯函数，守卫/侧栏/App.vue 复核共用）：
 grantedPages=null 未启用（内置身份/宿主未下发/逃生阀/probe 未完成）→ 全量放行；
 非页面路由（/forbidden、404、legacy 重定向）不拦——否则全拒用户连提示页都进不去。
 targetId 缺省=宿主：静态键模型行为与既有 includes 逐字节一致，连接键模型按当前目标收缩。 */
/* 恒定执行在宿主集群的页面：连接键必须按 host 判定，否则 conn:c1:xxx 会看到一进去就 403
   的死页面，而 conn:host:xxx 反而被隐藏。 */
export const HOST_BOUND_PAGES: ReadonlySet<string> = new Set(['system', 'config-drift']);

export type EnvAllowsFn = (pageKey: string, targetId?: string | null) => boolean;

export function pageAllowed(
  grantedPages: readonly string[] | null,
  path: string,
  targetId?: string | null,
  envAllows?: EnvAllowsFn,
  role?: string | null,
): boolean {
  const item = NAV_ITEMS.find(n => n.path === normalizeRoutePath(path));
  if (!item) return true;
  if (grantedPages == null) {
    /* 内置非 ADMIN 的 REST/DevTools 静态页入口是死页（后端 requiredRole=ADMIN）；
       无鉴权部署/探测中 role 为空，保持全量可见语义。 */
    if (role && role !== 'ADMIN' && (item.pageKey === 'rest' || item.pageKey === 'devtools')) {
      return false;
    }
    return true;
  }
  const pageTarget = HOST_BOUND_PAGES.has(item.pageKey) ? 'host' : targetId;
  const eff = effectivePagesForTarget(grantedPages, pageTarget);
  const tid = !pageTarget || String(pageTarget).toLowerCase() === 'host' ? 'host' : pageTarget;
  const envOk = (key: string, target?: string | null) => !envAllows || envAllows(key, target);
  const connKey = (page: string) => grantedPages.includes('conn:' + tid + ':' + page)
    || grantedPages.includes('conn:' + tid + ':w:' + page);
  /* REST/DevTools 的执行门对静态页授权仍要求 ADMIN（后端 requiredRole=ADMIN）；
     pageAllowed 的非 ADMIN 调用面只认连接键，避免静态 rest/devtools 页露出必 403 的死入口。
     ADMIN 在守卫/侧栏/命令面板均短路 pageAllowed，不受影响。 */
  if (item.pageKey === 'rest') {
    return connKey('rest') && envOk('rest', tid);
  }
  if (item.pageKey === 'devtools') {
    if (connKey('devtools') && envOk('devtools', tid)) return true;
    if (grantedPages.includes('conn:' + tid + ':w:rest') && envOk('rest', tid)) return true;
    return false;
  }
  if (item.pageKey === 'mcp') {
    if (connKey('mcp') && envOk('mcp', tid)) return true;
    if (connKey('devtools') && envOk('devtools', tid)) return true;
    return false;
  }
  if (eff !== null && eff.has(item.pageKey) && envOk(item.pageKey, tid)) return true;
  /* security 审计读是 host-scope：当前目标无该页时，conn:host:security 仍应打开入口
     （后端 pageScope 回退宿主页集，行级仍只看宿主事件）。 */
  if (item.pageKey === 'security'
      && (grantedPages.includes('security')
        || grantedPages.includes('conn:host:security')
        || grantedPages.includes('conn:host:w:security'))) return true;
  /* 迁移作业的 X-Es-Target 随表单源连接走，不跟顶栏：任何连接上的 xmigrate
     页授权都应让页面可达（否则源连接已授权、顶栏在宿主时菜单恒隐藏）。
     环境模板按授予该页的连接自身 env 收缩。 */
  if (item.pageKey === 'xmigrate') {
    for (const g of grantedPages) {
      const m = /^conn:([^:]+):(?:w:)?xmigrate$/.exec(g);
      if (m && envOk('xmigrate', m[1])) return true;
    }
  }
  return false;
}

/* 2.5.0 页面级授权：拒绝时的统一跳转构造（守卫/App 复核共用）。放行返回 null。 */

/* 时序补偿记录（仅内存，不跨刷新）：身份/连接目录晚到时页面被误拒 → /forbidden，
   收敛后 App.vue 复核据此自动回迁原页面。用户主动离开 /forbidden 即作废。 */
let lastDeniedPath: string | null = null;
export function peekDeniedPage(): string | null { return lastDeniedPath; }
export function consumeDeniedPage(): string | null { const p = lastDeniedPath; lastDeniedPath = null; return p; }
export function clearDeniedPage(): void { lastDeniedPath = null; }

export function pageDeniedRedirect(
  grantedPages: readonly string[] | null,
  path: string,
  targetId?: string | null,
  envAllows?: EnvAllowsFn,
  role?: string | null,
) {
  if (pageAllowed(grantedPages, path, targetId, envAllows, role)) return null;
  const item = NAV_ITEMS.find(n => n.path === normalizeRoutePath(path))!;
  lastDeniedPath = normalizeRoutePath(path);
  return { path: '/forbidden', query: { page: item.pageKey, name: item.name } };
}

/* 功能包停用：深链/收藏/旧标签页访问未启用的模块时，落到可解释的 ModuleOff 页，
   而不是 404/空白。功能包是部署选择，不是权限——先于身份页面门判定。 */
export function moduleOffRedirect(path: string) {
  const page = PAGE_BY_ROUTE.get(normalizeRoutePath(path));
  if (!page) return null;
  const ui = useUiConfigStore();
  if (ui.pageEnabled(page.key)) return null;
  const pack = ui.packOf(page.key);
  return {
    path: '/module-off',
    query: {
      page: page.key,
      name: page.name,
      pack: pack?.id || '',
      packName: pack?.name || '',
    },
  };
}

/* 超宽屏（≥1920）居中豁免：theme.css 「.page 用 padding 居中，表格密度页可豁免」的
 承诺由本集合 + App.vue（.page.page-wide 覆盖居中 padding）兑现（theme.css 冻结，
 机制落 router/App）。wide 判据 = 内容主体是表格/编辑器/宽表单的数据密集页：
 查询工作台群 / 索引工作区群 / 重建迁移群 / 开发者工具群 / 各表格观测页全覆盖；
 纯阅读（/favorites 收藏列表、/templates-gallery 模板画廊）与向导/错误页
 （/forbidden、404）保持居中不进本集合。
 豁免（裁决）：/browser、/diag、/search 三页页头由工具条/模式切换器承担，
 不补 PageHeader。 */
const WIDE_ROUTES: ReadonlySet<string> = new Set([
  /* 概览/索引工作区群 */
  '/overview', '/indices', '/mapping', '/browser', '/index-settings', '/aliases',
  '/mapping-designer', '/analysis-settings', '/synonyms',
  /* 查询工作台群 */
  '/search', '/analyze',
  /* 重建迁移群 */
  '/xmigrate', '/adhoc-rebuild', '/reindex-advanced', '/reindex-preview',
  '/update-by-query', '/bulk', '/workspace',
  /* 开发者工具群 */
  '/devtools', '/rest', '/painless-lab', '/doc-diff', '/config-validator', '/config-drift', '/mcp',
  /* 表格/画布观测页 */
  '/diag', '/system', '/tasks', '/task-tree', '/snapshots', '/slm', '/watcher',
  '/ilm', '/lifecycle', '/remote-clusters', '/security', '/plugins', '/health-report',
  '/live', '/topology', '/profile-flame', '/templates', '/optimizer', '/cluster-settings',
  /* 相关性实验室群（W1b 校验补遗：/analyzer-lab 分词实验室多 lane 并排对比+字段清单，
 数据密集与 match-matrix 同族，不豁免会被 1600px 居中压窄对比列） */
  '/score-explain', '/rank-debug', '/boost-tuner', '/match-matrix', '/query-xray',
  '/search-templates', '/analyzer-lab',
]);

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/overview', component: () => import('./views/OverviewView.vue') },
    { path: '/indices', component: () => import('./views/IndexHubView.vue') },
    /* 查询工作台（六模式一页）+ 旧查询路由零死链重定向（收藏/⌘K/goto/分享链接全保参数） */
    { path: '/search', component: () => import('./views/QueryHubView.vue') },
    ...Object.keys(LEGACY_QUERY_PATHS).map(p => ({
      path: p,
      redirect: (to: { query: Record<string, unknown> }) => legacyRedirect(p, to.query as LocationQuery),
    })),
    { path: '/mapping', component: () => import('./views/MappingView.vue') },
    { path: '/browser', component: () => import('./views/BrowserView.vue') },
    { path: '/rest', component: () => import('./views/RestView.vue') },
    { path: '/diag', component: () => import('./views/DiagView.vue') },
    { path: '/xmigrate', component: () => import('./views/XmigrateView.vue') },
    { path: '/system', component: () => import('./views/SystemView.vue') },
    { path: '/tasks', component: () => import('./views/TasksView.vue') },
    { path: '/analyze', component: () => import('./views/AnalyzeView.vue') },
    { path: '/aliases', component: () => import('./views/AliasesView.vue') },
    { path: '/topology', component: () => import('./views/TopologyView.vue') },
    { path: '/templates', component: () => import('./views/TemplatesView.vue') },
    { path: '/snapshots', component: () => import('./views/SnapshotsView.vue') },
    { path: '/index-settings', component: () => import('./views/IndexSettingsView.vue') },
    { path: '/ilm', component: () => import('./views/IlmView.vue') },
    { path: '/cluster-settings', component: () => import('./views/ClusterSettingsView.vue') },
    { path: '/task-tree', component: () => import('./views/TaskTreeView.vue') },
    { path: '/reindex-preview', component: () => import('./views/ReindexPreviewView.vue') },
    { path: '/health-report', component: () => import('./views/HealthReportView.vue') },
    { path: '/templates-gallery', component: () => import('./views/TemplateGalleryView.vue') },
    { path: '/optimizer', component: () => import('./views/IndexOptimizerView.vue') },
    /* */
    { path: '/slm', component: () => import('./views/SlmView.vue') },
    { path: '/watcher', component: () => import('./views/WatcherView.vue') },
    { path: '/remote-clusters', component: () => import('./views/RemoteClustersView.vue') },
    { path: '/favorites', component: () => import('./views/FavoritesView.vue') },
    { path: '/reindex-advanced', component: () => import('./views/ReindexAdvancedView.vue') },
    /* */
    { path: '/workspace', component: () => import('./views/WorkspaceView.vue') },
    { path: '/bulk', component: () => import('./views/BulkEditorView.vue') },
    { path: '/update-by-query', component: () => import('./views/UpdateByQueryView.vue') },
    { path: '/doc-diff', component: () => import('./views/DiffEditorView.vue') },
    /* */
    { path: '/devtools', component: () => import('./views/DevToolsView.vue') },
    { path: '/mcp', component: () => import('./views/McpConsoleView.vue') },
    /* 合并：旧 /cluster-map（圆环拓扑）并入 /topology，保留重定向防旧深链/收藏 404 */
    { path: '/cluster-map', redirect: '/topology' },
    { path: '/profile-flame', component: () => import('./views/ProfileFlameView.vue') },
    { path: '/live', component: () => import('./views/LiveDashboardView.vue') },
    { path: '/painless-lab', component: () => import('./views/PainlessLabView.vue') },
    { path: '/lifecycle', component: () => import('./views/LifecycleView.vue') },
    /* */
    { path: '/mapping-designer', component: () => import('./views/MappingDesignerView.vue') },
    { path: '/analyzer-lab', component: () => import('./views/AnalyzerLabView.vue') },
    { path: '/synonyms', component: () => import('./views/SynonymsManagerView.vue') },
    { path: '/analysis-settings', component: () => import('./views/AnalysisSettingsView.vue') },
    { path: '/plugins', component: () => import('./views/PluginsView.vue') },
    { path: '/score-explain', component: () => import('./views/ScoreExplainView.vue') },
    { path: '/rank-debug', component: () => import('./views/RankDebugView.vue') },
    { path: '/boost-tuner', component: () => import('./views/BoostTunerView.vue') },
    { path: '/match-matrix', component: () => import('./views/MatchMatrixView.vue') },
    { path: '/query-xray', component: () => import('./views/QueryXrayView.vue') },
    /* */
    { path: '/search-templates', component: () => import('./views/SearchTemplatesView.vue') },
    /* */
    { path: '/security', component: () => import('./views/SecurityView.vue') },
    /* 功能包停用落地页（不进 NAV_ITEMS；非页面路由，页面门不拦） */
    { path: '/module-off', component: () => import('./views/ModuleOffView.vue') },
    { path: '/adhoc-rebuild', component: () => import('./views/AdhocRebuildView.vue') },
    /* */
    { path: '/config-validator', component: () => import('./views/ConfigValidatorView.vue') },
    { path: '/config-drift', component: () => import('./views/ConfigDriftView.vue') },
    /* 2.5.0：页面级授权拒绝落地页（不进 NAV_ITEMS——守卫对非页面路由不拦，全拒用户可达） */
    { path: '/forbidden', component: () => import('./views/ForbiddenView.vue') },
    /* 未匹配路由兜底——静默空白是产品事故，给 404 页 + 相近路由猜测 */
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue') },
  ].map(r => (WIDE_ROUTES.has(r.path) ? { ...r, meta: { wide: true } } : r)),
});

/* 部署换 hash 后，旧标签页点新路由会动态 import 旧资产 404 白屏——
 检测到 chunk 加载失败则整页刷新拉新资产（sessionStorage 防死循环，同一轮只自愈一次） */
const CHUNK_RETRY_KEY = 'esquerystudio.chunk-retry';
router.onError((err, to) => {
  const msg = String((err as any)?.message || err);
  if (!/dynamically imported module|Loading chunk|module script failed/i.test(msg)) return;
  if (sessionStorage.getItem(CHUNK_RETRY_KEY) === '1') return;
  writeStoredRaw(sessionStorage, CHUNK_RETRY_KEY, '1');
  if (to?.fullPath) location.hash = to.fullPath;
  location.reload();
});

/* 2.5.0 页面级授权守卫：probe 完成前 grantedPages=null（未启用语义）首屏不拦，
 身份到达后由 App.vue watch grantedPages 复核当前路由兜底纠正（跳转构造收敛在 pageDeniedRedirect）。
 判定按当前目标连接收缩（conn:{id}:{page} 键只对目标连接生效）。 */
router.beforeEach((to) => {
  /* 功能包停用优先：ADMIN 也受部署选择约束（这不是权限，是产品面裁剪）。 */
  const off = moduleOffRedirect(to.path);
  if (off) return off;
  const auth = useAuthStore();
  /* 超级管理员全局可见：宿主白名单/连接键不拦 ADMIN */
  if (auth.isAdmin()) return true;
  /* 时序补偿落地裁决（竞态免疫）：误拒 replace('/forbidden') 是异步导航，提交时
     身份/连接目录可能已收敛（App 复核 watch 先于 replace 提交跑完、走的是放行分支
     不回迁，之后无新触发→永久停车，产线实报 35s）。此处对每次 /forbidden 落地用
     当前输入重判：记录中的被拒页现已放行 → 直接回迁。仍在守卫内重判=与落地同帧输入。 */
  if (to.path === '/forbidden' && !auth.isAdmin()) {
    const back = peekDeniedPage();
    if (back) {
      const re = pageDeniedRedirect(auth.grantedPages, back, useAppStore().target,
        auth.envAllows, auth.me?.role);
      if (!re) { consumeDeniedPage(); return back; }
    }
  }
  return pageDeniedRedirect(auth.grantedPages, to.path, useAppStore().target,
    auth.envAllows, auth.me?.role) ?? true;
});

/* 标签页标题随页面切换，多开标签可区分 */
router.afterEach((to) => {
  /* 导航成功即清自愈标记，下次部署后仍可再自愈 */
  removeStoredRaw(sessionStorage, CHUNK_RETRY_KEY);
  const item = NAV_ITEMS.find(n => n.path === normalizeRoutePath(to.path));
  document.title = (item ? item.name + ' · ' : '') + useUiConfigStore().product.name;
});
