/**
 * 五百五十六批·轨4（全站扁平化扫荡+去重复·残面清零）。554 约定四范式续扫，工蚁独占 30 视图域。
 *
 * 改动（约定④大容器框退役：壳三件套 bg+整框+radius 退役，分界 border-top 承接，
 * padding 等值迁入盒模型零变动——mp-sec 554 先例同语言；flex 主轴不变，删的是框不是布局）：
 *   ① WorkspaceView .ws-cfg（页面级配置面板容器，ra-card 已退形态同类）
 *   ② WorkspaceView .ws-w（网格部件分节单元，ov-cell 554 终态同类；ws-w-empty 空态
 *      不再被整块空框包裹——「空态不留整块空框」正中）
 *   ③ LiveDashboardView .ld-chart（监控网格分节单元 ×3，ov-cell 同类；类名锚保留，
 *      obsStack530 的 class="ld-chart" 与网格结构锁不受影响）
 *   ④ RemoteClustersView .rc-self（本集群信息条；同页 rc-card 列表项 551 已 border-top 行，
 *      全框信息条构成同页双标——MappingView 554「同页双标根治」先例）
 *
 * 【豁免备案（实勘定性，合法保留，禁改）】
 *   - AliasesView .alv-panel：paneShellWave547 + cardPrimitiveVerdict547 双正锁「全豁免不动」
 *     （写操作面板=ac-line 语义边框功能卡，备选案已否决）——class="card alv-panel" 正锁快照。
 *   - ConfigValidatorView .cv-tpl：flattenWave538 正锁「可点击交互卡豁免保留（约定③）」。
 *   - ConfigDriftView .cd-verdict pill：componentUnify530 正锁「清单角标因黑名单 spec 源码锁
 *     绕开」——形态已归 theme.css .pill 单源。
 *   - SqlBridgeView .br-card：535 批注释明文「壳仅页面级 wide 卡（err 面板/对比表）保留」
 *     （br-err=语义边框豁免）。
 *   - LiveDashboardView .ld-node：warn/bad 健康 tone 挂边框色（语义边框豁免）+节点数据单元。
 *   - ProfileFlameView .pf-sum-cell：KPI 数据格（纯数字+标签）非容器框，数值不与页内重复。
 *   - Ilm/Tasks/Snapshots/Templates/ReindexPreview/ReindexAdvanced 六视图 .card-t(.sm)：
 *     合法横排卡头/分节标题（554 断言 toContain('class="card-t"') 同口径），容器均已在
 *     547 批退壳或已是 border-top 分节（.ra-card）。
 *   - BulkEditorView 两处 rp-title 命中：注释行非活代码。
 *   - n-modal preset="card"：Naive UI 弹窗预设，非 .card 壳类消费。
 *   - writing-mode / rp-title 竖排轨：独占域 30 视图实勘零命中（负锁防回流）。
 *   - 手写状态胶囊：独占域零私造皮（StatusPill 既有消费在位；chip/cv-tag/tg-tag/mft-type/
 *     sv-stage 均数据值/枚举色标签非状态语义胶囊）。
 *   - 页内选索引重复：525/532 已收口 CurrentIdxChip；DiffEditor 对比位 idxB/ProfileFlame
 *     通配符独立输入/Lifecycle 表单目标字段三处既有裁决豁免。
 *
 * 形态：源码锁（新样式串逐字+壳特征不回流，仿 flattenWave554）+ 挂载断言（DOM 类名锚
 * 在场 + .card 全局壳类零命中防回流，tasksProgress528「挂载行为+源码锁」同手法）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
/* 剥 CSS/HTML 注释：注释里的字面不算数（lrBarSingleTrack/emptyStatePadding 同一教训） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* 五百五十七批：MonacoEditor mock（qxTvTools525:23 同款形态）——RemoteClustersView 补铺
   RawIoModal 后模块图引入 MonacoEditor→monaco-editor，happy-dom 真初始化挂起超 5s 墙；
   挂载用例只断 rc-self 锚/.card 壳零命中，Monaco 桩对断言语义零影响（ModalShell show=false
   时 slot 不渲染，弹窗本体不出现） */
vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup() { return () => h('div', { class: 'monaco-host' }); },
    }),
  };
});

const wsSrc = rd('../views/WorkspaceView.vue');
const liveSrc = rd('../views/LiveDashboardView.vue');
const rcSrc = rd('../views/RemoteClustersView.vue');

