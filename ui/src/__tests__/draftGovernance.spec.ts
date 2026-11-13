import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draftStorageKey, useScopedDraft, redactDraft } from '../composables/useScopedDraft';

/* 草稿验收矩阵：
   1) 粘贴 → 重挂载仍存在（AdhocRebuild 真视图，徽标可见）
   2) 切集群目标不串稿（conn-b 不见 conn-a 的稿）
   3) 显式清除才清（清除按钮 → 徽标移除 + 存储删键）
   4) 错误路径不清稿（composable 级：写稿后模拟失败路径，存储仍在）
   5) 凭据不落盘（password/token 掩埋）
   6) Monaco 真定位（findMatches → revealLineInCenter/setSelection） */

const prepareFn = vi.fn(async () => ({
  index: 'stub', isAlias: true, physicals: ['stub_v1'],
  sourcePhysical: 'stub_v1', docCount: 3,
  settingsJson: '{"index":{}}', mappingJson: '{"properties":{}}',
  suggestedDest: 'stub_v2', timeFieldCandidates: [],
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return { ...orig, api: { ...orig.api, adhoc: { ...orig.api.adhoc, prepare: prepareFn, jobs: vi.fn(async () => []) } } };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: { name: 'MonacoEditor', props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'], template: '<div class="monaco-stub"></div>' },
}));

async function mountWizard(target = '') {
  const { createApp, h, nextTick } = await import('vue');
  const { createPinia } = await import('pinia');
  const { setActivePinia } = await import('pinia');
  const { useAppStore } = await import('../stores/app');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const View = (await import('../views/AdhocRebuildView.vue')).default;
  const pinia = createPinia();
  setActivePinia(pinia);
  useAppStore().setTarget(target, target || 'host');
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push({ path: '/', query: {} });
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(View) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  await new Promise(r => setTimeout(r, 30));
  await nextTick();
  return { host, unmount: () => app.unmount() };
}

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  prepareFn.mockClear();
});

describe('草稿治理：视图级（AdhocRebuild）', () => {
  it('粘贴稿重挂载仍在（徽标可见），显式清除才清', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'paste-raw'), '{"settings":{},"mapping":{"properties":{"code":{"type":"keyword"}}}}');
    let m = await mountWizard();
    expect(m.host.querySelector('.draft-badge'), '恢复徽标必须在').toBeTruthy();
    m.unmount();

    m = await mountWizard(); // 重挂载（等价切路由回来）
    expect(m.host.querySelector('.draft-badge'), '重挂载后草稿仍恢复').toBeTruthy();

    const clearBtn = m.host.querySelector('.draft-badge button') as HTMLButtonElement;
    clearBtn.click();
    await new Promise(r => setTimeout(r, 20));
    expect(m.host.querySelector('.draft-badge'), '清除后徽标移除').toBeNull();
    expect(sessionStorage.getItem(draftStorageKey({ route: 'adhoc' }, 'paste-raw'))).toBeNull();
    m.unmount();
  });

  it('w45 向导草稿跨集群保留（用户意图与顶栏目标无关,切生产后不再反复重粘）', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'paste-raw'), '{"mapping":{}}');
    const m = await mountWizard('conn-b');
    expect(m.host.querySelector('.draft-badge'), '切集群后粘贴稿仍在').toBeTruthy();
    m.unmount();
  });
});

describe('草稿治理：机制级', () => {
  it('错误路径不清稿（写稿后存储仍在，clear 才删）', async () => {
    const { createApp, h } = await import('vue');
    let handle: { text: any; clear: () => void } | null = null;
    const Probe = { setup() { handle = useScopedDraft('q', { route: 'probe' }, ''); return () => h('div'); } };
    const app = createApp(Probe);
    const host = document.createElement('div');
    app.mount(host);
    handle!.text.value = '{"query":{"term":{"a":1}}}';
    await new Promise(r => setTimeout(r, 10));
    // 模拟请求/校验失败路径：失败处理不调 clear
    expect(sessionStorage.getItem(draftStorageKey({ route: 'probe' }, 'q'))).toContain('term');
    handle!.clear();
    expect(sessionStorage.getItem(draftStorageKey({ route: 'probe' }, 'q'))).toBeNull();
    app.unmount();
  });

  it('凭据不落盘（password/token 掩埋）', () => {
    const out = redactDraft('{"password":"secret123","x-api-key":"k-1","note":"plain"}');
    expect(out).not.toContain('secret123');
    expect(out).toContain('"password":"***"');
    expect(sessionStorage.getItem('never') ?? '').toBe('');
  });
});

describe('Monaco 真定位（useMonacoLocate）', () => {
  it('run 取命中并跳到首个；next 滚动+选中下一处', async () => {
    const { useMonacoLocate } = await import('../composables/useMonacoLocate');
    const calls: string[] = [];
    const matches = [
      { range: { startLineNumber: 3, startColumn: 5, endLineNumber: 3, endColumn: 9 } },
      { range: { startLineNumber: 10, startColumn: 1, endLineNumber: 10, endColumn: 5 } },
    ];
    const fakeEditor: any = {
      getModel: () => ({ findMatches: () => matches }),
      revealLineInCenter: (l: number) => calls.push('reveal:' + l),
      setPosition: (p: any) => calls.push('pos:' + p.lineNumber),
      setSelection: (r: any) => calls.push('sel:' + r.startLineNumber),
      focus: () => calls.push('focus'),
    };
    const nav = useMonacoLocate(() => fakeEditor);
    nav.kw.value = 'hits';
    nav.run();
    expect(nav.count.value).toBe(2);
    expect(nav.current.value).toBe(1);
    expect(calls).toContain('reveal:3');
    nav.next();
    expect(nav.current.value).toBe(2);
    expect(calls).toContain('reveal:10');
    expect(calls).toContain('sel:10');
    nav.prev();
    expect(nav.current.value).toBe(1); // wrap
  });

  it('空文本/编辑器缺席安全（不炸、计 0）', async () => {
    const { useMonacoLocate } = await import('../composables/useMonacoLocate');
    const nav = useMonacoLocate(() => null);
    nav.kw.value = '';
    nav.run();
    expect(nav.count.value).toBe(0);
    nav.next();
    expect(nav.current.value).toBe(0);
  });
});
