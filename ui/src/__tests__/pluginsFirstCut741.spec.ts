/**
 * 七百四十一批：Plugins 首刀四小刀（R122；R121 裁决表 G148+G147+G149+G150）。
 *
 * ① G148（P3 铁律 F·头号）RawIo 原始请求/响应入口缺（740 S-G3 全页零命中实锚；
 *    Slm/Lifecycle D6 均标配=薄面档同族缺位）——修法=页头补 RawIoModal 入口
 *    （rim 组件族复用，路径子串 /cluster/plugins；判空不开空弹窗）。
 * ② G147（P3 铁律 D·次刀）页头刷新钮+空态重新加载钮在途窗 disabled 既有而
 *    RefreshCw 无 spinning（740 S-G2 三读实锚；737 G132/736 G121·G122 同族）。
 * ③ G149（P3 铁律 F）raw 表英文列名 node/component/version/description 无中文语义
 *    tip（740 S-G4 实锚）——修法=QRT 内核新增可选 colTips 通道（缺省零增量），
 *    th :title=中文语义+换行+内建排序/管理提示；导出 CSV 表头同源口径不动
 *    （717 G60/736 G133 双语同款：显示层英文留检索，悬浮层中文语义）；
 *    矩阵「插件」列 title 同族顺带。
 * ④ G150（弱 P3 aria 随批可裁）安装指南弹窗手写壳未迁 ModalShell——最小刀补
 *    role=dialog+aria-modal+aria-label（带名档含插件名）+关钮 aria-label
 *    （R92-A3 Esc/Tab trap 既有=半合规补全）。
 *
 * 驱动方式照 slmFirstCut737（vue-router 轻 mock+只 mock ../api 含 ioRecorder
 * 记录环种数）+ Monaco stub（RawIoModal 内嵌 Monaco，happy-dom canvas 崩）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import type { RawIoRec } from '../api';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const routeMock = { path: '/plugins', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* JsonArea 内核=Monaco——happy-dom canvas 崩（lifecycleFirstCut735 同款 stub；
   RawIoModal 内两分节 Monaco 只读，本 spec 对编辑器内容零驱动） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

/* ioRecorder 记录环种数（openRawIo 判空链与有记录开弹窗链都需要）；740 probe mock 球
   同形态：3 节点×4 插件含 mapper-murmur3 缺 es-node-3 的 1 项不一致（summary 带 count） */
const pluginsMatrixFn = vi.fn();
const ioRing: RawIoRec[] = [];
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      pluginsMatrix: (...a: any[]) => pluginsMatrixFn(...a),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

import PluginsView from '../views/PluginsView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const app = createApp({ render: () => h(PluginsView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: HTMLElement, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

function collapse(s: string | null): string { return (s || '').replace(/\s+/g, ''); }

