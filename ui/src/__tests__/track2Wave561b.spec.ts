/**
 * 五百六十一批 B2（轨2 四页重造之 DevTools/AdhocRebuild/Xmigrate）：
 *  ① DT 历史「回放到新 Tab」——QueryHistoryPanel 可选 'newtab' 行级 action（'curl' 552 先例：
 *     行级仅 emit，新 Tab 组装+激活跳转归宿主 histNewTab）；缺省不传不渲染（queryHistoryPanel
 *     「未配置按钮不渲染」口径零破坏）；DevToolsView 面板用法传 newtab。
 *  ② DT 请求体「插入字段」钮——insertSnippet expose 全站首消费（MonacoEditor.vue 黑名单只调用）；
 *     n-popover 内嵌 FieldPicker（:to="false"，QueryHubView 场景任务先例）；_bulk 档禁用。
 *  ③ AR 手动模式「拉取源配置」——显式用户动作 + askConfirm 确认覆盖；拉取优先吃向导步骤①
 *     已探测的 prep 快照（零网络），缺探测现场 api.clusterInspect 补拉；pretty 后填入两框。
 *  ④ Xm 行菜单「以此作业新建迁移」——job doc 自持 sourceIndex/destIndex/remoteEndpoint 回填，
 *     策略字段不自持置默认 + toast 说明；只增项不改既有项（xmigrateRowMenu 字面锁零触）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── QHP 挂载面：对齐 queryHistoryPanel.spec 既有 harness（useRoute mock + api mock）；
   视图挂载用真 createRouter——部分 mock 保全量导出，仅替换组合式 API。mockRoute 为共享
   可变对象（视图读 route.query.xxx 需要字段在场，adhocRebuildView:2019 watch 先例） ── */
const mockRoute = vi.hoisted(() => ({ path: '/devtools', query: {} as Record<string, unknown> }));
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useRoute: () => mockRoute,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  };
});

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      adhoc: { ...orig.api.adhoc, jobs: mocksX.adhocJobs, status: mocksX.adhocStatus, prepare: mocksX.adhocPrepare },
      clusterInspect: mocksX.clusterInspect,
      xb: { ...orig.api.xb, jobs: mocksX.xbJobs, destIndices: async () => [] },
    },
  };
});

/* hoisted mock 面（api mock 工厂与视图挂载共用） */
const mocksX = vi.hoisted(() => ({
  adhocJobs: vi.fn(),
  adhocStatus: vi.fn(),
  adhocPrepare: vi.fn(),
  clusterInspect: vi.fn(),
  xbJobs: vi.fn(),
}));