/* 独占域 30 视图（轨4 文件独占制清单） */
const TRACK_VIEWS = [
  'AliasesView', 'BulkEditorView', 'IlmView', 'ReindexAdvancedView', 'ReindexPreviewView',
  'SnapshotsView', 'TasksView', 'TaskTreeView', 'BrowserView', 'ClusterSettingsView',
  'ConfigDriftView', 'ConfigValidatorView', 'DiffEditorView', 'LifecycleView', 'LiveDashboardView',
  'MappingDesignerView', 'PitScrollView', 'PluginsView', 'ProfileFlameView', 'RemoteClustersView',
  'RestView', 'SlmView', 'SqlBridgeView', 'SynonymsManagerView', 'SystemView', 'TemplatesView',
  'TemplateGalleryView', 'UpdateByQueryView', 'WorkspaceView', 'ForbiddenView',
] as const;
const src = (name: string) => rd(`../views/${name}.vue`);

/* ═══════════ api mock：全兜底零网络（未覆盖方法返回安全空值，视图/store 侧全有 catch；
   不透传 actual 函数——happy-dom 下真发请求会拿到脏 resolve 打崩 store 派生链） ═══════════ */
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  /* 递归可调兜底：api.setup.status() 命名空间链、api.xxx() 直调都安全 resolve(null)
     （store 侧 .then 内解构 null 由同链 .catch 吸收；视图侧 r?.count||0 全护栏） */
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return anyCall;
    },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'remoteClusters') {
        return () => Promise.resolve({
          localClusterName: 'qa-es', count: 1, reason: '',
          remote_clusters: [{ name: 'rc-a', connected: true, mode: 'sniff' }],
        });
      }
      return anyCall;
    },
  });
  return { ...actual, api: proxied };
});

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(name: string) {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const mod = await import(`../views/${name}.vue`);
  const app = createApp({ render: () => h(mod.default as any) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  localStorage.removeItem('esquerystudio.workspace.v1');
  document.body.innerHTML = '';
});

/* ═══════════ ①② WorkspaceView：ws-cfg / ws-w 两壳退役 ═══════════ */

describe('五百五十六批①②：WorkspaceView ws-cfg/ws-w 大容器框退役（约定④）', () => {
  it('ws-cfg 壳三件套退役 → border-top 分节（padding/margin 等值迁入盒模型零变动）', () => {
    const t = strip(wsSrc);
    expect(t, 'ws-cfg 新形态（border-top 分节）').toMatch(
      /\.ws-cfg \{ border-top: 1px solid var\(--border\); padding: var\(--sp-3\); margin-bottom: var\(--sp-3\); \}/);
    expect(t, 'ws-cfg bg/整框/radius 不回流').not.toMatch(
      /\.ws-cfg \{[^}]*background/);
  });

  it('ws-w 壳三件套退役 → border-top 分节；空态不留整块空框载体（ws-w-empty 裸文本承接）', () => {
    const t = strip(wsSrc);
    expect(t, 'ws-w 新形态（border-top 分节）').toMatch(
      /\.ws-w \{ border-top: 1px solid var\(--border\); padding: var\(--sp-3\) var\(--sp-4\); min-height: 120px; display: flex; flex-direction: column; \}/);
    expect(t, 'ws-w bg/整框/radius 不回流').not.toMatch(
      /\.ws-w \{[^}]*background/);
  });

  it('挂载：默认 8 部件全渲染 .ws-w 锚在场；配置面板开启后 .ws-cfg 在场；全树 .card 壳类零命中', async () => {
    const { app, host } = await mountView('WorkspaceView');
    try {
      expect(host.querySelectorAll('.ws-w').length, '默认布局 8 部件全 on').toBe(8);
      expect(host.querySelector('.ws-cfg'), '配置面板初始关闭').toBeNull();
      const toggle = host.querySelector<HTMLButtonElement>('[class*="btn"]');
      /* 页头 actions 首钮即 showConfig 开关（模板 L9：class="btn ghost sm"） */
      expect(toggle, 'showConfig 开关钮在场').toBeTruthy();
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle(4);
      expect(host.querySelector('.ws-cfg'), '开启后配置面板分节锚在场').toBeTruthy();
      expect(host.querySelectorAll('.card').length, '全树 .card 壳类零命中').toBe(0);
    } finally {
      app.unmount();
      host.remove();
    }
  });
});

/* ═══════════ ③ LiveDashboardView：ld-chart 退壳 ═══════════ */

describe('五百五十六批③：LiveDashboardView ld-chart 网格分节退壳（796 同步更新：用户令大厂级统一卡壳）', () => {
  it('ld-chart 796 终态=panel 壳（与节点卡/CollapsePanel/LiveChartCard 同语言；556 分节口径随用户三/四令升级推翻备案）', () => {
    const t = strip(liveSrc);
    expect(t, 'ld-chart 796 新形态（panel 壳）').toMatch(
      /\.ld-chart \{ background: var\(--panel\); border: 1px solid var\(--border\); border-radius: var\(--r-m\); padding: var\(--sp-3\); \}/);
    expect(liveSrc, '类名锚保留（obsStack530 class="ld-chart" 锁同源）').toMatch(/class="ld-chart"/);
  });

  it('挂载：六张监控卡 .ld-chart 锚在场（R54 CPU/磁盘走势卡入列）；全树 .card 壳类零命中', async () => {
    const { app, host } = await mountView('LiveDashboardView');
    try {
      expect(host.querySelectorAll('.ld-chart').length, '六张监控卡恒渲染').toBe(6);
      expect(host.querySelectorAll('.card').length, '全树 .card 壳类零命中').toBe(0);
    } finally {
      app.unmount();
      host.remove();
    }
  });
});

/* ═══════════ ④ RemoteClustersView：rc-self 退壳（同页双标根治） ═══════════ */

describe('五百五十六批④：RemoteClustersView rc-self 信息条退壳（同页 rc-card 已 border-top 行）', () => {
  it('rc-self 壳三件套退役 → border-top 行（border-subtle 对齐同页 rc-card 551 语言）', () => {
    const t = strip(rcSrc);
    expect(t, 'rc-self 新形态（border-top 行）').toMatch(
      /\.rc-self \{ display: flex; gap: var\(--sp-3\); align-items: center; padding: var\(--sp-3\) var\(--sp-4\); border-top: 1px solid var\(--border-subtle\); margin-bottom: var\(--sp-3\); font-size: var\(--fs-sm\); \}/);
    expect(t, 'rc-self bg/整框/radius 不回流').not.toMatch(
      /\.rc-self \{[^}]*background/);
  });

  it('挂载：rc-self 本集群条锚在场；全树 .card 壳类零命中', async () => {
    const { app, host } = await mountView('RemoteClustersView');
    try {
      expect(host.querySelector('.rc-self'), '本集群信息条恒渲染').toBeTruthy();
      expect(host.textContent, 'mock 数据就位（本集群名渲染）').toContain('qa-es');
      expect(host.querySelectorAll('.card').length, '全树 .card 壳类零命中').toBe(0);
    } finally {
      app.unmount();
      host.remove();
    }
  });
});

/* ═══════════ ⑤⑥ 独占域四范式负锁（防回流）+ 豁免快照 ═══════════ */

describe('五百五十六批⑤：独占域竖排轨负锁（writing-mode / rp-title 零命中）', () => {
  it('30 视图 writing-mode 竖排死码零命中（约定①）', () => {
    for (const v of TRACK_VIEWS) {
      expect(strip(src(v)), `${v}.vue writing-mode 零命中`).not.toMatch(/writing-mode/);
    }
  });

  it('30 视图 rp-title 竖排标题轨零命中（约定①；BulkEditorView 注释行剥除后不计）', () => {
    for (const v of TRACK_VIEWS) {
      expect(strip(src(v)), `${v}.vue rp-title 零命中`).not.toMatch(/rp-title/);
    }
  });
});

describe('五百五十六批⑥：全局 .card 壳类消费清零（豁免快照）+ card-t 横排标题保留', () => {
  it('30 视图全局 .card 壳类消费零命中（554 原版正则：独立 card token；本类名锚 cv-card/be-card-hd 等不误伤）', () => {
    for (const v of TRACK_VIEWS) {
      /* 五百五十八批同步更新（击穿者：558 工蚁G——alv-panel 全站最后一个全局 .card 壳退役）：
         AliasesView 回归主断言，豁免 continue 退役，30 视图全量零消费 */
      expect(strip(src(v)), `${v}.vue 全局 .card 壳类零消费`).not.toMatch(/class="(?:[^"]* )?card(?: [^"]*)?"/);
    }
  });

  it('AliasesView alv-panel 退役正锁（558 击穿同步更新：豁免快照随壳退役改防回流锁）', () => {
    const s = src('AliasesView');
    /* 五百五十八批同步更新（击穿者：558 工蚁G）：547 双正锁豁免字面改退役形 + ac-line 语义线
       border-top 承接锚（原 padding/border-color 覆写随壳退役，语义保形） */
    expect(s, 'alv-panel 全局 .card 壳不回流（558）').not.toMatch(/class="card alv-panel"/);
    expect(s, 'ac-line 语义线 border-top 承接（语义边框豁免约定保形）')
      .toMatch(/\.alv-panel \{ border-top: 1px solid var\(--ac-line\); padding: var\(--sp-3\) 14px; \}/);
  });

  it('六视图 card-t 横排卡头/分节标题合法保留（防误删；554 toContain 同口径）', () => {
    expect(strip(src('IlmView')), 'ilm 容器 547 已退壳，card-t 横排标题保留').toContain('class="card-t"');
    expect(strip(src('TasksView'))).toContain('class="card-t"');
    expect(strip(src('SnapshotsView'))).toContain('class="card-t"');
    expect(strip(src('TemplatesView'))).toContain('class="card-t"');
    expect(strip(src('ReindexAdvancedView'))).toContain('class="card-t"');
    expect(strip(src('ReindexPreviewView'))).toContain('class="card-t sm"');
  });
});