const PLUGINS_OK = {
  available: true, reason: '',
  nodeCount: 3, pluginCount: 4,
  mismatches: ['mapper-murmur3'],
  nodes: [
    { name: 'es-node-1', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
    { name: 'es-node-2', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
    { name: 'es-node-3', component: 'analysis-ik', version: '7.10.0', description: 'IK 分词器' },
    { name: 'es-node-1', component: 'mapper-murmur3', version: '7.10.0', description: 'murmur3 哈希映射' },
    { name: 'es-node-2', component: 'mapper-murmur3', version: '7.10.0', description: 'murmur3 哈希映射' },
    { name: 'es-node-1', component: 'ingest-attachment', version: '7.10.0', description: '附件摄取' },
    { name: 'es-node-2', component: 'ingest-attachment', version: '7.10.0', description: '附件摄取' },
    { name: 'es-node-3', component: 'ingest-attachment', version: '7.10.0', description: '附件摄取' },
    { name: 'es-node-1', component: 'repository-s3', version: '7.10.0', description: 'S3 快照仓库' },
    { name: 'es-node-2', component: 'repository-s3', version: '7.10.0', description: 'S3 快照仓库' },
    { name: 'es-node-3', component: 'repository-s3', version: '7.10.0', description: 'S3 快照仓库' },
  ],
  summary: [
    { plugin: 'analysis-ik', installedOn: ['es-node-1', 'es-node-2', 'es-node-3'], complete: true, count:  3 },
    { plugin: 'mapper-murmur3', installedOn: ['es-node-1', 'es-node-2'], complete: false, count: 2 },
    { plugin: 'ingest-attachment', installedOn: ['es-node-1', 'es-node-2', 'es-node-3'], complete: true, count: 3 },
    { plugin: 'repository-s3', installedOn: ['es-node-1', 'es-node-2', 'es-node-3'], complete: true, count: 3 },
  ],
};

/* 在途窗 deferred 桶（731 G104b 课：单 release 变量会被多 Promise 覆盖，按桶收集） */
let loadRes: Array<(v: any) => void> = [];
const relLoad = (v: any) => { loadRes.splice(0).forEach(r => r(v)); };

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  loadRes = [];
  ioRing.length = 0;
  pluginsMatrixFn.mockReset().mockResolvedValue(PLUGINS_OK);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

/* 双 QRT 定位：DOM 序第一个=矩阵表（plugins:matrix），第二个=raw 表（plugins:raw） */
function qrtOf(host: HTMLElement, i: number) { return host.querySelectorAll('.qrt-tbl')[i]; }

describe('741 A0 挂载不变量负锚（现状即守卫）', () => {
  it('title+双 QRT（矩阵 4 行/raw 11 行）+MetaStrip 四段+页头既有双钮+不一致红底行恒定', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('插件矩阵');
    const btns = host.querySelectorAll('button');
    expect(Array.from(btns).some(b => /重新加载/.test(b.textContent || '')), '重新加载钮在场').toBe(true);
    expect(Array.from(btns).some(b => /安装指南/.test(b.textContent || '')), '安装指南钮在场').toBe(true);
    /* MetaStrip 四段：节点/插件/不一致（warn）+「⚠ 插件未全节点装齐」warn 段 */
    expect(host.querySelectorAll('.pl-strip .ms-i').length, 'MetaStrip 四段').toBe(4);
    const mx = qrtOf(host, 0);
    const raw = qrtOf(host, 1);
    expect(mx.querySelectorAll('tbody tr').length, '矩阵 4 行（一插件一行）').toBe(4);
    expect(raw.querySelectorAll('tbody tr').length, 'raw 11 行（3 节点×4 插件−1 缺装）').toBe(11);
    /* 不一致红底行=恰 1 行（mapper-murmur3）——rowClass 契约既有守卫 */
    expect(mx.querySelectorAll('tbody tr.pl-mx-incomp').length, '红底行恰 1').toBe(1);
    expect(host.textContent).toContain('⚠ 缺 1 台');
  });
});

describe('741 G147 页头刷新钮在途窗 spinning（铁律 D·737 G132 同族）', () => {
  it('二拉在途窗 disabled（既有）+spinning（G147 病灶：修前零）；完成复常；期间已加载矩阵不移除（状态不重置）', async () => {
    const host = await mountView();
    expect(qrtOf(host, 0).querySelectorAll('tbody tr').length, '首拉已呈现矩阵').toBe(4);
    pluginsMatrixFn.mockImplementation(() => new Promise<any>(res => { loadRes.push(res); }));
    const reload = findBtn(host, /重新加载/);
    reload.click();
    await settle(4);
    expect(reload.disabled, '防重入既有').toBe(true);
    expect(reload.querySelector('.spinning'), 'G147 病灶：在途窗零 spinning').toBeTruthy();
    /* busy && available（首拉已成功）→骨架屏分支不接管，已加载矩阵保留（D1 刷新链既有负锚） */
    expect(qrtOf(host, 0).querySelectorAll('tbody tr').length, '在途窗矩阵不移除').toBe(4);
    relLoad(PLUGINS_OK);
    await settle();
    expect(reload.disabled, '完成复常').toBe(false);
    expect(reload.querySelector('.spinning')).toBeNull();
  });

  it('空态重拉走骨架屏顶替（busy && !available 分支既有守卫）——空态钮语义完整见源码锁', async () => {
    pluginsMatrixFn.mockResolvedValueOnce({ ...PLUGINS_OK, available: false, reason: 'ES 7.10 API 边界：只读探针超时' });
    const host = await mountView();
    expect(host.querySelector('.pl-loading'), '空态挂载完成').toBeNull();
    expect(host.textContent).toContain('ES 7.10 API 边界：只读探针超时');
    pluginsMatrixFn.mockImplementation(() => new Promise<any>(res => { loadRes.push(res); }));
    findBtn(host, /重新加载/).click();
    await settle(4);
    expect(host.querySelector('.pl-loading'), '空态重拉=骨架屏顶替（R45 §1 既有）').toBeTruthy();
    relLoad({ ...PLUGINS_OK, available: false, reason: 'ES 7.10 API 边界：只读探针超时' });
    await settle();
    expect(host.querySelector('.pl-loading'), '完成后骨架移除').toBeNull();
  });
});

describe('741 G148 RawIo 原始 IO 三件套（铁律 F·头号；Slm D6 同款）', () => {
  it('无记录判空：点钮不开空弹窗（toast 引导先执行一次操作）', async () => {
    const host = await mountView();
    expect(ioRing.length, '记录环空').toBe(0);
    findBtn(host, /原始IO/).click();
    await settle(4);
    expect(host.querySelector('.rim'), 'G148 病灶前：钮不存在必先红；修后判空不开空弹窗').toBeNull();
  });

  it('有记录：点钮开 RawIoModal——.rim 在场+请求 URL 含 /cluster/plugins', async () => {
    const host = await mountView();
    ioRing.push({ id: 1, ts: Date.now(), method: 'GET', url: '/宿主/api/cluster/plugins', requestBody: '', status: 200, ok: true, durationMs: 42, responseRaw: JSON.stringify(PLUGINS_OK) });
    findBtn(host, /原始IO/).click();
    await settle(4);
    /* RawIoModal 壳=ModalShell，teleport to body——.rim 在 body 上不在 host 内 */
    const rim = document.body.querySelector('.rim');
    expect(rim, 'G148 病灶：RawIo 入口缺，修后弹窗开').toBeTruthy();
    expect(rim!.textContent).toContain('/cluster/plugins');
    expect(rim!.querySelectorAll('.monaco-stub').length, '请求/响应两分节 Monaco').toBeGreaterThanOrEqual(2);
  });
});

describe('741 G149 列头中文语义 tip（铁律 F·717 G60 双语同款；colTips 内核通道）', () => {
  it('raw 表四列 th title 各含中文语义+内建排序提示保留；可见文本零泄漏', async () => {
    const host = await mountView();
    const raw = qrtOf(host, 1);
    const tips: Record<string, string> = {
      node: '安装该插件的 ES 节点名',
      component: '插件组件名',
      version: '插件版本',
      description: '插件用途描述',
    };
    for (const [col, tip] of Object.entries(tips)) {
      const th = raw.querySelector(`th[data-col="${col}"]`);
      expect(th, `raw 列 ${col} 表头在场`).toBeTruthy();
      expect(th!.getAttribute('title'), `G149 病灶：${col} 列无中文语义 tip`).toContain(tip);
      expect(th!.getAttribute('title'), '内建排序/列管理提示保留（不回归）').toContain('右键：列管理');
    }
    /* tip 走 :title 悬停通道，不进可见文本（可见面零泄漏） */
    for (const tip of Object.values(tips)) {
      expect(host.textContent, `tip 不进可见文本：${tip}`).not.toContain(tip);
    }
  });

  it('矩阵「插件」列 th title 含中文语义（同族顺带）；节点列缺省对照（无 tip=纯内建提示）', async () => {
    const host = await mountView();
    const mx = qrtOf(host, 0);
    const thPlug = mx.querySelector('th[data-col="插件"]');
    expect(thPlug, '矩阵插件列头在场').toBeTruthy();
    expect(thPlug!.getAttribute('title'), 'G149 同族：插件列中文语义 tip').toContain('按 component 汇总');
    const thNode = mx.querySelector('th[data-col="es-node-1"]');
    expect(thNode, '节点列头在场').toBeTruthy();
    expect(thNode!.getAttribute('title'), '缺省对照：未传 tip 的列=纯内建提示').not.toContain('汇总');
    expect(thNode!.getAttribute('title')).toContain('右键：列管理');
  });
});

describe('741 G150 指南弹窗 aria 最小刀（569 ModalShell 约定的壳契约三行）', () => {
  it('空开：.pl-mo-b role=dialog+aria-modal=true+aria-label=插件安装指南；关钮 aria-label', async () => {
    const host = await mountView();
    findBtn(host, /安装指南/).click();
    await settle(4);
    const body = host.querySelector('.pl-mo-b');
    expect(body, '指南弹窗开').toBeTruthy();
    expect(body!.getAttribute('role'), 'G150 病灶：role 缺').toBe('dialog');
    expect(body!.getAttribute('aria-modal'), 'G150 病灶：aria-modal 缺').toBe('true');
    expect(body!.getAttribute('aria-label')).toBe('插件安装指南');
    const close = body!.querySelector('.pl-close');
    expect(close, '关钮在场').toBeTruthy();
    expect(close!.getAttribute('aria-label'), 'G150 病灶：关钮无 aria-label').toBe('关闭安装指南');
  });

  it('带名档：行菜单指南打开后 aria-label 含插件名（n 档 pill 同源语义）', async () => {
    const host = await mountView();
    /* 行尾「安装/卸载」钮点开菜单→「安装/卸载指南」项（openGuide 带名路径） */
    const rowBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => /安装\/卸载/.test(collapse(b.textContent)));
    expect(rowBtn, '行尾安装/卸载钮在场').toBeTruthy();
    rowBtn!.click();
    await settle(4);
    /* CellContextMenu teleport to body——菜单项在 body 上（.ccm-it），不在 host 内 */
    const guideItem = Array.from(document.body.querySelectorAll('.ccm-it'))
      .find(el => /安装\/卸载指南/.test(el.textContent || ''));
    expect(guideItem, '菜单项在场（CellContextMenu）').toBeTruthy();
    (guideItem as HTMLElement).click();
    await settle(4);
    const body = host.querySelector('.pl-mo-b');
    expect(body, '指南弹窗开').toBeTruthy();
    /* 行序首行插件即可（带名档形态=「插件名 · 插件安装指南」，非空名+固定尾段） */
    expect(body!.getAttribute('aria-label'), '带名档含插件名').toMatch(/^[^·]+ · 插件安装指南$/);
    expect(body!.getAttribute('aria-label')).not.toBe('插件安装指南');
  });
});

