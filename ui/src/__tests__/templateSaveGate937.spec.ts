/**
 * 九百三十七批：TemplatesView 保存链在途重入闸 + 写权限守卫执行体单源（真挂载行为锚五段）。
 *
 * 矿相①（重入闸，SystemView run() 同族）：save() 是三通道执行体——保存钮
 * （:disabled="saving" 钮面闸）+ JsonArea 根 Ctrl+S（onEditorKey）+ window 全局
 * Ctrl+S 兜底（onGlobalKey），两条键盘通道不受钮面闸。且本页比钮面闸多一层：
 * onEditorKey 与 onGlobalKey 对同一次按键先后触发（keydown 冒泡链，
 * preventDefault 不阻止传播）= 一次按键双发 save()。save() 体内还有覆盖确认
 * askConfirm 这个前置 await——闸置位若留在它之后，同拍第二次调用读到
 * saving=false 穿透闸；闸置位必须前移到函数体内第一个 await 之前。
 * 实害：双 PUT 同名模板 / 双成功通知 / 双列表刷新交错；覆盖确认窗叠开双弹。
 *
 * 矿相②（写权限守卫执行体单源）：保存钮 v-if="canOps" 是点位隐藏，两条键盘
 * 通道直达 save() 无权限检查——无写权限用户 Ctrl+S 照样发出 PUT（后端 403
 * 兜底，前端把不可用动作放进可达路径）。守卫落执行体后，新增通道天然受守卫。
 *
 * 驱动方式照 systemRunReentry933 / qualityThreeState（视图/组件全真 + 只 mock
 * ../api 网络出口 + Monaco stub + 真确认服务 mock + memory router）；键盘通道
 * 经 .ja 根 dispatchEvent（bubbles）一次派发同拍触发编辑器+全局双通道。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* ---- 网络出口 mock（视图/组件全真） ---- */
