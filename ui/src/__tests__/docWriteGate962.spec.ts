/**
 * 九百六十二批：文档写链权限门收口（用户实报「没权限的人不能点击编辑保存」核实证伪）。
 *
 * 矿相（全站权限面系统扫描结论·文档写档四端点五调用点）：canWrite 能力档两页早已
 * 定义（DslQueryView:710 /cluster/doc 形态+IndexHubView:803 update-partial 形态）
 * 且新文档入口钮/行内单元格编辑/Ctrl+S 提示文案都已消费——但文档抽屉的保存/克隆/
 * 写入三钮与 saveDoc/saveNewDoc 两执行体从未接线：VIEWER 打开抽屉→编辑→保存
 * （或 Ctrl+S/Enter 通道）→ updateDocument/putDoc 照发，防线只剩后端 403——
 * 与 IndexHub ops 区页内立法「不再给会 403 的按钮」直接冲突（863-C2 同域两口径）。
 * 真机实证（962 开工探针）：VIEWER 保存钮在场可点，点击后写请求真实离场。
 *
 * 修法（镜像 DiffEditorView:217 仓内范本）：三钮补 v-if="canWrite"（新建弹窗写入钮/
 * 抽屉保存钮/克隆钮+IndexHub 抽屉保存钮）+两执行体首行 canWrite 早退报真
 * （「当前身份无文档写权限」，937 Templates 句式）——执行体收口使 Ctrl+S/Enter/
 * 深链等一切旁路通道天然受门（933-C1 通道覆盖律）。
 *
 * 驱动方式照 templateSaveGate937/dqGateRace946（视图全真 + 只 mock ../api 出口 +
 * Monaco stub + memory router；身份经 pinia auth.me 直赋，同挂载内翻转 VIEWER↔ADMIN）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* ---- 网络出口 mock（视图/组件全真） ---- */
const updateDocumentFn = vi.fn();
const putDocFn = vi.fn();
const updPending: { res: (v: any) => void }[] = [];
const putPending: { res: (v: any) => void }[] = [];

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      updateDocument: (...args: any[]) => updateDocumentFn(...args),
      putDoc: (...args: any[]) => putDocFn(...args),
      /* 挂载链防御性 stub 挡真实 fetch 噪音（qualityThreeState 同款） */
      clusterIndices: vi.fn(async () => [{ index: 'idx-a', health: 'green', status: 'open' }]),
      mappingDetail: vi.fn(async () => ({ raw: { properties: {} } })),
      clusterHealth: vi.fn(async () => ({})),
      overview: vi.fn(async () => ({})),
      nodesStatsBrief: vi.fn(async () => []),
      aliases: vi.fn(async () => []),
      searchDsl: vi.fn(async () => ({ took: 1, hits: { total: { value: 0 }, hits: [] } })),
    },
  };
});

