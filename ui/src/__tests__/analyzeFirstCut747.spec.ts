/**
 * 七百四十七批：Analyze 首刀四小刀（R128；⑥746 头号建议落地=R127 裁决表
 * G162+G161+G165+G164；741 G148/743 G152/745 五刀族同构）。
 *
 * ① G162（P3 铁律 F·头号）全页无 RawIo 原始请求/响应入口（746 S-G162 全页零命中
 *    实锚；741 G148 Plugins 同族缺位；对照面=RankDebug/ReindexAdvanced 三件套在场）
 *    ——修法=RawIoModal rim 族复用：运行后 /cluster/analyze 请求体/响应 tokens 原文
 *    直达+Terminal 图标钮+判空 toast 引导不开空弹窗（RankDebug 548 批三件套同构）。
 * ② G161（P3 铁律 D·次刀）运行钮 Play 在途窗 disabled 既有而零 spinning（746
 *    S-G161 三读实锚；721 G73/737 G132/741 G147/743 G153 族）——修法=图标补
 *    spinning 全局类。
 * ③ G165（P3 文案卫生）空态 hint「左侧选 analyzer 与文本」与 body Monaco 手写实现
 *    表述张力（746 S-G165 三跑实锚；742 G155 族弱形态）——修法=hint 微调对齐实现
 *    （body 手写 JSON、预设 chips 在上方工具栏）。
 * ④ G164（弱 P3 aria 随批可裁）.av-presets 容器无 role=group、8 chips 无
 *    aria-pressed（G142/G154/G158 族）——修法=容器补语义+chips 动态 pressed。
 *
 * 驱动方式照 reindexAdvancedFirstCut745（视图/组件全真+只 mock ../api+Monaco stub
 * ——Monaco 内核 happy-dom canvas 崩）；es_picked 种 probe-a 走 useIdxState follow。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { RawIoRec } from '../api';

const src = readFileSync(join(__dirname, '../views/AnalyzeView.vue'), 'utf-8');

/* ---- 网络出口 mock：reindexAdvancedFirstCut745 同源（视图/组件全真） ---- */
const analyzeFn = vi.fn();
const pending: Array<(v: any) => void> = [];
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analyze: (...args: any[]) => analyzeFn(...args),
      analysisSettings: () => Promise.resolve({ analysis: {} }),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
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

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745 spec 同款；AnalyzeView 走
   v-model+@keydown+dsl-assist，stub 不驱动编辑器内容，默认稿即标准合法 body） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import AnalyzeView from '../views/AnalyzeView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(AnalyzeView as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: ParentNode, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

/* 模拟真实 fetch 包装层的记录环行为：resolve 同拍落一条 /cluster/analyze 记录
   （api.ts recordIo 语义），供 RawIoModal 直达链读到 */
