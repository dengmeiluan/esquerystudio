/**
 * 七百五十三批：QueryXray 首刀三小刀（R134；R133 裁决表 G190+G191+G192）。
 *
 * ① G190（P3 铁律 D·头号）透视/取证双钮 Play 图标在途窗零 spinning 零文案切换
 *    （752 S-G190 实锚：cls="lucide lucide-play-icon"+anim=none+文案恒「透视」；
 *    disabled 既有=半合规）——修法=图标补 spinning 全局类+文案「透视中…/取证中…」
 *    切换（751 G185/747 G161/743 G153 族）。
 * ② G191（P3 铁律 F·次刀）tv 输入行 doc _id/fields label 裸英文+qx-fstat 统计
 *    无中文释义（752 S-G191 实锚 tips=["",""]）——修法=span 补 title 悬停中文
 *    （745 G156/737 G133 双语同款：英文键留检索、悬浮层中文语义）。
 * ③ G192（弱 P3 aria 随批可裁）qx-tabs 容器无 role=group/aria-label、双 tab 无
 *    aria-pressed（752 S-G192 实锚 [null,null]）——修法=容器补语义+双钮动态
 *    pressed（749 G158/747 G164/743 G154 族三行刀）。
 *
 * 设施照抄 qxTvTools525（vue-router 轻 mock+api mock+MonacoEditor stub）；
 * deferred 桶照 743（validateQuery/termVectors 各自挂起桶供在途窗实读）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const routeMock = { path: '/query-xray', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup() { return () => h('div', { class: 'monaco-host' }); },
    }),
  };
});

/* 在途窗可控：validate/termVectors 各自 deferred 桶（busy 共享但双 tab 互斥渲染） */
const validateFn = vi.fn();
const termVectorsFn = vi.fn();
const pendingVq: Array<(v: any) => void> = [];
const pendingTv: Array<(v: any) => void> = [];
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      validateQuery: (...a: any[]) => validateFn(...a),
      termVectors: (...a: any[]) => termVectorsFn(...a),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ raw: { properties: { title: { type: 'text' } } } }),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import QueryXrayView from '../views/QueryXrayView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView() {
  const app = createApp({ render: () => h(QueryXrayView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

/* 切到词频取证 tab（默认 rewrite） */
async function gotoTvTab(host: HTMLElement) {
  const tab = Array.from(host.querySelectorAll<HTMLElement>('.qx-tab'))
    .find(b => (b.textContent || '').includes('词频取证'));
  expect(tab, '词频取证 tab 必须存在').toBeTruthy();
  tab!.click();
  await settle(4);
}

const VQ_OK = { valid: true, explanations: [{ index: 'probe-a', explanation: 'match (your_field:关键词)' }] };
const TV_OK = { found: true, term_vectors: { title: { field_statistics: { doc_count: 1000, sum_ttf: 5200 }, terms: { t01: { term_freq: 3, doc_freq: 10, ttf: 40 } } } } };

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  /* useIdxState follow 读全局 picked 索引（localStorage 键）——种 probe-a 解禁透视钮 */
  localStorage.setItem('es_picked', 'probe-a');
  pendingVq.length = 0;
  pendingTv.length = 0;
  validateFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendingVq.push(res); }));
  termVectorsFn.mockReset().mockImplementation(() => new Promise<any>(res => { pendingTv.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

/* 透视执行钮：rewrite tab 下唯一 primary qx-run（改写透视 tab 钮文本同尾字，正则不可用） */
function runBtn(host: HTMLElement): HTMLButtonElement {
  const btn = host.querySelector('button.btn.primary.qx-run') as HTMLButtonElement;
  expect(btn, '透视执行钮必须存在').toBeTruthy();
  return btn!;
}
/* 取证执行钮：tv tab 下唯一 .btn.primary.sm（525 批同款锚；busy 态文本「取证中…」子串匹配仍稳） */
function tvBtn(host: HTMLElement): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('.btn.primary.sm'))
    .find(b => (b.textContent || '').replace(/\s+/g, '').includes('取证'));
  expect(btn, '取证执行钮必须存在').toBeTruthy();
  return btn!;
}

describe('753 A0 挂载不变量负锚（现状即守卫）', () => {
  it('title+R32 副题+双 tab+Query DSL 卡+透视钮+原始 IO 钮+空态恒定', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('查询 X 光');
    expect(host.textContent).toContain('_validate');
    expect(host.textContent).toContain('_termvectors');
    expect(host.textContent).toContain('改写透视');
    expect(host.textContent).toContain('词频取证');
    expect(host.textContent).toContain('Query DSL');
    expect(runBtn(host)).toBeTruthy();
    expect(host.querySelector('[data-test="raw-io"]'), '原始 IO 钮（透视通道）').toBeTruthy();
    expect(host.textContent).toContain('尚未改写查询');
  });
});