/* MonacoEditor 组件 stub：捕获 props（AR 两框 modelValue 断言走此入档） */
const monacoCaps: { props: any }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) { monacoCaps.push({ props }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import { resolveConfirm } from '../composables/confirm';
import { ioRecorder } from '../api';
import { useAppStore } from '../stores/app';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

const ITEMS = [
  { id: 'a', query: 'GET idx/_search', method: 'GET', path: '/idx/_search', body: '{"q":1}', ts: Date.now() - 1000 },
  { id: 'b', query: 'PUT other', method: 'PUT', path: '/other', body: '', ts: Date.now() - 2000 },
];

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

type Emitted = Record<string, unknown[][]>;
async function mountPanel(props: Record<string, any> = {}) {
  const emitted: Emitted = {};
  const app = createApp({
    setup() {
      const store = useAppStore();
      void store;
      return () => h(QueryHistoryPanel as any, {
        items: ITEMS,
        actions: ['play', 'copy'],
        clearable: true,
        importable: false,
        onPlay: (it: unknown) => (emitted.play = [...(emitted.play || []), [it]]),
        onNewtab: (it: unknown) => (emitted.newtab = [...(emitted.newtab || []), [it]]),
        ...props,
      }, undefined);
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return emitted;
}

async function mountView(View: any) {
  mockRoute.path = '/'; mockRoute.query = {};
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/adhoc', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(View) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const h2 = document.createElement('div');
  document.body.appendChild(h2);
  app.mount(h2);
  apps.push(app);
  await settle();
  return { app, host: h2, store: useAppStore(pinia) };
}

const click = async (el: Element | null | undefined) => {
  (el as HTMLElement)?.click();
  await settle();
};

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.appendChild(host);
  localStorage.clear();
  sessionStorage.clear();
  mockRoute.path = '/devtools'; mockRoute.query = {};
  monacoCaps.length = 0;
  ioRecorder.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  mocksX.adhocJobs.mockReset().mockResolvedValue([]);
  mocksX.adhocStatus.mockReset().mockResolvedValue({});
  mocksX.adhocPrepare.mockReset().mockResolvedValue({});
  mocksX.clusterInspect.mockReset().mockResolvedValue({});
  mocksX.xbJobs.mockReset().mockResolvedValue([]);
});

const q = (sel: string) => host.querySelector(sel);
const qa = (sel: string) => Array.from(host.querySelectorAll(sel));

/* ═══ ① QueryHistoryPanel newtab 行级钮 ═══ */
describe('561b ①：QueryHistoryPanel 可选 newtab（缺省不渲染 / 传参渲染+emit）', () => {
  it('缺省不传 newtab：行级钮不渲染（queryHistoryPanel「未配置按钮不渲染」口径零破坏）', async () => {
    await mountPanel();
    expect(qa('.qhp-acts .btn').some(b => b.getAttribute('title') === '回放到新 Tab')).toBe(false);
    expect(qa('.qhp-acts .btn').some(b => b.getAttribute('aria-label') === '回放到新 Tab')).toBe(false);
  });

  it("传 actions 含 'newtab'：每行出钮，点击 emit('newtab', 行条目)", async () => {
    const emitted = await mountPanel({ actions: ['play', 'copy', 'newtab'] });
    const btns = qa('.qhp-acts .btn').filter(b => b.getAttribute('aria-label') === '回放到新 Tab');
    expect(btns.length).toBe(2);
    (btns[0] as HTMLElement).click();
    await nextTick();
    expect((emitted.newtab || []).length).toBe(1);
    expect((emitted.newtab![0] as any[])[0]).toMatchObject({ method: 'GET', path: '/idx/_search' });
  });
});

/* ═══ ① DevToolsView 宿主接线（源锚） ═══ */
describe('561b ①：DevToolsView 面板传 newtab + histNewTab 落新 Tab', () => {
  const dt = read('../views/DevToolsView.vue');
  it("面板 actions 窄集加 'newtab'（七动作形）+ @newtab=histNewTab 接线", () => {
    expect(dt).toContain(":actions=\"['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']\"");
    expect(dt).toContain('@newtab="histNewTab"');
  });
  it('histNewTab=mkTab(method/path/body) + 激活跳转 + persist（mkTab/consumePrefill 先例）', () => {
    expect(dt).toMatch(/function histNewTab\(h: any\) \{[\s\S]*?mkTab\(/);
    expect(dt).toMatch(/histNewTab[\s\S]{0,300}active\.value = tabs\.value\.length - 1;/);
    expect(dt).toMatch(/histNewTab[\s\S]{0,400}persist\(\);/);
  });
});

/* ═══ ② DT 请求体「插入字段」钮 ═══ */
describe('561b ②：DevToolsView 插入字段钮（insertSnippet 全站首消费 + _bulk 档禁用）', () => {
  const dt = read('../views/DevToolsView.vue');
  it('请求工具行出钮：n-popover 内嵌 FieldPicker（:to="false"）', () => {
    expect(dt).toMatch(/aria-label="插入字段"/);
    expect(dt).toMatch(/<n-popover[^>]*:show="insFieldOpen"/);
    expect(dt).toMatch(/<FieldPicker[^>]*:to="false"/);
    expect(dt).toContain("import FieldPicker from '../components/FieldPicker.vue'");
  });
  it('_bulk 档（dtBodyKind=none）禁用 + title 说明；选中经 insertSnippet 在光标 executeEdits 插入', () => {
    expect(dt).toMatch(/:disabled="dtBodyKind === 'none'"/);
    expect(dt).toContain('_bulk');
    expect(dt).toMatch(/bodyMonacoRef\.value\?\.insertSnippet\?\./);
  });
});

/* ═══ ③ AR 手动模式「拉取源配置」 ═══ */
describe('561b ③：AR 手动模式拉取源配置（askConfirm 确认覆盖 + prep 优先 / clusterInspect 补拉）', () => {
  it('源锚：手动 hd 出钮（data-ar-pull-src）+ askConfirm 门 + 显式动作写入两框', () => {
    const ar = read('../views/AdhocRebuildView.vue');
    expect(ar).toContain('data-ar-pull-src');
    expect(ar).toMatch(/async function pullSourceToManual\(\) \{[\s\S]*?askConfirm\(/);
    expect(ar).toMatch(/manualSettings\.value = prettyJson\(/);
    expect(ar).toMatch(/manualMapping\.value = prettyJson\(/);
  });

  it('confirm 后写入两框：优先吃步骤①已探测 prep 快照（clusterInspect 零调用）', async () => {
    const { app, host: h2, store } = await mountView((await import('../views/AdhocRebuildView.vue')).default);
    store.pick('src_idx'); // 顶栏选中 → indexName 补空回填
    await settle(8);
    mocksX.adhocPrepare.mockResolvedValue({
      isAlias: true, sourcePhysical: 'src_idx_v1', docCount: 1,
      settingsJson: '{"index":{"number_of_shards":3}}',
      mappingJson: '{"properties":{"name":{"type":"keyword"}}}',
    });
    // 步骤①：显式点「探测」拿到快照（真实用户路径：先探测，再进手动模式）
    const probe = Array.from(h2.querySelectorAll('button')).find(b => b.textContent!.includes('探测'));
    await click(probe);
    await settle(8);
    expect(mocksX.adhocPrepare).toHaveBeenCalledWith('src_idx');
    // 切手动模式 → 拉取源配置 → 确认
    const tabs2 = h2.querySelectorAll('.ar-input-tabs button');
    await click(tabs2[1]);
    await click(h2.querySelector('[data-ar-pull-src]'));
    await settle(6);
    resolveConfirm(true);
    await settle(12);
    expect(mocksX.clusterInspect).not.toHaveBeenCalled();
    expect(monacoCaps.length).toBeGreaterThanOrEqual(2);
    const settingsText = monacoCaps[monacoCaps.length - 2].props.modelValue as string;
    const mappingText = monacoCaps[monacoCaps.length - 1].props.modelValue as string;
    expect(settingsText).toBe(JSON.stringify(JSON.parse('{"index":{"number_of_shards":3}}'), null, 2));
    expect(mappingText).toBe(JSON.stringify({ properties: { name: { type: 'keyword' } } }, null, 2));
    app.unmount();
  });

  it('取消不改两框：resolveConfirm(false) 后 manualSettings/manualMapping 保持原状', async () => {
    const { app, host: h2, store } = await mountView((await import('../views/AdhocRebuildView.vue')).default);
    store.pick('src_idx_keep');
    await settle(8);
    const tabs2 = h2.querySelectorAll('.ar-input-tabs button');
    await click(tabs2[1]);
    await click(h2.querySelector('[data-ar-pull-src]'));
    await settle(6);
    resolveConfirm(false);
    await settle(12);
    expect(mocksX.clusterInspect).not.toHaveBeenCalled();
    const cap = monacoCaps.find(c => String(c.props.modelValue || '').includes('number_of_shards'));
    expect(cap).toBeUndefined();
    app.unmount();
  });

  it('缺探测（prep 空）：confirm 后现场 clusterInspect 补拉并填入两框', async () => {
    mocksX.clusterInspect.mockResolvedValue({
      settings: { src_idx2: { 'index.number_of_shards': '5' } },
      mappings: { src_idx2: { properties: { title: { type: 'text' } } } },
    });
    const { app, host: h2, store } = await mountView((await import('../views/AdhocRebuildView.vue')).default);
    store.pick('src_idx2'); // 顶栏选中 → indexName 补空回填（prep 仍空：不点探测）
    await settle(12);
    const tabs2 = h2.querySelectorAll('.ar-input-tabs button');
    await click(tabs2[1]);
    await click(h2.querySelector('[data-ar-pull-src]'));
    await settle(6);
    resolveConfirm(true);
    await settle(12);
    expect(mocksX.clusterInspect).toHaveBeenCalledWith('src_idx2', 0);
    const capS = monacoCaps.find(c => String(c.props.modelValue || '').includes('number_of_shards'));
    const capM = monacoCaps.find(c => String(c.props.modelValue || '').includes('"title"'));
    expect(capS, 'settings 框已填').toBeTruthy();
    expect(capS!.props.modelValue).toContain('"index.number_of_shards": "5"');
    expect(capM, 'mapping 框已填').toBeTruthy();
    expect(capM!.props.modelValue).toContain('"type": "text"');
    app.unmount();
  });
});

/* ═══ ④ Xm 行菜单「以此作业新建迁移」 ═══ */
describe('561b ④：Xm 行菜单以此作业新建迁移（回填 step1 连接/源索引 + 目标索引）', () => {
  it('源锚：菜单只增项不改既有项（copy-id/copy-row 字面零触）+ 回填函数读 job 三字段', () => {
    const xm = read('../views/XmigrateView.vue');
    expect(xm).toContain("key: 'copy-id', label: '复制 jobId'");
    expect(xm).toContain("key: 'copy-row', label: '复制作业信息'");
    expect(xm).toContain("key: 'new-from-job', label: '以此作业新建迁移'");
    expect(xm).toMatch(/function newMigrationFromJob\(j: any\) \{/);
    expect(xm).toMatch(/newMigrationFromJob[\s\S]{0,800}j\.remoteEndpoint/);
    expect(xm).toMatch(/newMigrationFromJob[\s\S]{0,1000}XM_FORM_DEFAULT/);
    expect(xm).toMatch(/newMigrationFromJob[\s\S]{0,1400}formOpen\.value = true;/);
  });

  it('点菜单项：源/目标索引与连接回填表单 + 策略字段置默认', async () => {
    mocksX.xbJobs.mockResolvedValue([{
      jobId: 'j-561', status: 'DONE', sourceIndex: 'old_idx', destIndex: 'new_idx',
      remoteEndpoint: 'http://old-es.example:9200', migrated: 10, total: 10,
    }]);
    const { app, host: h2 } = await mountView((await import('../views/XmigrateView.vue')).default);
    // 收起表单再触发——「切回表单第一步」= formOpen 强制展开
    await click(h2.querySelector('.ph button.btn.sm.ghost'));
    expect(h2.querySelector('.xm-form'), '预置：表单已收起').toBeNull();
    await click(h2.querySelector('button[aria-label="作业行菜单"]'));
    // CellContextMenu teleport 到 body——菜单 DOM 在 document.body 下
    const item = Array.from(document.body.querySelectorAll('.ccm .ccm-it')).find(b => b.textContent!.includes('以此作业新建迁移'));
    expect(item, '菜单新项在场').toBeTruthy();
    await click(item);
    await settle(8);
    expect(h2.querySelector('.xm-form'), '表单已展开（回到第一步）').toBeTruthy();
    const idxInps = h2.querySelectorAll('.xm-idx-inp');
    const srcInp = idxInps[0] as HTMLInputElement;
    const dstInp = idxInps[1] as HTMLInputElement;
    expect(srcInp?.value).toBe('old_idx');
    expect(dstInp?.value).toBe('new_idx');
    const hostInp = h2.querySelector('input[placeholder^="host"]') as HTMLInputElement;
    expect(hostInp, '手动连接 host 已回填').toBeTruthy();
    expect(hostInp.value).toBe('old-es.example');
    app.unmount();
  });
});