const STD_BODY = '{\n  "analyzer": "standard",\n  "text": "The quick brown fox jumps over the lazy dog"\n}';
const TOKENS_9 = Array.from({ length: 9 }, (_, i) => ({ token: 'tk' + i, start_offset: i * 2, end_offset: i * 2 + 2, position: i, type: '<ALPHANUM>' }));
function releaseAnalyze(resp: any, url = '/cluster/analyze?index=probe-a') {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'POST', url, requestBody: STD_BODY, status: 200, ok: true, durationMs: 5, responseRaw: JSON.stringify(resp) });
  pending[0](resp);
}

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
  ioSeq = 0;
  analyzeFn.mockReset().mockImplementation(() => new Promise<any>(res => { pending.push(res); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('747 A0 挂载不变量负锚（现状即守卫）', () => {
  it('页头+目标索引行+8 预设·standard 点亮+POST 路径 hint+运行钮+右 pane 空态', async () => {
    const host = await mountView();
    expect(host.textContent).toContain('分词验证（Analyze）');
    expect(host.textContent).toContain('目标索引');
    const presets = host.querySelector('.av-presets');
    expect(presets, '预设组容器在场').toBeTruthy();
    expect(presets!.querySelectorAll('button').length, '8 预设 chips').toBe(8);
    expect(presets!.querySelector('.chip.on')!.textContent!.trim(), 'standard 默认点亮').toBe('standard');
    expect(host.textContent).toContain('POST /probe-a/_analyze');
    expect(findBtn(host, /运行/)).toBeTruthy();
    expect(host.textContent).toContain('运行请求后显示 token 列表');
  });

  it('运行链健康面：run 成功→tokens 计数呈现（QRT 内核渲染）', async () => {
    const host = await mountView();
    findBtn(host, /运行/).click();
    await settle(4);
    releaseAnalyze({ tokens: TOKENS_9 });
    await settle(10);
    expect(host.textContent).toContain('9 tokens');
  });
});

describe('747 G161 运行钮在途窗 spinning（铁律 D·743 G153 同族）', () => {
  it('运行链：在途窗 disabled（既有）+spinning（G161 病灶：修前零）；复常 spinning 移除+骨架屏→tokens 呈现', async () => {
    const host = await mountView();
    const btn = findBtn(host, /运行/);
    expect(btn.querySelector('.spinning'), '负锚：待机零 spinning').toBeFalsy();
    btn.click();
    await settle(4);
    expect(analyzeFn.mock.calls.length, '单发').toBe(1);
    expect(btn.disabled, '防重入既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G161 病灶：在途窗零 spinning').toBeTruthy();
    expect(host.querySelector('.av-tokens'), '骨架屏在场（既有）').toBeTruthy();
    releaseAnalyze({ tokens: TOKENS_9 });
    await settle(8);
    expect(btn.querySelector('.spinning'), '复常移除').toBeFalsy();
    expect(btn.disabled, '复常解禁').toBe(false);
    expect(host.textContent).toContain('9 tokens');
  });

  it('失败链复常：spinning 移除+err-bar 呈现（不落死转）', async () => {
    const host = await mountView();
    const btn = findBtn(host, /运行/);
    btn.click();
    await settle(4);
    pending[0](Promise.reject(new Error('index_not_found_exception')));
    await settle(8);
    expect(btn.querySelector('.spinning'), '失败复常移除').toBeFalsy();
    expect(host.querySelector('.err-bar'), '错误条在场').toBeTruthy();
  });
});

describe('747 G162 RawIo 三件套（铁律 F·头号·RankDebug 548 批同构）', () => {
  it('三件套接线源码锁：RawIoModal 组件+ioRecorder 取 /cluster/analyze+Terminal 图标钮', () => {
    expect(src.includes("import RawIoModal from '../components/RawIoModal.vue';"), '弹窗组件接入').toBe(true);
    expect(src.includes("ioRecorder.last('/cluster/analyze')"), '按页端点取最近记录').toBe(true);
    expect(src.includes('<Terminal'), 'Terminal 图标钮').toBe(true);
  });

  it('判空链：无记录点「原始 IO」→不开空弹窗（toast 引导）', async () => {
    const host = await mountView();
    findBtn(host, /原始IO/).click();
    await settle(4);
    expect(document.querySelector('.rim'), '无记录不开弹窗').toBeFalsy();
  });

  it('直达链：run 后点「原始 IO」→弹窗开+url 含 /cluster/analyze+请求/响应两分节', async () => {
    const host = await mountView();
    findBtn(host, /运行/).click();
    await settle(4);
    releaseAnalyze({ tokens: TOKENS_9 });
    await settle(8);
    findBtn(host, /原始IO/).click();
    await settle(6);
    const rim = document.querySelector('.rim');
    expect(rim, '弹窗开（teleport to body）').toBeTruthy();
    expect(rim!.textContent).toContain('/cluster/analyze');
    expect(rim!.textContent).toContain('原始请求');
    expect(rim!.textContent).toContain('原始响应');
  });
});

describe('747 G164 预设组 aria（G142/G154/G158 族·随批可裁）', () => {
  it('容器 role=group+aria-label；8 chips aria-pressed 随 activePreset 精确翻转', async () => {
    const host = await mountView();
    const group = host.querySelector('.av-presets') as HTMLElement;
    expect(group.getAttribute('role'), '容器语义').toBe('group');
    expect(group.getAttribute('aria-label'), '容器可读名').toBe('分词器预设');
    const chips = Array.from(group.querySelectorAll('button'));
    expect(chips.length).toBe(8);
    expect(chips[0].getAttribute('aria-pressed'), 'standard 默认 on').toBe('true');
    expect(chips[1].getAttribute('aria-pressed'), 'ik_smart 默认 off').toBe('false');
    chips[1].click();
    await settle(4);
    expect(chips[0].getAttribute('aria-pressed'), '切 ik_smart 后 standard off').toBe('false');
    expect(chips[1].getAttribute('aria-pressed'), '切 ik_smart 后 on').toBe('true');
  });
});

describe('747 G165 空态 hint 文案对齐（R64 帮用户 1 秒选对通道）', () => {
  it('hint 与实现对齐：指向手写 body 与上方预设（不再「选 analyzer」）；「运行」与按钮实文一致', async () => {
    const host = await mountView();
    const hint = host.querySelector('.es-hint');
    expect(hint, '空态 hint 在场（EmptyState 统一件）').toBeTruthy();
    const t = (hint!.textContent || '').trim();
    expect(t.includes('选 analyzer'), '旧表述与 body Monaco 手写实现张力（G165 病灶）').toBe(false);
    expect(t).toContain('上方预设');
    expect(t).toContain('「运行」');
  });
});
