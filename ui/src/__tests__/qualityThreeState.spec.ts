/**
 * G6（UX 轮 II quality 组）三态与写链路——行为改动防回归：
 *
 *   TemplatesView：
 *     B1 加载失败 → err-bar 独立顶置（friendlyEsError 收敛 + 重试），不再困在互斥链内
 *        无渲染出口；有旧列表刷新失败 → err-bar 在且旧 rows 保留（G2/G3 教训 1）；
 *     B2 loading 初值 true——首帧即骨架，不闪真空文案；
 *   ConfigDriftView：
 *     B4 清单拉取失败 → err-bar 独立顶置（原「失败 EmptyState」困在链内：有旧 keys 时
 *        body 分支获胜，loadErr 无渲染出口退化为仅 toast）；有旧清单刷新失败并存；
 *     B5 loadingKeys 初值 true——首帧「正在拉取」，不闪「真无 provider」；
 *   ConfigValidatorView：
 *     B7 校验失败 → err-bar（读链路收敛 + 重试重跑同模式 lastDryRun），不再仅 toast
 *        落回引导空态（R91b 同构）；有旧报告再失败并存；
 *   IndexOptimizerView：
 *     B8 扫描失败 → err-bar，不再 toast + snap=null 伪装「尚未扫描」（R91b 同构）；
 *        有旧快照重扫失败并存；应用勾选防重入（applying + 「下发中…」，教训 7/9）；
 *   TemplateGalleryView：
 *     画廊卡片页：过滤致空 EmptyState + 清除逃生口恢复。
 *
 * Monaco 说明：TemplatesView/ConfigValidatorView 含 MonacoEditor——jsdom 不可用，
 * 统一 stub 为 .monaco-stub（本组断言不涉及编辑器行为）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口与全局确认服务，视图/组件/工具全用真的 */
const templatesFn = vi.fn();
const putTemplateFn = vi.fn();
const deleteTemplateFn = vi.fn();
const driftKeysFn = vi.fn();
const driftFn = vi.fn();
const validateFn = vi.fn();
const clusterInspectFn = vi.fn();
const createIndexFn = vi.fn();
const indexSettingsFn = vi.fn();
const updateIndexSettingsFn = vi.fn();
const clusterForceMergeFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
      templates: (...args: any[]) => templatesFn(...args),
      putTemplate: (...args: any[]) => putTemplateFn(...args),
      deleteTemplate: (...args: any[]) => deleteTemplateFn(...args),
      configLab: {
        ...actual.api.configLab,
        driftKeys: (...args: any[]) => driftKeysFn(...args),
        drift: (...args: any[]) => driftFn(...args),
        validate: (...args: any[]) => validateFn(...args),
      },
      clusterInspect: (...args: any[]) => clusterInspectFn(...args),
      createIndex: (...args: any[]) => createIndexFn(...args),
      indexSettings: (...args: any[]) => indexSettingsFn(...args),
      updateIndexSettings: (...args: any[]) => updateIndexSettingsFn(...args),
      clusterForceMerge: (...args: any[]) => clusterForceMergeFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* store.loadIndices 链路出口补齐（防御性 stub 挡真实 fetch 噪音，教训 5） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* Monaco 在 jsdom 不可用——stub 为静态占位（本组不断言编辑器行为） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import TemplatesView from '../views/TemplatesView.vue';
