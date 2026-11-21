/**
 * 七百七十九批：一键集群体检 HealthReport 深耕档小刀巡查三族收官（R159；⑥778 头号
 * 建议落地=深耕档 RawIo/spinning/aria 三族横扫续查收官——776 Browser+777 Tasks+
 * 778 System 已收口，本页=候选收窄后剩余唯一「RawIo 零在场」深耕页〔696 行·26 锚；
 * 监控轮 R18~R20/R32 探活历史≠三族复查〕；775/777/778 首刀族同构）。
 *
 * ① G263（P3 铁律 F·头名）全页无 RawIo 原始请求/响应入口（体检通道
 *    GET /cluster/health-report 无原文直达；777 G255/778 G259/755 G200 同族）——
 *    修法=三件套（Terminal 钮+判空 toast 引导+直达弹窗），端点锚
 *    '/cluster/health-report'（本页单一 GET 通道，无读写端点混淆面）。
 * ② G264（P3 铁律 D·裁决不立刀）主钮「开始体检」RefreshCcw spin+「扫描中…」
 *    双态既有合规；err-bar 重试钮纯文本+run() 入口清型（runErr='' 起手清）=
 *    778 约定适用页（重试起手容器即卸载，刀面渲染不可见）；在途反馈由
 *    hr-load 进度条+主钮 spin 承接——本组只做现状守卫锁豁免语义。
 * ③ G265（弱 P3 aria/铁律 F 弱刀·随批可裁）hr-load 在途区无 role=status
 *    （G224/G229/G235 异步状态语义族；776 bw-foot 同族）+hero 行「Pending Tasks」
 *    英文 label 无中文 title（G55/G60/G74/G79 族）。
 * ④ G266（P3 死代码·静态核对）scoped 死名单空（527 批已清 hr-hd-* 四死类）——
 *    负向锁守卫干净面。
 *
 * 驱动方式照 systemThreeFamily778（视图/组件全真+只 mock ../api+ioRecorder
 * 记录环 mock；本页无 Monaco、onMounted 零网络调用——挂载即空态，体检由
 * 点「开始体检」触发，受控时序用 res/rej 双通道池）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { RawIoRec } from '../api';

const src = readFileSync(join(__dirname, '../views/HealthReportView.vue'), 'utf-8');

/* ---- 网络出口 mock：systemThreeFamily778 同源（视图/组件全真） ---- */
const healthReportFn = vi.fn();
/* 受控时序用 res/rej 双通道池（run() 是纯赋值+sessionStorage 写，无 .map 间接
   TypeError 通道——失败态须真 reject，777/778 同款） */
