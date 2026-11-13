/**
 * 七百七十八批：System 系统索引 深耕档小刀巡查三族（R158；⑥777 头号建议落地=
 * 深耕档 RawIo/spinning/aria 三族横扫续查——候选收窄核对：BulkEditor/SqlConsole/
 * Rest/Templates 四页 RawIo 三件套 545/546/561 批已在场=776 豁免先例族，SystemView
 * 全页零 RawIo+零 aria=「执行面+无兜底」最强候选；775/777 首刀族同构）。
 *
 * ① G259（P3 铁律 F·头名）全页无 RawIo 原始请求/响应入口（双数据通道
 *    inspect+query 均无原文直达；777 G255/755 G200 同族）——修法=三件套
 *    （Terminal 钮+判空 toast 引导+直达弹窗），端点锚 '/system-query?'（查询
 *    执行通道=本页主执行面；'? 前缀与 /system-inspect 读端点互不混淆'）。
 * ② G260（P3 铁律 D·次刀）执行钮 Play 单态无 spinning 无「执行中…」在途文案
 *    （running 骨架条在场=半合规；Play 在场=746 G161/766 G234 族适用）+
 *    err-bar 重试钮 RefreshCw 无 spinning（777 G256 同款两标准并存）+
 *    inspect-err 重试钮纯文本无文案通道（749 G171「下发中…」族）——修法=
 *    执行钮 Loader2/Play 双态+文案切换+重试钮补 spinning+inspect 重试钮
 *    「重试中…」文案通道。
 * ③ G261（弱 P3 aria·随批可裁）表格/JSON seg 双钮无 aria-pressed+容器无
 *    role=group（776 G254/DiffEditor 140 先例同构）——修法=容器 role=group+
 *    aria-label「结果展示形式」+双钮 :aria-pressed 随选中真翻转。
 * ④ G262（P3 死代码）.sy-run-row scoped 规则逐字双份（772 G245 .ell/.dim
 *    双份同族）——修法=去重恰留一。
 *
 * 驱动方式照 tasksThreeFamily777（视图/组件全真+只 mock ../api+Monaco stub
 * +真 memory router——SystemView 顶层 router.afterEach 老书签回落门依赖）；
 * SystemView 域首例真挂载首刀后 spec（既有 31 锚=单面快照/URL 态，本 spec 刀面
 * 零重叠）。挂载起手 onMounted 自动 loadInspect+run 双发——受控时序用双 pending 池。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { RawIoRec } from '../api';

const src = readFileSync(join(__dirname, '../views/SystemView.vue'), 'utf-8');

/* ---- 网络出口 mock：tasksThreeFamily777 同源（视图/组件全真） ---- */
const inspectFn = vi.fn();
const queryFn = vi.fn();
/* 受控时序用 res/rej 双通道池（SystemView run/loadInspect 是纯赋值无 .map 型 TypeError
   通道——777「resolve(Error) 间接入 catch」通道在此不成立，失败态须真 reject） */
type Settle = { res: (v: any) => void; rej: (e: any) => void };
const inspectPending: Settle[] = [];
const queryPending: Settle[] = [];
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      systemInspect: (...args: any[]) => inspectFn(...args),
      systemQuery: (...args: any[]) => queryFn(...args),
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745/747/755/777 spec 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import SystemView from '../views/SystemView.vue';

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
  const app = createApp({ render: () => h(SystemView as any) });
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

const INSPECT_778 = { name: 'esquerystudio_sys_lock', docCount: 42 };
/* 分布式锁 3 行（SY_TYPES：job_id/status_name/index_name=keyword、created_ts=long） */
const HITS_778 = [
  { _id: 'lock-1', _source: { job_id: 'J-778-001', status_name: 'RUNNING', index_name: 'orders-v9', created_ts: 1759800000000 } },
  { _id: 'lock-2', _source: { job_id: 'J-778-002', status_name: 'DONE', index_name: 'logs-x', created_ts: 1759800100000 } },
  { _id: 'lock-3', _source: { job_id: 'J-778-003', status_name: 'FAILED', index_name: 'bad-c', created_ts: 1759800200000 } },
];

