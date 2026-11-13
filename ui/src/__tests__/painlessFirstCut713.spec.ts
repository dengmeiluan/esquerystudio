/**
 * 七百一十三批：PainlessLab 首刀=G50+G51「结果区状态卫生+spinner 语义」
 * （R93 裁决表头号；G52 a11y 双 aria-label+G53 页头家族死样式清随刀）。
 * - G50（P2）：切模板/切已存储脚本后结果区错误残留——loadTpl 清 result 不清 runErr、
 *   pickStored 双不清（R93 读数铁证：造 500 后点算术模板旧错误 JSON 仍挂结果区，
 *   与新载脚本无对应关系误导，铁律 D）→ 两函数补 runErr/result 双清（runErrRaw
 *   旁路留存随错误态同生命周期一并清，与 run() 起手三清对称）。
 * - G51（P3）：页头刷新钮 spinner 语义错位——:class="{spinning:busy}" 绑试跑在途
 *   而非 storedLoading（同钮 :disabled=storedLoading 双语义分裂）→ spinning 改绑
 *   storedLoading。
 * - G52（P3 a11y）：context select 无 aria-label+stored 行 X 删除 icon-only 钮无
 *   aria-label（raw-io 钮有 aria 对照）。
 * - G53（P3）：.pl-hd 五类家族（含 900 档 flex-wrap）=模板已用 PageHeader 无对应
 *   元素死样式，PluginsView 五百二十七批 W-F 同款删除先例。
 *
 * 设施：painlessAdjustW2 范式（MonacoEditor stub+api 出口可变 mock+settle 链）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const painlessExecuteFn = vi.fn();
const listStoredScriptsFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      painlessExecute: (...a: any[]) => painlessExecuteFn(...a),
      listStoredScripts: (...a: any[]) => listStoredScriptsFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
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

import PainlessLabView from '../views/PainlessLabView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  location.hash = '#/painless-lab';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/update-by-query', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(PainlessLabView) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: ParentNode, text: string): HTMLButtonElement {
  const b = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => (b.textContent || '').includes(text));
  expect(b, `「${text}」钮必须在场`).toBeTruthy();
  return b!;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  listStoredScriptsFn.mockResolvedValue({ scripts: {} });
  painlessExecuteFn.mockReset();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('G50：切输入源后结果区状态卫生（铁律 D 状态不误导）', () => {
  it('① 失败试跑挂错误 → 点模板 → 旧错误移除回空态（loadTpl 清 runErr）', async () => {
    const host = await mountView();
    painlessExecuteFn.mockRejectedValue(new Error('PROBE_ERR: 500'));
    findBtn(host, '试跑').click();
    await settle();
    const errOut = host.querySelector('.pl-out.err');
    expect(errOut, '失败试跑后错误态必须在场（前置）').toBeTruthy();
    findBtn(host, '算术').click();
    await settle();
    expect(host.querySelector('.pl-out'), '切模板后旧错误必须移除').toBeNull();
    expect(host.textContent, '回空态引导文案').toContain('点击「试跑」运行脚本');
  });

  it('② 成功试跑挂结果 → 点已存储脚本行 → 旧结果移除（pickStored 清 result）', async () => {
    listStoredScriptsFn.mockResolvedValue({ scripts: { probe_1: { lang: 'painless', source: 'return 1;' } } });
    const host = await mountView();
    painlessExecuteFn.mockResolvedValue({ result: 42 });
    findBtn(host, '试跑').click();
    await settle();
    expect(host.querySelector('.pl-out:not(.err)'), '成功试跑后结果必须在场（前置）').toBeTruthy();
    const row = host.querySelector('.pl-stored');
    expect(row, 'stored 行必须在场（前置）').toBeTruthy();
    row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(host.querySelector('.pl-out'), '切已存储脚本后旧结果必须移除').toBeNull();
  });

  it('③ 失败试跑挂错误 → 点已存储脚本行 → 旧错误移除（pickStored 清 runErr）', async () => {
    listStoredScriptsFn.mockResolvedValue({ scripts: { probe_1: { lang: 'painless', source: 'return 1;' } } });
    const host = await mountView();
    painlessExecuteFn.mockRejectedValue(new Error('PROBE_ERR: 500'));
    findBtn(host, '试跑').click();
    await settle();
    expect(host.querySelector('.pl-out.err'), '失败试跑后错误态必须在场（前置）').toBeTruthy();
    host.querySelector('.pl-stored')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(host.querySelector('.pl-out'), '切已存储脚本后旧错误必须移除').toBeNull();
  });

  it('④ 源码锁：loadTpl/pickStored 两函数 runErr/result 双清（与 run() 起手三清对称）', () => {
    const v = readFileSync(join(__dirname, '../views/PainlessLabView.vue'), 'utf-8');
    /* 窗口 400（612-C1 余量 ≥50%：两函数体内含批注与既有赋值） */
    expect(v, 'loadTpl 补 runErr 清理').toMatch(/function loadTpl\(t: any\) \{[\s\S]{0,400}runErr\.value = '';/);
    expect(v, 'pickStored 补 result/runErr 双清').toMatch(/function pickStored\(s: any\) \{[\s\S]{0,400}result\.value = ''[\s\S]{0,200}runErr\.value = '';/);
  });
});