import ConfigDriftView from '../views/ConfigDriftView.vue';
import ConfigValidatorView from '../views/ConfigValidatorView.vue';
import IndexOptimizerView from '../views/IndexOptimizerView.vue';
import TemplateGalleryView from '../views/TemplateGalleryView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/search', component: { template: '<div/>' } },
      { path: '/adhoc-rebuild', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

/* 样例数据（按后端实际返回形态，教训 6） */
const TPL_OK = {
  legacy: false,
  index_templates: [
    { name: 'logs-tpl', index_template: { index_patterns: ['logs-*'], priority: 100, template: { settings: { number_of_shards: 1 } } } },
  ],
  component_templates: [],
};
const DRIFT_KEYS = [{ indexKey: 'orderIdx', alias: 'order', hasMapping: true }];
const REPORT_OK = {
  valid: true, dryRunExecuted: true, dryRunPassed: true, elapsedMs: 12,
  errorCount: 0, warnCount: 0, infoCount: 0, issues: [],
};
const SNAP = {
  'logs-2026.08': { settings: { index: { refresh_interval: '1s', number_of_shards: '1', number_of_replicas: '0' } } },
};

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  templatesFn.mockReset().mockResolvedValue(TPL_OK);
  putTemplateFn.mockReset().mockResolvedValue({});
  deleteTemplateFn.mockReset().mockResolvedValue({});
  driftKeysFn.mockReset().mockResolvedValue(DRIFT_KEYS);
  driftFn.mockReset().mockResolvedValue({});
  validateFn.mockReset().mockResolvedValue(REPORT_OK);
  clusterInspectFn.mockReset().mockResolvedValue({ settings: {}, mappings: {} });
  createIndexFn.mockReset().mockResolvedValue({});
  indexSettingsFn.mockReset().mockResolvedValue(SNAP);
  updateIndexSettingsFn.mockReset().mockResolvedValue({});
  clusterForceMergeFn.mockReset().mockResolvedValue({ ok: true });
  askConfirmFn.mockReset().mockResolvedValue(true);
});

describe('G6 TemplatesView：列表三态（B1 err-bar 独立顶置 / B2 loading 初值）', () => {
  it('B2：首载中 → 骨架在，真空文案不闪', async () => {
    templatesFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟拉取中 */ }));
    const { app, host } = await mountView(TemplatesView, '#/templates');
    expect(host.querySelector('.tv2-skel'), '首载中必须出骨架').toBeTruthy();
    expect(host.textContent, '首载中不许闪真空文案').not.toContain('集群没有任何');
    app.unmount();
  });

  it('B1：首载失败 → err-bar（收敛文案+重试）在，不伪装真空；重试重跑 load', async () => {
    templatesFn.mockRejectedValue(new Error('index_not_found_exception: no such index [_index_template]'));
    const { app, host } = await mountView(TemplatesView, '#/templates');
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现错误条（独立顶置）').toBeTruthy();
    expect(bar!.textContent).toContain('模板列表拉取失败');
    expect(bar!.textContent, '读链路必须过 friendlyEsError 收敛').toContain('索引不存在');
    expect(host.textContent, '失败不许伪装真空').not.toContain('集群没有任何');
    templatesFn.mockClear();
    findBtn(bar! as HTMLElement, '重试')!.click();
    await settle();
    expect(templatesFn, '重试必须重跑 load').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('失败 → 重试成功 → err-bar 消 + 列表出（反向锁，复审 M3）', async () => {
    templatesFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(TemplatesView, '#/templates');
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    templatesFn.mockResolvedValue(TPL_OK);
    findBtn(host.querySelector('.err-bar') as HTMLElement, '重试')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '重试成功后 err-bar 必须消').toBeNull();
    expect(host.querySelectorAll('.tv2-row').length, '重试成功后列表必须出').toBe(1);
    expect(host.textContent).toContain('logs-tpl');
    app.unmount();
  });

  it('B1：有旧列表刷新失败 → err-bar 在且旧 rows 保留（教训 1 回归锁）', async () => {
    const { app, host } = await mountView(TemplatesView, '#/templates');
    expect(host.querySelectorAll('.tv2-row').length, '首载成功必须有列表行').toBe(1);
    expect(host.textContent).toContain('logs-tpl');
    templatesFn.mockRejectedValue(new Error('connect refused'));
    host.querySelector<HTMLButtonElement>('button[title="刷新模板列表"]')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '刷新失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('connect refused');
    expect(host.querySelectorAll('.tv2-row').length, '旧列表行必须保留').toBe(1);
    expect(host.textContent, '旧模板名必须保留').toContain('logs-tpl');
    app.unmount();
  });

  it('真空（成功但空数组）→ 引导文案在，err-bar 不在', async () => {
    templatesFn.mockResolvedValue({ legacy: false, index_templates: [], component_templates: [] });
    const { app, host } = await mountView(TemplatesView, '#/templates');
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.textContent, '真空必须出引导文案').toContain('集群没有任何');
    app.unmount();
  });
});