describe('741 源码锁（四刀字面锚）', () => {
  it('G147 两钮 spinning / G148 三件套 / G149 colTips 接线 / G150 aria 字面', () => {
    const v = read('../views/PluginsView.vue');
    /* G147：页头+空态两钮 RefreshCw spinning（busy 语义同源） */
    expect((v.match(/:class="\{ spinning: busy \}"/g) || []).length, '两钮 spinning 字面').toBe(2);
    /* G148：RawIo 三件套（组件挂载+判空引导+路径子串） */
    expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
    expect(v).toMatch(/<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" \/>/);
    expect(v).toContain("ioRecorder.last('/cluster/plugins')");
    expect(v).toContain('暂无原始 IO 记录');
    /* G149：raw 表+矩阵表 colTips 接线（英文列名与导出表头同源口径不动） */
    expect(v).toContain("const RAW_COLS = ['node', 'component', 'version', 'description'];");
    expect(v).toMatch(/:col-tips="RAW_COL_TIPS"/);
    expect(v).toMatch(/:col-tips="MX_COL_TIPS"/);
    /* G150：aria 最小刀字面 */
    expect(v).toMatch(/role="dialog"/);
    expect(v).toMatch(/aria-modal="true"/);
    expect(v).toContain('关闭安装指南');
  });
});