/* 模拟真实 fetch 包装层的记录环行为：resolve 同拍落一条记录（api.ts recordIo 语义） */
function releaseInspect(info: any = INSPECT_778) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url: '/system-inspect?which=lock', requestBody: '', status: 200, ok: true, durationMs: 4, responseRaw: JSON.stringify(info) });
  inspectPending.shift()!.res(info);
}
function failInspect(e: any = new Error('network down')) { inspectPending.shift()!.rej(e); }
function releaseQuery(list: any[] = HITS_778, total = 3) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'POST', url: '/system-query?which=lock&size=50', requestBody: '{\n  "size": 50,\n  "query": { "match_all": {} }\n}', status: 200, ok: true, durationMs: 12, responseRaw: JSON.stringify({ total, took: 12, hits: list }) });
  queryPending.shift()!.res({ total, took: 12, hits: list });
}
function failQuery(e: any = new Error('network down')) { queryPending.shift()!.rej(e); }

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  inspectPending.length = 0;
  queryPending.length = 0;
  ioRing.length = 0;
  ioSeq = 0;
  inspectFn.mockReset().mockImplementation(() => new Promise<any>((res, rej) => { inspectPending.push({ res, rej }); }));
  queryFn.mockReset().mockImplementation(() => new Promise<any>((res, rej) => { queryPending.push({ res, rej }); }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

/* 挂载即自动双发（loadInspect+run）——统一在用例内按需 release */
describe('778 A0 挂载不变量现状守卫', () => {
  it('页头「系统索引」+刷新钮+MetaStrip 索引/文档 42+执行钮+QRT 表 3 行', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery();
    await settle(10);
    expect((host.textContent || '')).toContain('系统索引');
    expect(findBtn(host, /刷新/), '刷新钮在场').toBeTruthy();
    const meta = (host.textContent || '').replace(/\s+/g, '');
    expect(meta).toContain('esquerystudio_sys_lock');
    expect(meta).toContain('42');
    expect(host.querySelector('.sy-run-row .btn.pri'), '执行钮在场').toBeTruthy();
    expect(host.querySelectorAll('.sy-qrt tbody tr').length, 'QRT 3 行').toBe(3);
    expect(meta).toContain('J-778-001');
  });
});

describe('778 G259 RawIo 三件套（铁律 F·头名·777 G255 同构）', () => {
  it('三件套接线源码锁：RawIoModal 组件+ioRecorder 取 /system-query?+Terminal 图标钮', () => {
    expect(src.includes("import RawIoModal from '../components/RawIoModal.vue';"), '弹窗组件接入').toBe(true);
    expect(src.includes("ioRecorder.last('/system-query?')"), '按页查询通道端点取最近记录（? 前缀与 inspect 读端点互不混淆）').toBe(true);
    expect(src.includes('<Terminal'), 'Terminal 图标钮').toBe(true);
  });

  it('判空链：无记录点「原始 IO」→不开空弹窗（toast 引导）', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery();
    await settle(8);
    ioRing.length = 0; /* 清记录环模拟「从未请求」空窗 */
    findBtn(host, /原始IO/).click();
    await settle(4);
    expect(document.querySelector('.rim'), '无记录不开弹窗').toBeFalsy();
  });

  it('直达链：执行后点「原始 IO」→弹窗开+url 含 /system-query?+POST+原始请求/响应两分节', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery();
    await settle(8);
    findBtn(host, /原始IO/).click();
    await settle(6);
    const rim = document.querySelector('.rim');
    expect(rim, '弹窗开（teleport to body）').toBeTruthy();
    expect(rim!.textContent).toContain('/system-query?');
    expect(rim!.textContent).toContain('POST');
    expect(rim!.textContent).toContain('原始请求');
    expect(rim!.textContent).toContain('原始响应');
  });
});