describe('G6 ConfigDriftView：清单三态（B4 err-bar 独立顶置 / B5 loadingKeys 初值）', () => {
  it('B5：首载中 → 「正在拉取对象清单」在，「没有注册」不闪', async () => {
    driftKeysFn.mockReturnValue(new Promise(() => { /* 永不 resolve */ }));
    const { app, host } = await mountView(ConfigDriftView, '#/config-drift');
    expect(host.textContent, '首载中必须出加载文案').toContain('正在拉取对象清单');
    expect(host.textContent, '首载中不许闪「真无 provider」').not.toContain('没有注册 ManagedEsIndex');
    app.unmount();
  });

  it('B4：首载失败 → err-bar 在，不伪装「没有注册」；重试重跑 loadKeys', async () => {
    driftKeysFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(ConfigDriftView, '#/config-drift');
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现错误条').toBeTruthy();
    expect(bar!.textContent).toContain('对象清单拉取失败');
    expect(bar!.textContent).toContain('connect refused');
    expect(host.textContent, '失败不许伪装「无 provider」').not.toContain('没有注册 ManagedEsIndex');
    expect(host.querySelector('.cd-list'), '失败且无旧数据时不出清单（407 起 .cd-body class 退役换 WorkbenchLayout）').toBeNull();
    driftKeysFn.mockClear();
    findBtn(bar! as HTMLElement, '重试')!.click();
    await settle();
    expect(driftKeysFn, '重试必须重跑 loadKeys').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('真空（成功但空数组）→ EmptyState「没有注册」在，err-bar 不在', async () => {
    driftKeysFn.mockResolvedValue([]);
    const { app, host } = await mountView(ConfigDriftView, '#/config-drift');
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.empty-state'), '真空必须出 EmptyState 组件').toBeTruthy();
    expect(host.textContent).toContain('没有注册 ManagedEsIndex');
    app.unmount();
  });

  it('B4：有旧清单刷新失败 → err-bar 在且 cd-body/旧项保留（本组核心：链内困锁修复）', async () => {
    const { app, host } = await mountView(ConfigDriftView, '#/config-drift');
    expect(host.querySelector('.cd-list'), '首载成功必须出清单栏（407 起 .cd-body 退役换 WorkbenchLayout）').toBeTruthy();
    expect(host.textContent).toContain('orderIdx');
    driftKeysFn.mockRejectedValue(new Error('timeout'));
    findBtn(host, '刷新')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '刷新失败必须出现错误条（修复前困在互斥链内无渲染出口）').toBeTruthy();
    expect(host.textContent).toContain('对象清单拉取失败');
    expect(host.querySelector('.cd-list'), '失败时旧清单必须保留').toBeTruthy();
    expect(host.textContent, '旧 indexKey 必须保留').toContain('orderIdx');
    app.unmount();
  });
});

describe('G6 ConfigValidatorView：校验失败 err-bar（B7）', () => {
  it('校验失败 → err-bar 在，不伪装引导空态（R91b 回归锁）', async () => {
    validateFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(ConfigValidatorView, '#/config-validator');
    findBtn(host, '校验 + Dry-run')!.click();
    await settle();
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现错误条').toBeTruthy();
    expect(bar!.textContent).toContain('校验请求失败');
    expect(bar!.textContent).toContain('connect refused');
    expect(host.textContent, '失败不许落回引导空态').not.toContain('粘贴 settings / mapping');
    app.unmount();
  });

  it('快速 Lint 失败 → 重试重跑同模式（validate 第三参 dryRun=false，lastDryRun 记忆）', async () => {
    validateFn.mockRejectedValue(new Error('boom'));
    const { app, host } = await mountView(ConfigValidatorView, '#/config-validator');
    findBtn(host, '快速 Lint')!.click();
    await settle();
    expect(validateFn).toHaveBeenCalledTimes(1);
    expect(validateFn.mock.calls[0][2], '首次必须是 Lint 模式（dryRun=false）').toBe(false);
    const bar = host.querySelector('.err-bar');
    expect(bar).toBeTruthy();
    validateFn.mockClear();
    findBtn(bar! as HTMLElement, '重试')!.click();
    await settle();
    expect(validateFn, '重试必须重跑 doValidate').toHaveBeenCalledTimes(1);
    expect(validateFn.mock.calls[0][2], '重试必须重跑同模式 Lint（不偷换成 Dry-run）').toBe(false);
    app.unmount();
  });

  it('有旧报告再校验失败 → err-bar 在且旧报告保留（不清 report）', async () => {
    const { app, host } = await mountView(ConfigValidatorView, '#/config-validator');
    findBtn(host, '校验 + Dry-run')!.click();
    await settle();
    expect(host.querySelector('.cv-report'), '成功必须出报告').toBeTruthy();
    expect(host.textContent).toContain('校验通过');
    validateFn.mockRejectedValue(new Error('gateway timeout'));
    findBtn(host, '校验 + Dry-run')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '再失败必须出 err-bar').toBeTruthy();
    expect(host.querySelector('.cv-report'), '失败时旧报告必须保留').toBeTruthy();
    expect(host.textContent, '旧结论必须保留').toContain('校验通过');
    app.unmount();
  });

  it('校验 in-flight：按钮禁用 + 「校验中…」文案（教训 7 组内口径锁）', async () => {
    validateFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟 in-flight */ }));
    const { app, host } = await mountView(ConfigValidatorView, '#/config-validator');
    const lintBtn = findBtn(host, '快速 Lint')!;
    /* 复审 M2：点击前先取主按钮引用——775 G250 后发起钮出「校验中…」，事后 findBtn 会重复命中 Lint */
    const mainBtn = findBtn(host, '校验 + Dry-run')!;
    lintBtn.click();
    await settle(3);
    expect(lintBtn.disabled, 'in-flight 期间 Lint 按钮必须禁用').toBe(true);
    expect(lintBtn.textContent, 'in-flight 期间必须出 pending 文案').toContain('校验中');
    expect(mainBtn.disabled, 'in-flight 期间主按钮必须禁用（busy 共享）').toBe(true);
    /* 775 G250 锁同步更新：共享 busy 改 lastDryRun 门控（772 G246 lastMode 族）——快速 Lint
       发起时主按钮图标/文案双恒定，不再双钮同文案 */
    expect(mainBtn.textContent, '主按钮恒静（lastDryRun=false 门控=未由本钮发起）').toContain('校验 + Dry-run');
    expect(mainBtn.textContent).not.toContain('校验中');
    app.unmount();
  });
});

