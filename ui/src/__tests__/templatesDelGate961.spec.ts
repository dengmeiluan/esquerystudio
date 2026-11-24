/**
 * 九百六十一批：TemplatesView 删除链在途重入闸 + 钮面在途反馈（真挂载行为锚四段）。
 *
 * 矿相（937 保存闸同族·删除面同页两口径）：del(t) 是确认+删除双窗执行体——
 * 确认窗（askConfirm await）与请求窗（deleteTemplate await）全程零互斥闸、
 * 钮面零 disabled：请求窗内重复点击行内删除钮 → del() 重入 → 确认窗叠开、
 * deleteTemplate 二发（第二条 404 → 「删除失败」error 噪声顶掉首条成功反馈）。
 * 同页 save() 有 saving 闸（937 立法）、SearchTemplatesView del() 有 busy 闸
 * ——同一动线两处两种口径。修法照 937-C1：闸收本体首行 + 置位前移到第一个
 * await（确认窗）之前 + try/finally 全包裹复位（取消/失败路径防闸死）+
 * 钮面 :disabled 在途反馈（恒在场 disabled 同语言）。
 *
 * 驱动方式照 templateSaveGate937（视图全真 + 只 mock ../api 网络出口 +
 * Monaco stub + 真确认服务 mock + memory router）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* ---- 网络出口 mock（视图/组件全真） ---- */
const templatesFn = vi.fn();
const deleteTemplateFn = vi.fn();
const tplPending: { res: (v: any) => void }[] = [];
const delPending: { res: (v: any) => void }[] = [];
const ioRing: any[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      templates: (...args: any[]) => templatesFn(...args),
      deleteTemplate: (...args: any[]) => deleteTemplateFn(...args),
      /* store/邻域防御性 stub 挡真实 fetch 噪音（qualityThreeState 同款） */
      putTemplate: vi.fn(async () => ({})),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));
const askConfirmFn = vi.fn();

/* Monaco 内核 jsdom 不可用——stub 静态占位（templateSaveGate937 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import TemplatesView from '../views/TemplatesView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  location.hash = '#/templates';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(TemplatesView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, pinia };
}

const TPL_961 = {
  legacy: false,
  index_templates: [
    { name: 'logs-tpl', index_template: { index_patterns: ['logs-*'], priority: 100, template: { settings: { number_of_shards: 1 } } } },
  ],
  component_templates: [],
};

function releaseTemplates(list: any[] = TPL_961.index_templates) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url: '/internal/es/index/cluster/templates', requestBody: '', status: 200, ok: true, durationMs: 4, responseRaw: JSON.stringify({ legacy: false, index_templates: list, component_templates: [] }) });
  tplPending.shift()!.res({ legacy: false, index_templates: list, component_templates: [] });
}
function releaseDel() { delPending.shift()!.res({}); }

function delBtn(host: ParentNode): HTMLButtonElement {
  const btn = host.querySelector<HTMLButtonElement>('button[aria-label="删除"]');
  expect(btn, '行内删除钮必须在场（列表落定后）').toBeTruthy();
  return btn!;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  tplPending.length = 0;
  delPending.length = 0;
  ioRing.length = 0;
  ioSeq = 0;
  templatesFn.mockReset().mockImplementation(() => new Promise<any>((res) => { tplPending.push({ res }); }));
  deleteTemplateFn.mockReset().mockImplementation(() => new Promise<any>((res) => { delPending.push({ res }); }));
  askConfirmFn.mockReset().mockResolvedValue(true);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('961 TemplatesView 删除链重入闸 + 在途反馈', () => {
  it('A 在途窗重复点击不二发 + 钮面在途 disabled（闸前双发=矿红证）', async () => {
    const { host } = await mountView();
    releaseTemplates();
    await settle();
    delBtn(host).click();
    await settle();
    expect(deleteTemplateFn).toHaveBeenCalledTimes(1); // 确认通过进入请求窗
    expect(delBtn(host).disabled, '请求窗内删除钮必须 disabled（在途反馈）').toBe(true);
    delBtn(host).click(); // 在途窗二击
    await settle();
    expect(deleteTemplateFn).toHaveBeenCalledTimes(1); // 闸前实测 2 发
    releaseDel();
    await settle();
    releaseTemplates(); // 成功链刷新列表
    await settle();
    expect(delBtn(host).disabled, '落定后闸复位（钮面恢复可用）').toBe(false);
  });

  it('B 成功落定后闸复位：可再删（防闸死守卫）', async () => {
    const { host } = await mountView();
    releaseTemplates();
    await settle();
    delBtn(host).click();
    await settle();
    releaseDel();
    await settle();
    releaseTemplates(); // 成功链刷新列表
    await settle();
    expect(deleteTemplateFn).toHaveBeenCalledTimes(1);
    delBtn(host).click();
    await settle();
    expect(deleteTemplateFn).toHaveBeenCalledTimes(2); // 复位后再发
    releaseDel();
    await settle();
  });

  it('C 确认取消路径闸复位：取消后可再删（取消路径不闸死）', async () => {
    const { host } = await mountView();
    releaseTemplates();
    await settle();
    askConfirmFn.mockResolvedValueOnce(false);
    delBtn(host).click();
    await settle();
    expect(deleteTemplateFn).not.toHaveBeenCalled();
    delBtn(host).click(); // 取消后再点
    await settle();
    expect(deleteTemplateFn, '取消路径必须复位闸（置位前移立法的防闸死面）').toHaveBeenCalledTimes(1);
    releaseDel();
    await settle();
  });

  it('D 置位前移源码序锁：闸置位先于确认窗 await + finally 复位在场（937-C1 立法形态）', () => {
    const src = readFileSync(join(__dirname, '../views/TemplatesView.vue'), 'utf-8');
    const body = src.slice(src.indexOf('async function del('), src.indexOf('function onEditorKey'));
    expect(body, '闸收本体首行').toContain('if (delBusy.value) return');
    const setIdx = body.indexOf('delBusy.value = true');
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(setIdx, '闸置位必须前移到确认窗 await 之前').toBeLessThan(body.indexOf('askConfirm('));
    expect(body).toContain('finally');
    expect(body.indexOf('delBusy.value = false'), '复位必须落在 finally').toBeGreaterThan(body.indexOf('try {'));
  });
});