const templatesFn = vi.fn();
const putTemplateFn = vi.fn();
const deleteTemplateFn = vi.fn();
const askConfirmFn = vi.fn();
type Settle = { res: (v: any) => void; rej: (e: any) => void };
const tplPending: Settle[] = [];
const putPending: Settle[] = [];
const ioRing: any[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      templates: (...args: any[]) => templatesFn(...args),
      putTemplate: (...args: any[]) => putTemplateFn(...args),
      deleteTemplate: (...args: any[]) => deleteTemplateFn(...args),
      /* store/邻域防御性 stub 挡真实 fetch 噪音（qualityThreeState 同款） */
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

/* Monaco 内核 jsdom 不可用——stub 静态占位（qualityThreeState/933 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import TemplatesView from '../views/TemplatesView.vue';
import { useAuthStore } from '../stores/auth';

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

const TPL_937 = {
  legacy: false,
  index_templates: [
    { name: 'logs-tpl', index_template: { index_patterns: ['logs-*'], priority: 100, template: { settings: { number_of_shards: 1 } } } },
  ],
  component_templates: [],
};

function releaseTemplates(list: any[] = TPL_937.index_templates) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url: '/internal/es/index/cluster/templates', requestBody: '', status: 200, ok: true, durationMs: 4, responseRaw: JSON.stringify({ legacy: false, index_templates: list, component_templates: [] }) });
  tplPending.shift()!.res({ legacy: false, index_templates: list, component_templates: [] });
}
function releasePut() { putPending.shift()!.res({}); }
function failPut(e: any = new Error('mapper_parsing_exception: root cause')) { putPending.shift()!.rej(e); }

/* 选中首行（查看全角色可用，选中不涉权限）；D 用例权限态下钮缺席但行仍在 */
async function pickFirstRow(host: ParentNode) {
  const row = host.querySelector<HTMLElement>('.tv2-row');
  expect(row, '模板行必须在场（列表落定后）').toBeTruthy();
  row!.click();
  await settle();
}

/* 键盘通道：.ja 根一次派发 Ctrl+S，冒泡链同拍触发 onEditorKey+onGlobalKey 双通道 */
function fireCtrlS(host: ParentNode) {
  const ja = host.querySelector('.ja');
  expect(ja, 'JsonArea 根必须在场（选中或新建态）').toBeTruthy();
  ja!.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
}

function saveBtn(host: ParentNode): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('保存'));
  expect(btn, '保存钮必须在场（有写权限态）').toBeTruthy();
  return btn!;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  tplPending.length = 0;
  putPending.length = 0;
  ioRing.length = 0;
  ioSeq = 0;
  templatesFn.mockReset().mockImplementation(() => new Promise<any>((res, rej) => { tplPending.push({ res, rej }); }));
  putTemplateFn.mockReset().mockImplementation(() => new Promise<any>((res, rej) => { putPending.push({ res, rej }); }));
  deleteTemplateFn.mockReset().mockResolvedValue({});
  askConfirmFn.mockReset().mockResolvedValue(true);
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('937 TemplatesView 保存链重入闸 + 写权限守卫', () => {
  it('A 在途窗键盘通道再触发不二发（闸前双发=矿红证）', async () => {
    const { host } = await mountView();
    releaseTemplates();
    await settle();
    await pickFirstRow(host);
    saveBtn(host).click();
    await settle();
    expect(putTemplateFn).toHaveBeenCalledTimes(1); // 首发在途
    fireCtrlS(host); // 在途窗 Ctrl+S（冒泡链双通道）
    await settle();
    expect(putTemplateFn).toHaveBeenCalledTimes(1); // 闸前实测 2 发
    releasePut();
    await settle();
    expect(host.textContent).toContain('logs-tpl'); // 保存成功列表刷新
  });

  it('B 同拍冒泡链双触发不二发（一次按键两通道，闸前双发=矿红证）', async () => {
    const { host } = await mountView();
    releaseTemplates();
    await settle();
    await pickFirstRow(host);
    fireCtrlS(host); // 一次按键：编辑器通道+全局兜底通道同拍
    await settle();
    expect(putTemplateFn).toHaveBeenCalledTimes(1); // 闸前实测 2 发
    releasePut();
    await settle();
  });

  it('C 落定后闸复位：完成窗经同通道可再发（防闸死守卫）', async () => {
    const { host } = await mountView();
    releaseTemplates();
    await settle();
    await pickFirstRow(host);
    fireCtrlS(host);
    await settle();
    expect(putTemplateFn).toHaveBeenCalledTimes(1);
    releasePut();
    await settle(); // PUT 恢复后成功链才发出列表刷新，先落一拍再喂
    releaseTemplates();
    await settle();
    fireCtrlS(host);
    await settle();
    expect(putTemplateFn).toHaveBeenCalledTimes(2); // 复位后再发
    releasePut();
    await settle();
  });

  it('D 无写权限：键盘通道不发出写请求（守卫落执行体，闸前 1 发=矿红证）', async () => {
    const { host, pinia } = await mountView();
    const auth = useAuthStore(pinia);
    auth.me = { username: 'v', role: 'VIEWER', fallback: false, grantedPages: null };
    releaseTemplates();
    await settle();
    await pickFirstRow(host);
    expect(Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('保存')), '无写权限保存钮必须缺席').toBeUndefined();
    fireCtrlS(host); // 点位隐藏挡不住的键盘路径
    await settle();
    expect(putTemplateFn).not.toHaveBeenCalled(); // 闸前实测 1 发
    expect(askConfirmFn).not.toHaveBeenCalled(); // 同拍确认窗也不许开
  });

  it('E 失败后闸复位：失败现场经同通道可重试且成功列表刷新', async () => {
    const { host } = await mountView();
    releaseTemplates();
    await settle();
    await pickFirstRow(host);
    fireCtrlS(host);
    await settle();
    expect(putTemplateFn).toHaveBeenCalledTimes(1);
    failPut();
    await settle();
    fireCtrlS(host);
    await settle();
    expect(putTemplateFn).toHaveBeenCalledTimes(2); // 失败现场可重试
    releasePut();
    await settle();
  });
});