describe('G6 IndexOptimizerView：扫描三态与下发防重入（B8 / 教训 7、9）', () => {
  it('B8：扫描失败 → err-bar 在，不伪装「尚未扫描」（R91b 回归锁）；重试重跑 scan', async () => {
    indexSettingsFn.mockRejectedValue(new Error('index_not_found_exception: no such index [logs]'));
    const { app, host } = await mountView(IndexOptimizerView, '#/index-optimizer?idx=logs');
    const bar = host.querySelector('.err-bar');
    expect(bar, '失败必须出现错误条').toBeTruthy();
    expect(bar!.textContent).toContain('扫描失败');
    expect(bar!.textContent, '读链路必须过 friendlyEsError 收敛').toContain('索引不存在');
    expect(host.textContent, '失败不许伪装「尚未扫描」').not.toContain('尚未扫描任何索引');
    indexSettingsFn.mockClear();
    findBtn(bar! as HTMLElement, '重试')!.click();
    await settle();
    expect(indexSettingsFn, '重试必须重跑 scan').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('B8：有旧快照重扫失败 → err-bar 在且 io-body 保留（不再 snap=null）', async () => {
    const { app, host } = await mountView(IndexOptimizerView, '#/index-optimizer?idx=logs');
    expect(host.querySelector('.io-body'), '首扫成功必须出结果区').toBeTruthy();
    expect(host.textContent).toContain('refresh_interval');
    indexSettingsFn.mockRejectedValue(new Error('timeout'));
    findBtn(host, '扫描')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '重扫失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('扫描失败');
    expect(host.querySelector('.io-body'), '失败时旧快照必须保留（修复前被 null 掉伪装空态）').toBeTruthy();
    expect(host.textContent, '旧建议必须保留').toContain('refresh_interval');
    app.unmount();
  });

  it('标题与 snap 同源：显快照实际索引名而非当前 target（复审 M1——URL idx=logs 但 snap key=logs-2026.08）', async () => {
    const { app, host } = await mountView(IndexOptimizerView, '#/index-optimizer?idx=logs');
    expect(host.querySelector('.io-body'), '首扫成功必须出结果区').toBeTruthy();
    expect(host.querySelector('.io-cur-sub')?.textContent, '标题必须显 snap 实际索引名——换 target 重扫失败时旧数据不顶新名').toBe('/logs-2026.08');
    app.unmount();
  });

  it('应用勾选防重入：in-flight 禁用 + 「下发中…」+ 不双发；确认门不绕过（askConfirm 1 次）', async () => {
    const { app, host } = await mountView(IndexOptimizerView, '#/index-optimizer?idx=logs');
    expect(host.querySelector('.io-body')).toBeTruthy();
    /* 扫描后默认勾选非 info 建议（refresh_interval warn）→ 应用按钮可用 */
    const applyBtn = findBtn(host, '应用勾选')!;
    expect(applyBtn.disabled, '有默认勾选时必须可用').toBe(false);
    updateIndexSettingsFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟 in-flight */ }));
    applyBtn.click();
    await settle(3);
    expect(askConfirmFn, '必须先过确认门').toHaveBeenCalledTimes(1);
    expect(updateIndexSettingsFn).toHaveBeenCalledTimes(1);
    expect(applyBtn.disabled, 'in-flight 期间按钮必须禁用').toBe(true);
    expect(applyBtn.textContent, 'in-flight 期间必须出 pending 文案').toContain('下发中');
    applyBtn.click();
    await settle(3);
    expect(updateIndexSettingsFn, 'in-flight 期间重复点击不许双发').toHaveBeenCalledTimes(1);
    expect(askConfirmFn, '重复点击不许再过确认门').toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('默认进入（URL 无 idx）→ 不自动扫描，引导空态在（MANUAL_WORKBENCH 分类依据锁）', async () => {
    const { app, host } = await mountView(IndexOptimizerView, '#/index-optimizer');
    expect(indexSettingsFn, '默认进入不许自动扫描').not.toHaveBeenCalled();
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.empty-state'), '真空必须出 EmptyState 组件').toBeTruthy();
    expect(host.textContent).toContain('尚未扫描任何索引');
    app.unmount();
  });
});

describe('G6 TemplateGalleryView：画廊卡片页过滤三态', () => {
  it('默认渲染卡片网格；过滤致空 → EmptyState + 清除逃生口恢复', async () => {
    const { app, host } = await mountView(TemplateGalleryView, '#/template-gallery');
    const before = host.querySelectorAll('.tg-card').length;
    expect(before, '默认必须渲染模板卡片').toBeGreaterThan(0);
    const inp = host.querySelector<HTMLInputElement>('.tg-search input')!;
    inp.value = 'zzzzz-no-match';
    inp.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelectorAll('.tg-card').length, '过滤致空必须无卡片').toBe(0);
    expect(host.querySelector('.empty-state'), '过滤致空必须出 EmptyState').toBeTruthy();
    expect(host.textContent).toContain('未找到匹配模板');
    findBtn(host, '清除搜索与分类')!.click();
    await settle();
    expect(host.querySelectorAll('.tg-card').length, '清除后卡片必须恢复').toBe(before);
    app.unmount();
  });
});