describe('753 G190 透视/取证双钮在途窗 spinning+文案（铁律 D·751 G185 同族）', () => {
  it('透视链：在途窗 disabled（既有）+spinning+「透视中…」（G190 病灶：修前零）；复常三通道移除+结论呈现', async () => {
    const host = await mountView();
    const btn = runBtn(host);
    expect(btn.disabled, 'es_picked 已种 → 透视钮解禁').toBe(false);
    btn.click();
    await settle(4);
    expect(validateFn.mock.calls.length).toBe(1);
    expect(btn.disabled, '防重入既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G190 病灶：在途窗零 spinning').toBeTruthy();
    expect((btn.textContent || '').includes('透视中…'), 'G190 病灶：文案恒「透视」').toBe(true);
    pendingVq[0](VQ_OK);
    await settle(8);
    expect(btn.querySelector('.spinning'), '复常 spinning 移除').toBeFalsy();
    expect(btn.disabled, '复常解禁').toBe(false);
    expect((btn.textContent || '').includes('透视中…'), '复常文案回退').toBe(false);
    expect(host.textContent).toContain('查询合法');
  });

  it('取证链：在途窗 disabled（既有）+spinning+「取证中…」（G190 病灶：修前零）；复常移除+字段卡呈现', async () => {
    const host = await mountView();
    await gotoTvTab(host);
    const idInp = host.querySelector('input.qx-ii.wide') as HTMLInputElement;
    idInp.value = 'doc-753';
    idInp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(4);
    const btn = tvBtn(host);
    btn.click();
    await settle(4);
    expect(termVectorsFn.mock.calls.length).toBe(1);
    expect(btn.disabled, '防重入既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G190 病灶：在途窗零 spinning').toBeTruthy();
    expect((btn.textContent || '').includes('取证中…'), 'G190 病灶：文案恒「取证」').toBe(true);
    pendingTv[0](TV_OK);
    await settle(12);
    expect(btn.querySelector('.spinning'), '复常 spinning 移除').toBeFalsy();
    expect((btn.textContent || '').includes('取证中…'), '复常文案回退').toBe(false);
    expect(host.textContent).toContain('title');
    expect(host.textContent).toContain('doc_count');
  });
});

describe('753 G191 tv 输入行 label+qx-fstat 中文释义（铁律 F·745 G156 双语同款）', () => {
  it('doc _id/fields 两 label span title 悬停中文（G191 病灶：修前 tips=["",""]）', async () => {
    const host = await mountView();
    await gotoTvTab(host);
    const spans = Array.from(host.querySelectorAll('.qx-inp > span')) as HTMLElement[];
    expect(spans.length, '两输入行 label').toBe(2);
    const t1 = spans[0]!.getAttribute('title') || '';
    const t2 = spans[1]!.getAttribute('title') || '';
    expect(t1.includes('文档'), 'doc _id label 中文释义').toBe(true);
    expect(t2.includes('字段'), 'fields label 中文释义').toBe(true);
  });

  it('qx-fstat 统计行 title 含 doc_count/sum_ttf 中文释义（G191 病灶：修前 title 空）', async () => {
    const host = await mountView();
    await gotoTvTab(host);
    const idInp = host.querySelector('input.qx-ii.wide') as HTMLInputElement;
    idInp.value = 'doc-753';
    idInp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(4);
    tvBtn(host).click();
    await settle(4);
    pendingTv[0](TV_OK);
    await settle(12);
    const fstat = host.querySelector('.qx-fstat') as HTMLElement;
    expect(fstat, 'qx-fstat 在场（取证结果渲染后）').toBeTruthy();
    const t = fstat.getAttribute('title') || '';
    expect(t.includes('doc_count'), 'doc_count 键留检索').toBe(true);
    expect(t.includes('sum_ttf'), 'sum_ttf 键留检索').toBe(true);
    expect(t.includes('文档总数') || t.includes('总数'), 'doc_count 中文释义').toBe(true);
    expect(t.includes('词频总和') || t.includes('总和'), 'sum_ttf 中文释义').toBe(true);
  });
});

describe('753 G192 qx-tabs aria（749 G158/743 G154 同族·随批可裁）', () => {
  it('容器 role=group+aria-label；双 tab aria-pressed 随切换精确翻转（G192 病灶：修前全 null）', async () => {
    const host = await mountView();
    const tabs = host.querySelector('.qx-tabs') as HTMLElement;
    expect(tabs.getAttribute('role'), '容器语义').toBe('group');
    expect(tabs.getAttribute('aria-label'), '容器可读名').toBeTruthy();
    const btns = Array.from(tabs.querySelectorAll('button'));
    expect(btns.length).toBe(2);
    expect(btns[0].getAttribute('aria-pressed'), 'rewrite 默认 on').toBe('true');
    expect(btns[1].getAttribute('aria-pressed'), 'tv 默认 off').toBe('false');
    btns[1].click();
    await settle(4);
    expect(btns[0].getAttribute('aria-pressed'), '切 tv 后 rewrite off').toBe('false');
    expect(btns[1].getAttribute('aria-pressed'), '切 tv 后 tv on').toBe('true');
  });
});