describe('778 G260 三钮在途双态（铁律 D·次刀）', () => {
  it('刷新钮 spinning 现状守卫：在途窗 disabled+icon spinning，复常双复位', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery();
    await settle(8);
    const btn = findBtn(host, /刷新/, host.querySelector('.ph-r') ?? host);
    expect(btn.disabled, '待机解禁').toBe(false);
    btn.click();
    await settle(4);
    expect(btn.disabled, '在途窗 disabled').toBe(true);
    expect(btn.querySelectorAll('[class*="spinning"]').length, '在途窗 icon spinning').toBe(1);
    releaseInspect();
    await settle(8);
    expect(btn.disabled, '复常解禁').toBe(false);
    expect(btn.querySelectorAll('[class*="spinning"]').length, '复常 spinning 移除').toBe(0);
  });

  it('执行钮 Loader2/Play 双态：在途窗 Loader2 让位 Play+「执行中…」+disabled→复常 Play 复位（G260 刀面）', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery();
    await settle(8);
    const btn = host.querySelector('.sy-run-row .btn.pri') as HTMLButtonElement;
    expect(btn.querySelectorAll('[class*="lucide-play"]').length, '待机 Play 在场').toBe(1);
    expect(btn.disabled, '待机解禁').toBe(false);
    btn.click();
    await settle(4);
    expect(btn.querySelectorAll('[class*="lucide-loader"]').length, 'G260 病灶：修前 Play 恒在无 Loader2').toBe(1);
    expect(btn.querySelectorAll('[class*="lucide-play"]').length, 'Loader2 让位 Play').toBe(0);
    expect(btn.disabled, '在途窗 disabled').toBe(true);
    expect((btn.textContent || '').replace(/\s+/g, '')).toContain('执行中');
    releaseQuery();
    await settle(8);
    expect(btn.querySelectorAll('[class*="lucide-play"]').length, '复常 Play 复位').toBe(1);
    expect(btn.querySelectorAll('[class*="lucide-loader"]').length, '复常 Loader2 移除').toBe(0);
    expect(btn.disabled, '复常解禁').toBe(false);
    expect((btn.textContent || '').replace(/\s+/g, '')).not.toContain('执行中');
    expect(host.querySelectorAll('.sy-qrt tbody tr').length, '表再现').toBe(3);
  });

  it('查询失败重试链现状守卫：err-bar 在场→重试在途=骨架条承接+err-bar 入口清移除→复常表再现（777 G256 spinning 刀在「入口清型」页面豁免备案）', async () => {
    const host = await mountView();
    releaseInspect();
    failQuery(); /* 首查失败 → err-bar */
    await settle(8);
    const bar = host.querySelector('.err-bar');
    expect(bar, 'err-bar 在场').toBeTruthy();
    expect(bar!.getAttribute('role')).toBe('alert');
    const retry = findBtn(host, /重试/, bar!);
    retry.click();
    await settle(4);
    /* run() 入口清旧错误条（注释在案：避免重试进行中与 running 骨架同屏）→err-bar 即卸载、
       在途反馈由 running 骨架条承接=产品语义闭环；重试钮 spinning 刀不可见（778 裁决豁免） */
    expect(host.querySelector('.err-bar'), '在途窗 err-bar 入口清移除（775-C1 容器收起口径）').toBeFalsy();
    expect(host.querySelectorAll('.sk').length, 'running 骨架条在场（SkeletonBox .sk×6）').toBe(6);
    releaseQuery();
    await settle(8);
    expect(host.querySelector('.err-bar'), '复常 err-bar 移除').toBeFalsy();
    expect(host.querySelectorAll('.sy-qrt tbody tr').length, '表再现').toBe(3);
  });

  it('inspect 失败重试链现状守卫：横幅在场→重试在途=横幅入口清移除（在途反馈由页头刷新钮 spinning 承接）→复常 MetaStrip 复现', async () => {
    const host = await mountView();
    failInspect(); /* 首拉失败 → sy-inspect-err */
    releaseQuery();
    await settle(8);
    const bar = host.querySelector('.sy-inspect-err');
    expect(bar, 'inspect 失败横幅在场').toBeTruthy();
    expect((bar!.textContent || '').replace(/\s+/g, '')).toContain('索引信息读取失败');
    const retry = findBtn(host, /重试/, bar!);
    retry.click();
    await settle(4);
    /* loadInspect() 入口 inspectErr='' →横幅即卸载；在途窗反馈=页头刷新钮 spinning
       （loading 共享）——纯文本钮文案通道刀不可见（778 裁决豁免） */
    expect(host.querySelector('.sy-inspect-err'), '在途窗横幅入口清移除（775-C1 容器收起口径）').toBeFalsy();
    releaseInspect();
    await settle(8);
    expect(host.querySelector('.sy-inspect-err'), '复常横幅移除').toBeFalsy();
    expect((host.textContent || '').replace(/\s+/g, ''), 'MetaStrip 复现').toContain('esquerystudio_sys_lock');
  });
});

describe('778 G261 seg aria 双刀（弱 P3 随批可裁·776 G254/DiffEditor 140 同构）', () => {
  it('容器 role=group+aria-label+表格钮 pressed=true/JSON 钮 false→点 JSON 翻转+JSON 视图出场', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery();
    await settle(8);
    const seg = host.querySelector('.sy-qrt .seg');
    expect(seg, 'seg 容器在场（bar-prepend）').toBeTruthy();
    expect(seg!.getAttribute('role'), 'G261 病灶：修前无 role').toBe('group');
    expect(seg!.getAttribute('aria-label') || '').toContain('结果展示形式');
    const btns = [...seg!.querySelectorAll<HTMLButtonElement>('button')];
    expect(btns.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    btns[1].click();
    await settle(6);
    expect(btns[0].getAttribute('aria-pressed'), '翻转后表格=false').toBe('false');
    expect(btns[1].getAttribute('aria-pressed'), '翻转后 JSON=true').toBe('true');
    expect(host.querySelector('.json-view'), 'JSON 视图出场').toBeTruthy();
  });
});

describe('778 G262 死规则负锚（772 G245 .ell/.dim 双份同族）', () => {
  it('.sy-run-row 规则恰一份（修前逐字双份）', () => {
    expect((src.match(/\.sy-run-row \{/g) || []).length, 'G262 病灶：修前双份在场').toBe(1);
  });
});
