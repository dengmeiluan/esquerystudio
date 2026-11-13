/**
 * 七百四十三批：RankDebug 首刀四小刀（R124；R123 裁决表 G152+G153+G155+G154）。
 *
 * ① G152（P3 死代码·头号）页头旧壳左组/图标/右组三死规则（742 S-G1 双实锚：
 *    styleSheets 1+1+1+DOM 0 引用；PageHeader 合并族漏删第 13 演）——三删+自然语言注记。
 * ② G153（P3 铁律 D）审问钮 Play/开战钮 Swords 在途窗 disabled 既有而零 spinning
 *    （742 S-G2 三读实锚；737 G132/741 G147 同族）——修法=图标补 spinning 全局类。
 * ③ G155（P3 文案卫生）空态 hint 指引「点『诊断』」而按钮实文「审问它」（742 S-G4
 *    三跑实锚；R64 帮用户 1 秒选对通道）——顺带修正 A/B 表述与实现对齐（runAb 是
 *    同一 query 对两个文档，非「两条查询对同一文档」）。
 * ④ G154（弱 P3 aria 随批可裁）模式 tab 容器无 role=group、双钮无 aria-pressed
 *    （739 G142 六模式钮同族）——修法=容器补语义+双钮动态 pressed。
 *
 * 驱动方式照 pluginsFirstCut741（vue-router 轻 mock+只 mock ../api+Monaco stub
 * ——JsonArea 内核 happy-dom canvas 崩）；es_picked 种 probe-a 走 useIdxState follow。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import type { RawIoRec } from '../api';

const src = readFileSync(join(__dirname, '../views/RankDebugView.vue'), 'utf-8');

const routeMock = { path: '/rank-debug', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* JsonArea 内核=Monaco——happy-dom canvas 崩（lifecycleFirstCut735 同款 stub；
   本 spec 不驱动编辑器内容，dsl 走默认模板草稿即可过 parseBody） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

/* explainDoc 可控 deferred 桶（731 G104b 课：多 Promise 按桶收集，单变量会被覆盖）；
   A/B 对决 Promise.all 双发=两桶先后释放 */
const explainFn = vi.fn();
const pending: Array<(v: any) => void> = [];
const ioRing: RawIoRec[] = [];
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      explainDoc: (...a: any[]) => explainFn(...a),
      mappingDetail: () => Promise.resolve({ raw: { properties: { title: { type: 'text' }, status: { type: 'keyword' } } } }),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

import RankDebugView from '../views/RankDebugView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const app = createApp({ render: () => h(RankDebugView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: HTMLElement, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

function setInput(host: HTMLElement, ph: string, val: string) {
  const el = Array.from(host.querySelectorAll<HTMLInputElement>('input'))
    .find(i => (i.placeholder || '').includes(ph));
  expect(el, `输入框必须存在：${ph}`).toBeTruthy();
  el!.value = val;
  el!.dispatchEvent(new Event('input', { bubbles: true }));
}

