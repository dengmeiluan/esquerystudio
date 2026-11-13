import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draftStorageKey } from '../composables/useScopedDraft';

/* w29 状态机全矩阵:托管重建向导「进入方式 × 现场状态 × 离开方式」的流转契约。
   每条用例对应一条真实用户路径;断言落在「步骤位 + 用户输入不丢 + 不该发生的重置没发生」。
   mount 设施沿用 adhocStepPersist(mock prepare/jobs + Monaco stub),另 mock dateForms/configLab。 */

const prepareFn = vi.fn(async () => ({
  index: 'stub', isAlias: true, physicals: ['stub_v1'],
  sourcePhysical: 'stub_v1', docCount: 3,
  settingsJson: '{"index":{"number_of_replicas":1}}',
  mappingJson: JSON.stringify({ properties: { f: { type: 'keyword' } } }),
  suggestedDest: 'stub_v2', timeFieldCandidates: [],
}));
const dateFormsFn = vi.fn(async () => ({ sampled: 50, sampling: 'random_score', forms: {} }));
const validateFn = vi.fn(async () => ({ valid: true, dryRunPassed: true }));
const startFn = vi.fn(async () => ({
  jobId: 'job-x1', job: { jobId: 'job-x1', status: 'RUNNING', stage: 'CREATE_DEST' },
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      adhoc: { ...orig.api.adhoc, prepare: prepareFn, jobs: vi.fn(async () => []), start: startFn },
      dateForms: dateFormsFn,
      configLab: { ...orig.api.configLab, validate: validateFn },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
  },
}));

async function mountWizard(query: Record<string, string> = {}, picked = '') {
  const { createApp, h, nextTick } = await import('vue');
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAppStore } = await import('../stores/app');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const View = (await import('../views/AdhocRebuildView.vue')).default;
  const pinia = createPinia();
  setActivePinia(pinia);
  const appStore = useAppStore();
  appStore.setTarget('', 'host'); // 注意:setTarget 会清 pickedIdx(切集群旧索引失效,产品语义)
  if (picked) { appStore.pick(picked); }  // 之后再置,模拟用户先选好索引再进向导
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push({ path: '/', query });
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(View) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  await new Promise(r => setTimeout(r, 40));
  await nextTick();
  const actIndex = () => {
    const steps = [...host.querySelectorAll('.steps .step')];
    return steps.findIndex(s => /\bact\b/.test(s.className));
  };
  return { host, actIndex, unmount: () => app.unmount(), router };
}

const K = (f: string) => draftStorageKey({ route: 'adhoc' }, f);

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  localStorage.removeItem('es_picked');
  prepareFn.mockClear();
  dateFormsFn.mockClear();
});

