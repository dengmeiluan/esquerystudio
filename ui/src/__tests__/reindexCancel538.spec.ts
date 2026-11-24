/**
 * 五百三十八批 W2：ReindexPreview 运行取消 + 读秒（轨2 重点页体验增量；useQueryRun 统一件，
 * SqlBridge 535 T4 同款范式）。
 *
 * 契约（挂载型行为面 + 源码锁；535「成功入史」锚同步更新不回退）：
 * ① begin() 的 signal 作第三形参传 api.reindexPreview（Lead 先行契约，post 透传先例=clusterQuery）；
 * ② 运行中出「取消」钮（qr.running 驱动），点击 abort → 请求以 AbortError 落 run 的 catch；
 * ③ 取消静默：不进 runErr 红条（role=alert 不出现）、不占史位、只发 info 档 notify，
 *    busy/取消钮/读秒全部复位，旧预估原样保留（R80 同语义，SqlBridge/DslQueryView 同款）；
 * ④ 读秒：qr.elapsedMs（100ms tick）驱动「预估中 X.Xs」文案，finish 即停回「运行预估」；
 * ⑤ 成功入史（mode/index/ok/took，histPanel535 锚同步更新）与非取消失败红条（既有语义）零回退。
 *
 * 设施：histPanel535 同款——NModal stub 直渲染 + MonacoEditor stub；api.reindexPreview 可控门
 * （手动 res/rej + signal abort 即以 AbortError reject）；读秒用例局部 fake setInterval/Date.now。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia, type Pinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* NModal：teleport/定位非测试目标——show=true 直渲染、false 不渲染 */
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    NModal: defineComponent({
      name: 'NModal',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () => (props.show ? h('div', { class: 'nm-stub' }, slots.default ? slots.default() : []) : null);
      },
    }),
  };
});

/* MonacoEditor stub：JsonArea 内核占位（本 spec 不驱动编辑器内容） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) {
      return () => h('div', { class: 'monaco-stub' }, String(props.modelValue ?? ''));
    },
  }),
}));

/* api.reindexPreview 可控门：捕获 (source, query, signal)，signal abort 即以 AbortError reject
   （真实链路=fetch 原样上抛 AbortError，api.ts R80 语义不包装） */
