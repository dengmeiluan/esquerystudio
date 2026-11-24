/**
 * 五百二十九批 W-B（§6q 遗留）：QueryHubView replay 补 template 分支——跨模式查询历史里
 * mode='template' 条目（313 批 SearchTemplatesView run() 写入）此前「看得见点不动」
 * （QUERY_MODES 无 template 键，mode.value 赋它被 normalizeMode 静默回落 dsl）。
 *
 * 形态：照 dsl.carry 同款 sessionStorage 一次性通道（favReplay bulk.carry/ubq.carry 跨页
 * 同构）——replay 写 esquerystudio.search-templates.carry → router.push('/search-templates')
 * → 提前 return（不入 mode 切换，URL 不被污染）；接收端 SearchTemplatesView onMounted
 * 消费（读走即删）只做「预填 source 草稿」，play/run 行为由页内既有防呆承担
 * （528 批 histEntry528 双形态裁决：模板源快照可回填执行、渲染产物无法逆向——如实预填
 * + toast 明示形态，不静默假装）。
 *
 * 契约锁：
 * ① 源码锁：QueryHubView template 分支（carry 键 + push + return）与接收端（onMounted 消费）；
 * ② 行为锁（QueryHub 挂载）：play 一条 template 条目 → carry 键写入 + 跳 /search-templates
 *    + 索引上下文 store.pick 跟随 + mode 不被污染（dsl 模式钮仍 on）；
 * ③ 行为锁（SearchTemplates 挂载）：carry=模板源快照（含 {{}}）→ source 草稿回填+键消费即删
 *    +模板源档 toast；carry=渲染产物（纯 JSON）→ 如实预填+渲染产物档 toast；
 * ④ 无 carry 挂载零扰动（不 notify，source 维持默认模板）。
 * 姊妹锁不变：tplHist313（push 签名）/histEntry528（页内历史面板双形态裁决）零触碰。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';

/* MonacoEditor stub：回显 modelValue（source 草稿回填断言锚） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) {
      return () => h('div', { class: 'monaco-stub', 'data-height': props.height }, String(props.modelValue ?? ''));
    },
  }),
}));

/* QueryHubView 默认挂 dsl 模式（defineAsyncComponent）——stub 掉避免 Monaco 编辑器进测试进程 */
vi.mock('../views/DslQueryView.vue', () => ({
  __esModule: true,
  default: defineComponent({ name: 'DslStub', template: '<div />' }),
}));

/* 弹层组件（NPopover/NDrawer/NDrawerContent/NModal）的定位/teleport 非测试目标：
   show=true 直渲染、false 不渲染（histEntry528 NModal stub 同手法；NPopover 照
   fieldPickerPenetration trigger/content 形态） */
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  const inline = (name: string) => defineComponent({
    name,
    props: { show: { type: Boolean, default: false } },
    emits: ['update:show'],
    setup(props: any, { slots }: any) {
      return () => (props.show ? h('div', { class: name.toLowerCase() + '-stub' }, slots.default ? slots.default() : []) : null);
    },
  });
  return {
    ...actual,
    NPopover: defineComponent({
      name: 'NPopover',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props: any, { slots, emit }: any) {
        return () => h('div', { class: 'npopover-stub' }, [
          h('div', { class: 'np-trigger', onClick: () => emit('update:show', !props.show) }, slots.trigger ? slots.trigger() : []),
          props.show ? h('div', { class: 'np-content' }, slots.default ? slots.default() : []) : null,
        ]);
      },
    }),
    NDrawer: inline('NDrawer'),
    NDrawerContent: defineComponent({ name: 'NDrawerContent', props: { title: { type: String, default: '' } }, setup: (_p: any, { slots }: any) => () => h('div', slots.default ? slots.default() : []) }),
    NModal: inline('NModal'),
  };
});

const listStoredScriptsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      listStoredScripts: (...a: any[]) => listStoredScriptsFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（QueryHub FieldPicker/模板中心 load/store 初始化） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { useAppStore } = await import('../stores/app');
  const store = useAppStore(pinia);
  /* notify 必须在挂载前 spy：接收端 consumeSourceCarry 在 onMounted（mountView 内）即消费 */
  const notify = vi.spyOn(store, 'notify');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', component: { template: '<div/>' } },
      { path: '/search-templates', component: { template: '<div/>' } },
    ],
  });
  await router.push('/search');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await settle();
  await wait(10);
  await settle();
  return { host, store, notify, router, unmount: () => app.unmount() };
}

function seedHist(items: Array<Partial<{ id: string; mode: string; query: string; index: string; ts: number }>>) {
  localStorage.setItem('es_query_hist_v2', JSON.stringify(
    items.map((it, i) => ({ id: it.id ?? 'qh-' + i, mode: it.mode, query: it.query, index: it.index, ts: it.ts ?? 1700000000000 + i })),
  ));
}
function textBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  listStoredScriptsFn.mockReset().mockResolvedValue({ scripts: {} });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