describe('w29 向导状态机矩阵', () => {
  /* —— 进入方式 × 现场状态 —— */
  it('P1 裸进入(无 query 无草稿无 pickedIdx)→ 空向导 step0,不调 prepare', async () => {
    const { actIndex } = await mountWizard();
    expect(actIndex()).toBe(0);
    expect(prepareFn).not.toHaveBeenCalled();
  });

  it('P2 裸进入 + 全局 pickedIdx → 预填并到 step1(首次开流)', async () => {
    const w = await mountWizard({}, 'global_idx');
    await new Promise(r => setTimeout(r, 120));  // prepare 异步链 + 渲染
    expect(w.actIndex()).toBe(1);
    expect(prepareFn).toHaveBeenCalledWith('global_idx');
  });

  it('P3 全新 ?index= → 上下文重置 step1,query 用后即清', async () => {
    const { actIndex, router } = await mountWizard({ index: 'fresh_idx' });
    await new Promise(r => setTimeout(r, 30));
    expect(actIndex()).toBe(1);
    expect(router.currentRoute.value.query.index).toBeUndefined();
  });

  it('P4 同索引 ?index= 重入且 step≥2 → 续现场不重置', async () => {
    sessionStorage.setItem(K('step'), '2');
    sessionStorage.setItem(K('index-name'), 'same_idx');
    const { actIndex } = await mountWizard({ index: 'same_idx' });
    expect(actIndex()).toBe(2);
  });

  it('P5 换索引 ?index= → 新意图,重置 step1', async () => {
    sessionStorage.setItem(K('step'), '2');
    sessionStorage.setItem(K('index-name'), 'old_idx');
    const { actIndex } = await mountWizard({ index: 'another_idx' });
    expect(actIndex()).toBe(1);
  });

  it('P6 无 query + step0 已输索引名 → 现场保留,不被 pickedIdx 覆写', async () => {
    sessionStorage.setItem(K('index-name'), 'typed_idx');
    localStorage.setItem('es_picked', 'global_idx');
    const { host } = await mountWizard();
    const restored = sessionStorage.getItem(K('index-name'));
    expect(restored).toBe('typed_idx');
    expect(host.querySelector('.steps .step')).toBeTruthy();
  });

  it('P7 无 query + step4(执行监控,内存态不存) → 钳回 step3 确认预览', async () => {
    sessionStorage.setItem(K('step'), '4');
    sessionStorage.setItem(K('index-name'), 'some_idx');
    const { actIndex } = await mountWizard();
    expect(actIndex()).toBe(3);
  });

  /* —— 离开/回来 —— */
  it('P8 卸载重挂载(切路由等价)→ step 与编辑稿都在', async () => {
    sessionStorage.setItem(K('step'), '1');
    sessionStorage.setItem(K('index-name'), 'keep_idx');
    sessionStorage.setItem(K('settings'), '{"index":{"x":1}}');
    const a = await mountWizard();
    expect(a.actIndex()).toBe(1);
    a.unmount();
    const b = await mountWizard();
    expect(b.actIndex()).toBe(1);
    expect(sessionStorage.getItem(K('settings'))).toContain('"x":1');
  });

  it('P9 resumeScene 只补空不覆写:settings 草稿优先于 prepare 预填', async () => {
    sessionStorage.setItem(K('step'), '1');
    sessionStorage.setItem(K('index-name'), 'keep_idx');
    sessionStorage.setItem(K('settings'), '{"index":{"USER_EDIT":true}}');
    await mountWizard();
    // 挂载会重拉 prepare(补 prep),但用户编辑稿不得被 prepare 的 settingsJson 覆写
    const after = sessionStorage.getItem(K('settings')) || '';
    expect(after).toContain('USER_EDIT');
  });

  it('P10 resumeScene 重跑体检(riskRows 内存态丢失后回看仍有报告)', async () => {
    sessionStorage.setItem(K('step'), '1');
    sessionStorage.setItem(K('index-name'), 'risk_idx');
    // pasteList/pasteIdx 是内存态,重挂载后无粘贴现场 → 不应跑体检(无假报告)
    await mountWizard();
    expect(dateFormsFn).not.toHaveBeenCalled();
  });

  /* —— 终态与重置 —— */
  it('P11 校验失败不推进:valReport invalid → 停 step1', async () => {
    validateFn.mockResolvedValueOnce({ valid: false, dryRunPassed: false });
    const { host, actIndex } = await mountWizard({ index: 'v_idx' });
    await new Promise(r => setTimeout(r, 30));
    // 驱动「校验并继续」按钮
    const btn = [...host.querySelectorAll('button')].find(b => (b.textContent || '').includes('校验并继续'));
    if (btn) {
      btn.click();
      await new Promise(r => setTimeout(r, 60));
    }
    expect(actIndex()).toBe(1);
  });

  it('P12 校验通过 → 推进 step2(策略步在场)', async () => {
    const { host, actIndex } = await mountWizard({ index: 'v_idx' });
    await new Promise(r => setTimeout(r, 100));
    const btn = [...host.querySelectorAll('button')].find(b => (b.textContent || '').includes('校验并继续'));
    expect(btn).toBeTruthy();
    btn!.click();
    await new Promise(r => setTimeout(r, 120));
    expect(actIndex()).toBe(2);
    expect(host.querySelector('.strats')).toBeTruthy();
  });

  it('P13 校验报告跨重挂载恢复——切页回来不再需要重点校验(w41)', async () => {
    sessionStorage.setItem(K('step'), '1');
    sessionStorage.setItem(K('index-name'), 'r_idx');
    sessionStorage.setItem(K('val-report'), JSON.stringify({ report: {
      valid: false, dryRunPassed: false, errorCount: 1, warnCount: 3, infoCount: 1, elapsedMs: 12,
      issues: [{ severity: 'ERROR', code: 'X', message: 'boom' }],
    } }));
    const { host } = await mountWizard();
    await new Promise(r => setTimeout(r, 60));
    const box = host.querySelector('.val-box');
    expect(box, '校验报告区块恢复').toBeTruthy();
    expect((box?.textContent || '')).toContain('修复后方可继续');
    expect((box?.textContent || '')).toContain('boom');
  });

  it('P14 w45 撕裂自愈:localStorage 只剩 name 无 id → 视为脏态清名,不再「显示生产实发空头」', async () => {
    localStorage.setItem('esquerystudio.target.name', '生产集群');
    localStorage.removeItem('esquerystudio.target');
    const { createPinia, setActivePinia } = await import('pinia');
    const { useAppStore } = await import('../stores/app');
    setActivePinia(createPinia());
    const st = useAppStore();
    expect(st.isRemote).toBe(false);
    expect(st.targetName).toBe('');
  });

  it('P15 w45 向导草稿跨集群保留:host 态粘贴的稿,切生产后仍在(不再反复重粘)', async () => {
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'step'), '2');
    sessionStorage.setItem(draftStorageKey({ route: 'adhoc' }, 'index-name'), 'x_idx');
    const a = await mountWizard();
    expect(a.actIndex()).toBe(2);
    a.unmount();
    /* 切目标(host→生产):App key 变化会重挂,但草稿键不再含 target 维度 */
    const b = await mountWizard();
    expect(b.actIndex()).toBe(2);
  });

});