describe('G51：页头刷新钮 spinner 语义归位（绑定 storedLoading 非 busy）', () => {
  it('⑤ 试跑在途刷新钮不转；刷新在途刷新钮转', async () => {
    const host = await mountView();
    const refresh = findBtn(host, '刷新');
    const svg = () => refresh.querySelector('svg')!;
    /* 试跑在途（busy=true）:刷新钮不应 spinning */
    painlessExecuteFn.mockReturnValue(new Promise(() => {}));
    findBtn(host, '试跑').click();
    await settle();
    expect(refresh.disabled, '试跑在途刷新钮可点（disabled 归 storedLoading）').toBe(false);
    expect(svg().classList.contains('spinning'), '试跑在途刷新钮不得转（spinner 语义=列表刷新）').toBe(false);
    /* 刷新在途（storedLoading=true）:刷新钮应 spinning */
    listStoredScriptsFn.mockReturnValue(new Promise(() => {}));
    refresh.click();
    await settle();
    expect(refresh.disabled, '刷新在途钮禁用防重入').toBe(true);
    expect(svg().classList.contains('spinning'), '刷新在途刷新钮必须转').toBe(true);
  });

  it('⑥ 源码锁：spinning 绑 storedLoading，busy 绑定退役', () => {
    const v = readFileSync(join(__dirname, '../views/PainlessLabView.vue'), 'utf-8');
    expect(v).toMatch(/:class="\{ spinning: storedLoading \}"/);
    expect(v, 'spinning: busy 语义错位绑定退役').not.toMatch(/spinning:\s*busy/);
  });
});

describe('G52：a11y 双 aria-label（context select+X 删除 icon-only 钮）', () => {
  it('⑦ context select aria-label=执行上下文；X 删除钮 aria-label 含脚本 id', async () => {
    listStoredScriptsFn.mockResolvedValue({ scripts: { probe_1: { lang: 'painless', source: 'return 1;' } } });
    const host = await mountView();
    const sel = host.querySelector('select.pl-sel');
    expect(sel, 'context select 必须在场').toBeTruthy();
    expect(sel!.getAttribute('aria-label')).toBe('执行上下文');
    const x = host.querySelector('.pl-stored-x');
    expect(x, 'X 删除钮必须在场（canOps 测试态默认 true）').toBeTruthy();
    expect(x!.getAttribute('aria-label'), 'X 删除钮 aria-label 含目标脚本 id').toContain('probe_1');
  });
});

describe('G53：页头家族死样式清（模板已用 PageHeader，无对应元素）', () => {
  it('⑧ 源码锁：.pl-hd 五类规则家族（含 900 档 flex-wrap）零残留', () => {
    const v = readFileSync(join(__dirname, '../views/PainlessLabView.vue'), 'utf-8');
    expect(v, '页头家族规则定义必须退役（PluginsView 五百二十七批同款先例）')
      .not.toMatch(/\.pl-hd(-l|-ic|-tt|-sub)?\s*\{/);
  });
});
