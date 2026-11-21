/**
 * R130 三十一批：托管重建向导步骤条键盘可达性守卫。
 * 锁定（F1 放行规则不变，只是同一规则长出键盘入口）：
 * 1) 当前步 aria-current="step"；
 * 2) 可点步骤（回退步/「返回执行监控」chip）role="button" + tabindex=0，
 *    其余步骤 tabindex=-1 不进 Tab 序（未到前向步不可达是流程契约）；
 * 3) Enter 键触发与点击同路径的跳步（回退）；
 * 4) aria-disabled 在终态由 locked 类呼应（模板恒定接线，此处锁 3 条运行时行为）。
 * 挂载样板照抄 adhocStepPersist.spec（mock api/Monaco + memory router）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';

const prepareFn = vi.fn(async () => ({
  index: 'stub', isAlias: true, physicals: ['stub_v1'],
  sourcePhysical: 'stub_v1', docCount: 3,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify({ properties: { f: { type: 'keyword' } } }),
  suggestedDest: 'stub_v2', timeFieldCandidates: [],
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, prepare: prepareFn, jobs: vi.fn(async () => []) },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

async function mountWizard(query: Record<string, string> = {}) {
  const { createApp, h, nextTick } = await import('vue');
  const { createPinia } = await import('pinia');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const View = (await import('../views/AdhocRebuildView.vue')).default;

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push({ path: '/', query });
  await router.isReady();

  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  await new Promise(r => setTimeout(r, 30));
  await nextTick();
  return { host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.clear();
  prepareFn.mockClear();
});

describe('向导步骤条键盘可达（三十一批）', () => {
  it('step=2 时：回退步是 button+Tab 可达，当前步 aria-current=step 且不入 Tab 序', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    const { host } = await mountWizard();
    const steps = [...host.querySelectorAll('.steps .step')] as HTMLElement[];
    expect(steps.length).toBe(5);
    /* 回退步 0/1：button + tabindex=0 */
    for (const i of [0, 1]) {
      expect(steps[i].getAttribute('role'), `step${i} role`).toBe('button');
      expect(steps[i].getAttribute('tabindex'), `step${i} tabindex`).toBe('0');
    }
    /* 当前步：aria-current + 不可 Tab */
    expect(steps[2].getAttribute('aria-current')).toBe('step');
    expect(steps[2].getAttribute('tabindex')).toBe('-1');
    /* 未到前向步 3/4：无 role、不入 Tab 序 */
    for (const i of [3, 4]) {
      expect(steps[i].getAttribute('role'), `step${i} role`).toBeNull();
      expect(steps[i].getAttribute('tabindex'), `step${i} tabindex`).toBe('-1');
    }
  });

  it('Enter 键回退与点击同路径：聚焦 step0 按 Enter → 当前步变 0', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    const { host } = await mountWizard();
    const steps = [...host.querySelectorAll('.steps .step')] as HTMLElement[];
    steps[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    expect(steps[0].className).toContain('act');
  });

  it('step=0（起点）时无可达 button：无回退步、无监控 chip', async () => {
    const { host } = await mountWizard();
    const steps = [...host.querySelectorAll('.steps .step')] as HTMLElement[];
    expect(steps[0].getAttribute('aria-current')).toBe('step');
    expect(steps.filter(s => s.getAttribute('role') === 'button').length).toBe(0);
  });
});