let gate: { resolve: (v: any) => void; reject: (e: any) => void; signal?: AbortSignal } | null = null;
const reindexPreviewFn = vi.fn((_source: string, _query: string, signal?: AbortSignal) => new Promise<any>((resolve, reject) => {
  gate = { resolve, reject, signal };
  signal?.addEventListener('abort', () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    reject(err);
  });
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexPreview: (...a: any[]) => reindexPreviewFn(...(a as [string, string, AbortSignal?])),
      /* 防御性 stub 挡真实 fetch 噪音（CurrentIdxChip/字段源/store 初始化） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      indexSettings: () => Promise.resolve({ index: {} }),
      shards: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import { useAppStore } from '../stores/app';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

let apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any): Promise<{ host: HTMLElement; pinia: Pinia; unmount: () => void }> {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
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
  return { host, pinia, unmount: () => app.unmount() };
}

function textBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}
function histStore(): Array<any> {
  return JSON.parse(localStorage.getItem('es_query_hist_v2') || '[]');
}

beforeEach(() => {
  document.body.innerHTML = '';
  apps = [];
  history.replaceState(null, '', '#/');
  sessionStorage.clear();
  localStorage.clear();
  gate = null;
  reindexPreviewFn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  apps.forEach(a => a.unmount());
  apps = [];
});

describe('五百三十八批 W2：ReindexPreview 运行取消 + 读秒', () => {
  it('signal 第三形参在传；运行中出「取消」钮，点击 abort → signal.aborted 翻转', async () => {
    history.replaceState(null, '', '#/?idx=logs-1');
    const { host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    expect(textBtn(host, '取消'), '静息态无取消钮').toBeUndefined();
    textBtn(host, '运行预估')!.click();
    await settle();
    expect(reindexPreviewFn).toHaveBeenCalledTimes(1);
    /* Lead 先行契约：第三形参 = begin() 的 AbortSignal */
    const sig = reindexPreviewFn.mock.calls[0][2] as AbortSignal | undefined;
    expect(sig, 'signal 须作第三形参传入 api.reindexPreview').toBeTruthy();
    expect(sig!.aborted).toBe(false);
    /* 取消钮仅运行中在场（qr.running 驱动） */
    const cancel = textBtn(host, '取消');
    expect(cancel, '运行中出「取消」钮').toBeTruthy();
    cancel!.click();
    await settle();
    expect(sig!.aborted, '点击取消即 abort 信号').toBe(true);
    unmount();
  });

  it('取消静默：零红条/零史位/仅 info 档提示，busy 与取消钮复位、旧预估保留', async () => {
    history.replaceState(null, '', '#/?idx=logs-1');
    const { host, pinia, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    const notifySpy = vi.spyOn(useAppStore(pinia), 'notify');
    /* 先成功一轮留旧预估（G2：重跑失败/取消保留旧数据） */
    reindexPreviewFn.mockResolvedValueOnce({ docs: 7 });
    textBtn(host, '运行预估')!.click();
    await settle();
    expect(host.textContent).toContain('7');
    const histBefore = histStore().length;
    expect(histBefore, '首轮成功已入史一条').toBe(1);
    /* 第二轮挂起后取消 */
    textBtn(host, '运行预估')!.click();
    await settle();
    notifySpy.mockClear();
    textBtn(host, '取消')!.click();
    await settle();
    /* AbortError 静默：不进红条、不弹 error 档（info 档轻提示放行）、不占史位 */
    expect(host.querySelector('[role="alert"]'), '取消不进 runErr 红条').toBeNull();
    expect(notifySpy.mock.calls.some(c => c[0] === 'error'), '取消零 error toast').toBe(false);
    expect(notifySpy.mock.calls.some(c => c[0] === 'info'), 'info 档轻提示在（已取消预估）').toBe(true);
    expect(histStore().length, '取消不占史位（维持首轮那一条）').toBe(histBefore);
    /* 复位：取消钮移除、运行钮回静息文案、busy 落（读秒停） */
    expect(textBtn(host, '取消')).toBeUndefined();
    expect(textBtn(host, '运行预估'), '运行钮回静息文案').toBeTruthy();
    expect(host.textContent).not.toContain('预估中');
    /* 旧预估原样保留（G2 口径不回退） */
    expect(host.textContent).toContain('7');
    unmount();
  });

  it('读秒：100ms tick 驱动「预估中 X.Xs」，finish 即停回「运行预估」', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    history.replaceState(null, '', '#/?idx=logs-1');
    const { host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    /* 钮引用先取（点击后文案切「预估中 X.Xs」，按静息文案再寻址会落空） */
    const runBtn = textBtn(host, '运行预估')!;
    expect(runBtn, '静息运行钮在场').toBeTruthy();
    runBtn.click();
    await settle();
    expect(runBtn.textContent).toContain('预估中');
    vi.advanceTimersByTime(1500);
    await settle();
    expect(runBtn.textContent, '读秒走秒（qr.elapsedMs 驱动）').toContain('预估中 1.5s');
    /* 取消 → finish 即停，文案回静息（读秒不残留） */
    textBtn(host, '取消')!.click();
    await settle();
    expect(runBtn.textContent).toContain('运行预估');
    expect(runBtn.textContent).not.toContain('预估中');
    unmount();
  });

  it('成功路径不回退：入史一条 mode/index/ok/took（535 锚同步更新），取消钮移除', async () => {
    history.replaceState(null, '', '#/?idx=logs-1');
    const { host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    reindexPreviewFn.mockResolvedValueOnce({ docs: 3 });
    textBtn(host, '运行预估')!.click();
    await settle();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const items = histStore();
    expect(items.length, '成功恰好入史一条').toBe(1);
    expect(items[0].mode).toBe('reindex-preview');
    expect(items[0].index).toBe('logs-1');
    expect(items[0].ok).toBe(true);
    expect(typeof items[0].took).toBe('number');
    expect(items[0].took).toBeGreaterThanOrEqual(0);
    /* 完成后取消钮移除（qr.finish） */
    expect(textBtn(host, '取消')).toBeUndefined();
    unmount();
  });

  it('非取消失败不静默：boom 仍进 runErr 红条、不占史位（既有语义零回退）', async () => {
    history.replaceState(null, '', '#/?idx=logs-2');
    const { host, unmount } = await mountView((await import('../views/ReindexPreviewView.vue')).default);
    reindexPreviewFn.mockRejectedValueOnce(new Error('boom'));
    textBtn(host, '运行预估')!.click();
    await settle();
    expect(host.querySelector('[role="alert"]'), '非取消失败仍红条').toBeTruthy();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('boom');
    expect(histStore().length, '失败不入史').toBe(0);
    unmount();
  });

  it('源码锁：useQueryRun 接线 + signal 传第三形参 + AbortError/signal.aborted 静默判定', () => {
    const src = readFileSync(join(__dirname, '../views/ReindexPreviewView.vue'), 'utf-8');
    expect(src).toContain("import { useQueryRun } from '../composables/useQueryRun';");
    expect(src).toContain('const qr = useQueryRun();');
    expect(src).toContain('const signal = qr.begin();');
    expect(src).toContain('api.reindexPreview(source.value, queryBody.value, signal)');
    expect(src).toContain('v-if="qr.running.value" class="btn sm ghost" @click="qr.cancel()"');
    expect(src).toContain("'预估中 '");
    expect(src).toContain("e?.name === 'AbortError' || signal.aborted");
    expect(src).toContain('qr.finish();');
  });
});