/* ═══ ① 源码锁（改通道键名/落点必须在此同步更新） ═══ */
describe('529 W-B 源码锁：replay template 分支与接收口', () => {
  it('QueryHubView：template 分支=一次性 carry + 跨页 push + 提前 return', () => {
    const v = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
    expect(v).toMatch(/m === 'template'/);
    expect(v).toMatch(/writeStoredRaw\(sessionStorage, 'esquerystudio\.search-templates\.carry', it\.query \|\| ''\)/);
    expect(v).toMatch(/router\.push\('\/search-templates'\)/);
    expect(v).toMatch(/esquerystudio\.search-templates\.carry', it\.query \|\| ''\);\s*if \(idx\) store\.pick\(idx\);[\s\S]*?return;/);
  });
  it('SearchTemplatesView：接收端 onMounted 消费（读走即删），只预填 source 草稿', () => {
    const v = readFileSync(join(__dirname, '../views/SearchTemplatesView.vue'), 'utf-8');
    expect(v).toMatch(/const ST_SOURCE_CARRY = 'esquerystudio\.search-templates\.carry';/);
    expect(v).toMatch(/removeStoredRaw\(sessionStorage, ST_SOURCE_CARRY\)/);
    expect(v).toMatch(/source\.value = prettify\(raw\);/);
    expect(v).toMatch(/onMounted\(consumeSourceCarry\)/);
    /* 313 批 push 签名 / 528 批页内双形态裁决零触碰（姊妹锁原样在位） */
    expect(v).toMatch(/useQueryHistoryStore\(\)\.push\('template', rendered\.value \|\| source\.value, index\.value/);
    expect(v).toMatch(/async function replayTplRow\(row: \{ query: string \}, runIt: boolean\)/);
  });
});

/* ═══ ② 行为锁：QueryHub replay template 条目（挂载） ═══ */
describe('529 W-B QueryHub replay template 分支（挂载行为）', () => {
  it('play template 条目 → carry 写入 + 跳 /search-templates + 上下文跟随 + mode 不被污染', async () => {
    seedHist([
      { id: 'a', mode: 'template', query: '{"query":{"match":{"bond_id":"{{bondId}}"}}}', index: 'tpl_idx' },
      { id: 'b', mode: 'dsl', query: '{"match_all":{}}' },
    ]);
    const QueryHubView = (await import('../views/QueryHubView.vue')).default;
    const { host, store, router, unmount } = await mountView(QueryHubView);
    /* 开跨模式历史抽屉（NDrawer stub 直渲染），两条历史都在面板里 */
    textBtn(host, '历史')!.click();
    await settle();
    const items = host.querySelectorAll('.ndrawer-stub .qhp-item');
    expect(items.length).toBe(2);
    /* play 第一条（template） */
    const playBtn = [...items[0].querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === '回放/执行')!;
    expect(playBtn, 'template 条目 play 钮必须在（此前看得见点不动）').toBeTruthy();
    playBtn.click();
    await settle();
    await wait(20); /* router.push 导航微任务链完成（histEntry528 wait 同款） */
    await settle();
    expect(sessionStorage.getItem('esquerystudio.search-templates.carry')).toBe('{"query":{"match":{"bond_id":"{{bondId}}"}}}');
    expect(router.currentRoute.value.path, '跨页跳搜索模板中心').toBe('/search-templates');
    expect(store.pickedIdx, '索引上下文跟随（sql/sandbox/pit 分支同款）').toBe('tpl_idx');
    expect(router.currentRoute.value.query.mode, 'mode 不被 template 污染（提前 return）').toBeUndefined();
    expect(sessionStorage.getItem('esquerystudio.dsl.carry'), '不误走 dsl 分支').toBeNull();
    unmount();
  });
});

/* ═══ ③④ 接收端：SearchTemplatesView source 草稿预填（挂载行为） ═══ */
describe('529 W-B SearchTemplatesView 接收口（挂载行为）', () => {
  it('carry=模板源快照（含 {{}}）→ source 草稿回填 + 键消费即删 + 模板源档 toast', async () => {
    sessionStorage.setItem('esquerystudio.search-templates.carry', '{"size":"{{size}}","query":{"match":{"{{field}}":"{{keyword}}"}}}');
    const SearchTemplatesView = (await import('../views/SearchTemplatesView.vue')).default;
    const { host, notify, unmount } = await mountView(SearchTemplatesView);
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('{{keyword}}');
    expect(sessionStorage.getItem('esquerystudio.search-templates.carry'), '一次性通道读走即删').toBeNull();
    expect(notify).toHaveBeenCalledWith('success', expect.stringContaining('已从查询历史回填模板源'));
    unmount();
  });

  it('carry=渲染产物（纯 JSON）→ 如实预填 + 渲染产物档 toast（不静默假装模板源还原）', async () => {
    sessionStorage.setItem('esquerystudio.search-templates.carry', '{"size":10,"query":{"match_all":{}}}');
    const SearchTemplatesView = (await import('../views/SearchTemplatesView.vue')).default;
    const { host, notify, unmount } = await mountView(SearchTemplatesView);
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('"match_all"');
    expect(sessionStorage.getItem('esquerystudio.search-templates.carry')).toBeNull();
    expect(notify).toHaveBeenCalledWith('success', expect.stringContaining('渲染产物'));
    unmount();
  });

  it('无 carry 挂载零扰动：source 维持默认模板，不 notify', async () => {
    const SearchTemplatesView = (await import('../views/SearchTemplatesView.vue')).default;
    const { host, notify, unmount } = await mountView(SearchTemplatesView);
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('{{size}}');
    expect(notify).not.toHaveBeenCalled();
    unmount();
  });
});