type Settle = { res: (v: any) => void; rej: (e: any) => void };
const reportPending: Settle[] = [];
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      healthReport: (...args: any[]) => healthReportFn(...args),
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（735 批课约定；743/745/747/755/777/778
   spec 同款）——本页经 RawIoModal 两分节只读查看器引入 */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import HealthReportView from '../views/HealthReportView.vue';

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
  const app = createApp({ render: () => h(HealthReportView as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: ParentNode, re: RegExp, scope?: ParentNode): HTMLButtonElement {
  const btn = Array.from((scope ?? host).querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

const REPORT_779 = {
  score: 87,
  generatedAt: '2026-10-07T07:30:00.000Z',
  summary: { status: 'green', unassigned: 0, initializing: 0, relocating: 0, pending: 3, unhealthyIndices: 2, nodes: 3, hotNodes: 1 },
  checks: [
    { level: 'info', name: 'cluster_status', message: '集群状态 green' },
    { level: 'warn', name: 'pending_tasks', message: '待处理任务 3 个' },
  ],
  unhealthyIndices: [
    { index: 'orders-v9', health: 'yellow', pri: 3, rep: 1, 'docs.count': 1234, 'store.size': '12kb' },
    { index: 'logs-x', health: 'red', pri: 2, rep: 0, 'docs.count': 567, 'store.size': '8kb' },
  ],
  nodes: [
    { name: 'node-1', 'heap.percent': 71, cpu: 12, load_1m: 1.2, 'disk.used_percent': 60, 'ram.percent': 55 },
    { name: 'node-2', 'heap.percent': 45, cpu: 8, load_1m: 0.8, 'disk.used_percent': 42, 'ram.percent': 48 },
  ],
  allocationExplain: { can_allocate: 'no', unassigned_info: { reason: 'NODE_LEFT' } },
};

/* 模拟真实 fetch 包装层的记录环行为：resolve 同拍落一条记录（api.ts recordIo 语义） */
function releaseReport(info: any = REPORT_779) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url: '/cluster/health-report', requestBody: '', status: 200, ok: true, durationMs: 34, responseRaw: JSON.stringify(info) });
  reportPending.shift()!.res(info);
}
function failReport(e: any = new Error('network down')) { reportPending.shift()!.rej(e); }

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  reportPending.length = 0;
  ioRing.length = 0;
  ioSeq = 0;
  healthReportFn.mockReset().mockImplementation(() => new Promise<any>((res, rej) => { reportPending.push({ res, rej }); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('779 A0 挂载不变量现状守卫', () => {
  it('挂载零网络调用+页头「一键集群体检」+三钮+EmptyState 空态', async () => {
    const host = await mountView();
    expect(healthReportFn, '挂载不自动体检（onMounted 只读 storage）').not.toHaveBeenCalled();
    expect((host.textContent || '')).toContain('一键集群体检');
    expect(findBtn(host, /复制MD/), '复制 MD 钮在场').toBeTruthy();
    expect(findBtn(host, /导出Markdown/), '导出 Markdown 钮在场').toBeTruthy();
    expect(findBtn(host, /开始体检/), '开始体检钮在场').toBeTruthy();
    expect((host.textContent || '')).toContain('尚未运行体检');
  });
});

describe('779 G263 RawIo 三件套（铁律 F·头名·778 G259 同构）', () => {
  it('三件套接线源码锁：RawIoModal 组件+ioRecorder 取 /cluster/health-report+Terminal 图标钮', () => {
    expect(src.includes("import RawIoModal from '../components/RawIoModal.vue';"), '弹窗组件接入').toBe(true);
    expect(src.includes("ioRecorder.last('/cluster/health-report')"), '按本页体检通道端点取最近记录').toBe(true);
    expect(src.includes('<Terminal'), 'Terminal 图标钮').toBe(true);
  });

  it('判空链：无记录点「原始 IO」→不开空弹窗（toast 引导）', async () => {
    const host = await mountView();
    findBtn(host, /原始IO/).click();
    await settle(4);
    expect(document.querySelector('.rim'), '无记录不开弹窗').toBeFalsy();
  });

  it('直达链：体检后点「原始 IO」→弹窗开+GET+/cluster/health-report+原始请求/响应两分节+关闭复原', async () => {
    const host = await mountView();
    findBtn(host, /开始体检/).click();
    await settle(4);
    releaseReport();
    await settle(8);
    findBtn(host, /原始IO/).click();
    await settle(6);
    const rim = document.querySelector('.rim');
    expect(rim, '弹窗开（teleport to body）').toBeTruthy();
    expect(rim!.textContent).toContain('/cluster/health-report');
    expect(rim!.textContent).toContain('GET');
    expect(rim!.textContent).toContain('原始请求');
    expect(rim!.textContent).toContain('原始响应');
    /* 关闭复原不断言 DOM 摘除：happy-dom transition leave 挂 DOM（559 批课「过渡滞留」
       同族；777/778 spec 同 precedent 不测关闭）——由真机 probe S-G263b 关闭链覆盖 */
  });
});

describe('779 G264 在途族现状守卫（主钮双态既有+重试豁免=778 约定锁）', () => {
  it('主钮双态现状守卫：在途窗 disabled+icon spin+「扫描中…」→复常双复位', async () => {
    const host = await mountView();
    const btn = findBtn(host, /开始体检/);
    expect(btn.disabled, '待机解禁').toBe(false);
    expect((btn.textContent || '').replace(/\s+/g, ''), '待机文案').toContain('开始体检');
    btn.click();
    await settle(4);
    expect(btn.disabled, '在途窗 disabled').toBe(true);
    expect(btn.querySelector('[class~="spin"]'), '在途窗 icon spin').toBeTruthy();
    expect((btn.textContent || '').replace(/\s+/g, ''), '在途文案').toContain('扫描中…');
    releaseReport();
    await settle(8);
    expect(btn.disabled, '复常解禁').toBe(false);
    expect(btn.querySelector('[class~="spin"]'), '复常 spin 移除').toBeFalsy();
    expect((btn.textContent || '').replace(/\s+/g, ''), '复常文案复位').toContain('开始体检');
  });

  it('重试链豁免口径守卫（778 约定）：失败 err-bar→点重试→入口清即移除+hr-load 承接', async () => {
    const host = await mountView();
    findBtn(host, /开始体检/).click();
    await settle(4);
    failReport();
    await settle(8);
    const errBar = host.querySelector('.err-bar');
    expect(errBar, '失败 err-bar 在场（role=alert）').toBeTruthy();
    expect(errBar!.getAttribute('role')).toBe('alert');
    expect((errBar!.textContent || '')).toContain('体检失败');
    const retry = findBtn(host, /重试/, errBar!);
    retry.click();
    await settle(4);
    expect(host.querySelector('.err-bar'), '重试起手入口清即移除（runErr=\'\' 起手清=778 约定）').toBeFalsy();
    expect(host.querySelector('.hr-load'), '在途反馈由 hr-load 进度条承接').toBeTruthy();
    releaseReport();
    await settle(8);
    expect((host.textContent || '').includes('87'), '过窗报告再现（得分 87）').toBe(true);
  });
});

describe('779 G265 aria/中文备注小刀（随批可裁）', () => {
  it('G265a：loading 在途区 role=status（异步状态语义，G224/G229/G235 族）', async () => {
    const host = await mountView();
    findBtn(host, /开始体检/).click();
    await settle(4);
    const load = host.querySelector('.hr-load');
    expect(load, '在途进度区在场').toBeTruthy();
    expect(load!.getAttribute('role'), 'role=status').toBe('status');
  });

  it('G265b：hero 行「Pending Tasks」label 中文 title（铁律 F，G55/G60/G79 族）', async () => {
    const host = await mountView();
    findBtn(host, /开始体检/).click();
    await settle(4);
    releaseReport();
    await settle(8);
    const span = Array.from(host.querySelectorAll('.hr-hero-row span'))
      .find(s => (s.textContent || '').trim() === 'Pending Tasks');
    expect(span, 'Pending Tasks label 在场').toBeTruthy();
    expect((span!.getAttribute('title') || ''), 'title 中文释义').toContain('待处理');
  });
});

describe('779 G266 干净面负向锁（527 批已清死类不回潮）', () => {
  it('原始 IO 钮恰一个+退役类名不回潮', async () => {
    const host = await mountView();
    expect(host.querySelectorAll('.hr-hd-r button').length, '页头动作组=四钮（复制 MD/导出/原始 IO/开始体检）').toBe(4);
    /* 行首规则定义锚：527 批删除备案注释中的字面（760 课① 注释域自伤族）不算回潮 */
    expect(/^\.hr-hd-(?:l|ic|tt|sub)\s*\{/m.test(src), '527 批退役死类不回潮').toBe(false);
  });
});