/* Monaco 内核 jsdom 不可用——stub 静态占位（templateSaveGate937 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import DslQueryView from '../views/DslQueryView.vue';
import IndexHubView from '../views/IndexHubView.vue';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(view: any, hash: string) {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(view as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, pinia };
}

function setState(host: HTMLElement, apply: (st: any) => void): any {
  for (const el of host.querySelectorAll('*')) {
    const st = (el as any).__vueParentComponent?.setupState;
    if (st && typeof st.openDoc === 'function' && st.docOpen !== undefined && st.docEditMode !== undefined) {
      apply(st);
      return st;
    }
  }
  throw new Error('文档抽屉宿主组件未找到');
}

function setRole(pinia: any, role: 'VIEWER' | 'ADMIN') {
  useAuthStore(pinia).me = { username: 't', role, fallback: false, grantedPages: null };
}

function btnByText(scope: ParentNode, re: RegExp): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => re.test((b.textContent || '').trim()));
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  updPending.length = 0;
  putPending.length = 0;
  updateDocumentFn.mockReset().mockImplementation(() => new Promise<any>((res) => { updPending.push({ res }); }));
  putDocFn.mockReset().mockImplementation(() => new Promise<any>((res) => { putPending.push({ res }); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

const HIT = { _id: 'doc-1', _index: 'idx-a', _score: 1, _source: { v: 1 } };

describe('962 DslQueryView 文档写链权限门', () => {
  it('A VIEWER：抽屉编辑态保存/克隆钮缺席（闸前=矿红证）', async () => {
    const { host, pinia } = await mountView(DslQueryView, '#/search');
    setRole(pinia, 'VIEWER');
    await settle(2);
    setState(host, st => st.openDoc(HIT, true));
    await settle();
    expect(btnByText(document.body, /全量覆盖/), 'VIEWER 保存钮必须缺席').toBeUndefined();
    expect(btnByText(document.body, /^克隆/), 'VIEWER 克隆钮必须缺席').toBeUndefined();
  });

  it('B VIEWER：saveDoc 执行体直调零写+报真（Ctrl+S 旁路通道覆盖证·闸前=矿红证）', async () => {
    const { host, pinia } = await mountView(DslQueryView, '#/search');
    setRole(pinia, 'VIEWER');
    await settle(2);
    let st: any;
    setState(host, s => { st = s; s.openDoc(HIT, true); s.docEditText = '{"v":2}'; });
    await settle();
    const notifySpy = vi.spyOn(useAppStore(pinia), 'notify');
    await st.saveDoc();
    await settle(4);
    expect(updateDocumentFn, 'VIEWER 直调 saveDoc 不得发出写请求').toHaveBeenCalledTimes(0);
    expect(notifySpy, '报真：身份无文档写权限').toHaveBeenCalledWith('error', '当前身份无文档写权限');
    notifySpy.mockRestore();
  });

  it('C ADMIN：保存链通（防过禁守卫）', async () => {
    const { host, pinia } = await mountView(DslQueryView, '#/search');
    setRole(pinia, 'ADMIN');
    await settle(2);
    setState(host, st => { st.openDoc(HIT, true); st.docEditText = '{"v":2}'; });
    await settle();
    const saveBtn = btnByText(document.body, /全量覆盖/);
    expect(saveBtn, 'ADMIN 保存钮必须在场').toBeTruthy();
    saveBtn!.click();
    await settle(4);
    expect(updateDocumentFn).toHaveBeenCalledTimes(1);
    updPending.splice(0).forEach(r => r.res({}));
    await settle(4);
  });

  it('D VIEWER：新建弹窗写入钮缺席+saveNewDoc 直调零写（Enter 旁路通道覆盖证·闸前=矿红证）', async () => {
    const { host, pinia } = await mountView(DslQueryView, '#/search');
    setRole(pinia, 'VIEWER');
    await settle(2);
    let st: any;
    setState(host, s => { st = s; s.openNewDoc(); s.newDocText = '{"v":1}'; });
    await settle();
    expect(btnByText(document.body, /写入文档/), 'VIEWER 写入钮必须缺席').toBeUndefined();
    await st.saveNewDoc();
    await settle(4);
    expect(putDocFn, 'VIEWER 直调 saveNewDoc 不得发出写请求').toHaveBeenCalledTimes(0);
  });

  it('E ADMIN：新建写入链通（防过禁守卫）', async () => {
    const { host, pinia } = await mountView(DslQueryView, '#/search');
    setRole(pinia, 'ADMIN');
    await settle(2);
    setState(host, st => { st.openNewDoc(); st.newDocText = '{"v":1}'; });
    await settle();
    const putBtn = btnByText(document.body, /写入文档/);
    expect(putBtn, 'ADMIN 写入钮必须在场').toBeTruthy();
    putBtn!.click();
    await settle(4);
    expect(putDocFn).toHaveBeenCalledTimes(1);
    putPending.splice(0).forEach(r => r.res({}));
    await settle(4);
  });
});

describe('962 IndexHubView 文档写链权限门', () => {
  it('F VIEWER：抽屉编辑态保存钮缺席（闸前=矿红证）', async () => {
    const { host, pinia } = await mountView(IndexHubView, '#/indices');
    setRole(pinia, 'VIEWER');
    await settle(2);
    setState(host, st => { st.store.pickedIdx = 'idx-a'; st.openDoc(HIT, true); });
    await settle();
    expect(btnByText(document.body, /全量覆盖/), 'VIEWER 保存钮必须缺席').toBeUndefined();
  });

  it('G VIEWER：saveDoc 执行体直调零写（Ctrl+S 旁路通道覆盖证·闸前=矿红证）', async () => {
    const { host, pinia } = await mountView(IndexHubView, '#/indices');
    setRole(pinia, 'VIEWER');
    await settle(2);
    let st: any;
    setState(host, s => { st = s; s.store.pickedIdx = 'idx-a'; s.openDoc(HIT, true); s.docEditText = '{"v":2}'; });
    await settle();
    const notifySpy = vi.spyOn(useAppStore(pinia), 'notify');
    await st.saveDoc();
    await settle(4);
    expect(updateDocumentFn, 'VIEWER 直调 saveDoc 不得发出写请求').toHaveBeenCalledTimes(0);
    expect(notifySpy, '报真：身份无文档写权限').toHaveBeenCalledWith('error', '当前身份无文档写权限');
    notifySpy.mockRestore();
  });

  it('H ADMIN：保存链通（防过禁守卫）', async () => {
    const { host, pinia } = await mountView(IndexHubView, '#/indices');
    setRole(pinia, 'ADMIN');
    await settle(2);
    setState(host, st => { st.store.pickedIdx = 'idx-a'; st.openDoc(HIT, true); st.docEditText = '{"v":2}'; });
    await settle();
    const saveBtn = btnByText(document.body, /全量覆盖/);
    expect(saveBtn, 'ADMIN 保存钮必须在场').toBeTruthy();
    saveBtn!.click();
    await settle(4);
    expect(updateDocumentFn).toHaveBeenCalledTimes(1);
    updPending.splice(0).forEach(r => r.res({}));
    await settle(4);
  });
});
