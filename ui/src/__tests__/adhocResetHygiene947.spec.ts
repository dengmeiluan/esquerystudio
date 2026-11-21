/**
 * 九百四十七批：重建工作台 reset 清场补齐探测失败态（prepErr/prepErrRaw）。
 *
 * reset() 清场清单覆盖 pasteErr/riskErr 等错误态，独缺 prepErr/prepErrRaw——
 * 探测失败红条（ar-probe-err）在「再来一次」后滞留屏上，配着新一轮的干净表单
 * （上一轮的失败结论挂在眼前）。修法=清场清单补齐两键（raceGuard858 reset 清
 * riskBusy 的显式清场同形态；探测失败态与粘贴失败态同域同律）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const jobsFn = vi.fn();
const aliasesFn = vi.fn();
const inspectFn = vi.fn();
const prepareFn = vi.fn();
vi.mock('../composables/confirm', () => ({ askConfirm: async () => false }));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      aliases: (...a: any[]) => aliasesFn(...a),
      clusterInspect: (...a: any[]) => inspectFn(...a),
      adhoc: {
        ...actual.api.adhoc,
        prepare: (...a: any[]) => prepareFn(...a),
        status: () => Promise.resolve({}),
        jobs: (...a: any[]) => jobsFn(...a),
        abort: () => Promise.resolve({}),
        confirmSwitch: () => Promise.resolve({}),
        start: () => Promise.resolve({}),
      },
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup() { return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: async () => true };
});

import AdhocRebuildView from '../views/AdhocRebuildView.vue';

const ar = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountAdhoc() {
  location.hash = '#/adhoc';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/indices', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(AdhocRebuildView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle(20);
  return host;
}

const ss = (host: HTMLElement): any => (host.querySelector('.ahr') as any).__vueParentComponent.setupState;

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  jobsFn.mockReset().mockResolvedValue([]);
  aliasesFn.mockReset().mockResolvedValue([]);
  inspectFn.mockReset().mockResolvedValue({});
  prepareFn.mockReset().mockResolvedValue({});
});

describe('九百四十七批：reset 清场补齐探测失败态', () => {
  it('行为锚：prepErr/prepErrRaw 置位后 reset 归零，失败红条熄灭', async () => {
    const host = await mountAdhoc();
    const st = ss(host);
    st.prepErr = '探测失败：alias boom';
    st.prepErrRaw = { code: 'X' };
    await settle();
    expect(host.querySelector('.ar-probe-err'), '前置证据：失败红条在场').toBeTruthy();
    st.reset();
    await settle();
    expect(st.prepErr, 'prepErr 归零').toBe('');
    expect(st.prepErrRaw, 'prepErrRaw 归零').toBeNull();
    expect(host.querySelector('.ar-probe-err'), '失败红条熄灭').toBeNull();
  });

  it('防过宽对照：粘贴失败态清场仍生效（既有语义零回归）', async () => {
    const host = await mountAdhoc();
    const st = ss(host);
    st.pasteErr = '粘贴解析失败';
    st.reset();
    await settle();
    expect(st.pasteErr).toBe('');
  });

  it('源码锁：reset() 清场清单含 prepErr/prepErrRaw 两键', () => {
    const at = ar.indexOf('function reset() {');
    expect(at).toBeGreaterThan(-1);
    const body = ar.slice(at, ar.indexOf('\n}', at));
    expect(body).toContain('prepErr.value = \'\';');
    expect(body).toContain('prepErrRaw.value = null;');
  });
});