const EXPLAIN_OK = { matched: true, explanation: { value: 1.8734, description: 'weight(title:关键词 in 0) [PerFieldSimilarity], result of:', details: [
  { value: 1.8734, description: 'fieldWeight(title:关键词 in 0), product of:', details: [] },
] } };

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  /* 739 批课①：useIdxState follow 读全局 picked 索引（localStorage 键）——种 probe-a */
  localStorage.setItem('es_picked', 'probe-a');
  pending.length = 0;
  ioRing.length = 0;
  explainFn.mockReset().mockImplementation(() => new Promise<any>(res => { pending.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('743 A0 挂载不变量负锚（现状即守卫）', () => {
  it('title+双 tab+doc _id 输入行+审问钮实文+Query 卡+空态恒定', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('排名侦探');
    expect(findBtn(host, /Why-Not诊断/)).toBeTruthy();
    expect(findBtn(host, /A\/B对决/)).toBeTruthy();
    expect(host.textContent).toContain('doc _id');
    expect(host.textContent).toContain('审问它');
    expect(host.textContent).toContain('Query（只需 query 部分');
    expect(host.textContent).toContain('尚无诊断结果');
  });

  it('审问/开战钮 disabled 既有守卫：缺 id 禁、补 id 解禁', async () => {
    const host = await mountView();
    const why = findBtn(host, /审问它/);
    expect(why.disabled, 'why 缺 id 禁').toBe(true);
    setInput(host, '要审问的文档', 'doc-a');
    await settle(4);
    expect(findBtn(host, /审问它/).disabled, '补 id 解禁').toBe(false);
    findBtn(host, /A\/B对决/).click();
    await settle(4);
    const ab = findBtn(host, /开战/);
    expect(ab.disabled, 'ab 缺 id 禁').toBe(true);
    setInput(host, '排在前面的', 'doc-a');
    setInput(host, '想让它上位的', 'doc-b');
    await settle(4);
    expect(findBtn(host, /开战/).disabled, '补双 id 解禁').toBe(false);
  });
});

describe('743 G152 三死规则清零（P3 死代码·头号）', () => {
  it('页头旧壳左组/图标/右组三符号字面源码清零；活锚页头行容器保留', () => {
    expect(src.includes('.rd-hd-l'), '旧壳左组规则残留').toBe(false);
    expect(src.includes('.rd-hd-ic'), '旧壳图标规则残留').toBe(false);
    expect(src.includes('.rd-hd-r'), '旧壳右组规则残留').toBe(false);
    /* 活锚：页头行容器基础规则（承载 PageHeader+LabNav 双行布局）保留 */
    expect(src).toContain('.rd-hd {');
  });
});

describe('743 G153 审问/开战钮在途窗 spinning（铁律 D·737 G132 同族）', () => {
  it('审问链：在途窗 disabled（既有）+spinning（G153 病灶：修前零）+骨架屏；复常 spinning 移除+verdict 呈现', async () => {
    const host = await mountView();
    setInput(host, '要审问的文档', 'doc-a');
    await settle(4);
    const btn = findBtn(host, /审问它/);
    btn.click();
    await settle(4);
    expect(btn.disabled, '防重入既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G153 病灶：在途窗零 spinning').toBeTruthy();
    expect(host.querySelector('.rd-loading'), '骨架屏在场（R45 §1 既有）').toBeTruthy();
    pending[0](EXPLAIN_OK);
    await settle(8);
    expect(btn.querySelector('.spinning'), '复常移除').toBeFalsy();
    expect(btn.disabled, '复常解禁').toBe(false);
    expect(host.textContent).toContain('命中了！得分 1.8734');
  });

  it('开战链：在途窗双发双桶挂起+spinning；双释放后对决卡呈现', async () => {
    const host = await mountView();
    findBtn(host, /A\/B对决/).click();
    await settle(4);
    setInput(host, '排在前面的', 'doc-a');
    setInput(host, '想让它上位的', 'doc-b');
    await settle(4);
    const btn = findBtn(host, /开战/);
    btn.click();
    await settle(4);
    expect(explainFn.mock.calls.length, 'Promise.all 双发').toBe(2);
    expect(btn.disabled, '防重入既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G153 病灶：在途窗零 spinning').toBeTruthy();
    pending[0](EXPLAIN_OK);
    pending[1]({ matched: false, explanation: null });
    await settle(8);
    expect(btn.querySelector('.spinning'), '复常移除').toBeFalsy();
    expect(host.textContent).toContain('分差');
  });
});

describe('743 G154 模式 tab aria（739 G142 同族·随批可裁）', () => {
  it('容器 role=group+aria-label；双钮 aria-pressed 随模式精确翻转', async () => {
    const host = await mountView();
    const tabs = host.querySelector('.rd-tabs') as HTMLElement;
    expect(tabs.getAttribute('role'), '容器语义').toBe('group');
    expect(tabs.getAttribute('aria-label'), '容器可读名').toBeTruthy();
    const btns = Array.from(tabs.querySelectorAll('button'));
    expect(btns.length).toBe(2);
    expect(btns[0].getAttribute('aria-pressed'), 'why 默认 on').toBe('true');
    expect(btns[1].getAttribute('aria-pressed'), 'ab 默认 off').toBe('false');
    btns[1].click();
    await settle(4);
    expect(btns[0].getAttribute('aria-pressed'), '切 ab 后 why off').toBe('false');
    expect(btns[1].getAttribute('aria-pressed'), '切 ab 后 ab on').toBe('true');
  });
});

describe('743 G155 空态 hint 文案对齐（R64 帮用户 1 秒选对通道）', () => {
  it('hint 指引与按钮实文一致（「审问它」）；A/B 表述与实现对齐（同一 query 双文档）', async () => {
    const host = await mountView();
    const hint = host.querySelector('.es-hint');
    expect(hint, '空态 hint 在场').toBeTruthy();
    const t = (hint!.textContent || '').trim();
    expect(t).toContain('审问它');
    expect(t.includes('「诊断」'), '旧指引词与按钮实文不符（G155 病灶）').toBe(false);
    expect(t.includes('两条查询'), 'A/B 实为同一 query 双文档（顺带修正）').toBe(false);
  });
});
