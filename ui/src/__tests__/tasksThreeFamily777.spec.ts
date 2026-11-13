/**
 * 七百七十七批：Tasks 任务管理 深耕档小刀巡查三族（R157；⑥775 建议落地=
 * 深耕档 RawIo/spinning/aria 三族横扫——754 台账「TasksView 同族缺面」点名兑现；
 * 775 ConfigValidator 首刀族同构）。
 *
 * ① G255（P3 铁律 F·头名）全页无 RawIo 原始请求/响应入口（TaskTree 755 G200 同端点
 *    同族；列表通道 _tasks 请求/响应原文直达）——修法=三件套（Terminal 钮+判空 toast
 *    引导+直达弹窗），端点锚 '/cluster/tasks?'（含查询串前缀，与 /cluster/tasks/cancel
 *    写端点互不混淆）。
 * ② G256（P3 铁律 D·次刀）重试钮 icon 无 spinning（同页刷新钮有=两标准并存）+
 *    取消钮 cancelling 在途窗 X 图标恒在无 Loader2 双态——修法=重试钮 icon 补
 *    spinning（同页标准归一）+取消钮 Loader2/X 双态（cancelling 按行门控=天然
 *    无跨钮污染；772 G246 族）。
 * ③ G257（弱 P3 aria·随批可裁）.tv-tree 容器无 role/aria-label（G210 容器族）+
 *    进度条 .tv-prog-bar aria-hidden 无 progressbar 语义（704 G32/773 G35 族）——
 *    修法=容器 role=log+aria-label；进度条 role=progressbar+aria-valuenow+aria-label。
 *    「展开全部/折叠全部」交换标签钮不补 aria-pressed（标签即状态，pressed 反语义——
 *    与 775 G251 静态标签 toggle 不同形，备案豁免）。
 * ④ G258（P3 死代码）.tv-title 死规则（模板零引用；PageHeader 合并伴漏删——
 *    G220/G227/G232/G245 族；527「卡头位保持」裁定随页头合并失效）——修法=整删。
 *
 * 驱动方式照 taskTreeFirstCut755（视图/组件全真+只 mock ../api+Monaco stub）；
 * TasksView 域首例真挂载首刀后 spec（sweep524/errBarWave558b 既有挂载=kw/空态面，
 * 本 spec 刀面零重叠）。确认门驱动=resolveConfirm 直调（askConfirm 由 App.vue 宿主
 * ConfirmModal 渲染，本挂载无宿主；resolveConfirm(false) 兜底清挂起）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { RawIoRec } from '../api';
import { resolveConfirm } from '../composables/confirm';

const src = readFileSync(join(__dirname, '../views/TasksView.vue'), 'utf-8');

/* ---- 网络出口 mock：taskTreeFirstCut755 同源（视图/组件全真） ---- */
const tasksFn = vi.fn();
const cancelFn = vi.fn();
const pending: Array<(v: any) => void> = [];
const cancelPending: Array<(v: any) => void> = [];
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: (...args: any[]) => tasksFn(...args),
      cancelTask: (...args: any[]) => new Promise<any>(res => { cancelPending.push(res); }),
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745/747/755 spec 同款；RawIoModal 内两分节消费） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import TasksView from '../views/TasksView.vue';

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
  const app = createApp({ render: () => h(TasksView as any) });
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

/* 挂载后关自动刷新（默认 3s 轮询与受控时序判据互扰；关=v-model watch 走 restart 清表） */
async function disableAuto(host: HTMLElement) {
  const chk = host.querySelector('.tv-auto input') as HTMLInputElement | null;
  if (chk && chk.checked) { chk.click(); await settle(4); }
}

/* 两根三任务：task-r1（reindex 父·可取消·status total=100 done=50→pct 50）+
   task-r1-sub（bulk 子·可取消）+task-m1（monitor·不可取消） */
const TASKS_777 = [
  { taskId: 'task-r1', action: 'indices:data/write/reindex', node: 'node-777a', description: 'orders-v8 -> orders-v9', runningTimeNanos: 45000000000, tookMs: 45012, cancellable: true, status: { updated: 40, created: 10, deleted: 0, total: 100 } },
  { taskId: 'task-r1-sub', action: 'indices:data/write/bulk', node: 'node-777b', parentTaskId: 'task-r1', runningTimeNanos: 12000000000, cancellable: true },
  { taskId: 'task-m1', action: 'cluster:monitor/tasks/get', node: 'node-777a', runningTimeNanos: 1500000000, cancellable: false },
];

/* 模拟真实 fetch 包装层的记录环行为：resolve 同拍落一条 /cluster/tasks 记录（api.ts
   recordIo 语义），供 RawIoModal 直达链读到 */
function releaseTasks(list: any[] = TASKS_777, url = '/cluster/tasks?detailed=true') {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url, requestBody: '', status: 200, ok: true, durationMs: 5, responseRaw: JSON.stringify(list) });
  pending.shift()!(list);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pending.length = 0;
  cancelPending.length = 0;
  ioRing.length = 0;
  ioSeq = 0;
  tasksFn.mockReset().mockImplementation(() => new Promise<any>(res => { pending.push(res); }));
  cancelFn.mockReset();
});
afterEach(() => { resolveConfirm(false); while (apps.length) apps.pop()!.unmount(); });

describe('777 A0 挂载不变量现状守卫', () => {
  it('页头「ES 任务管理」+双 select+刷新钮 aria+树 3 行（expandAll 默认）+MetaStrip 运行中 3+进度 chip 50/100 50%', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    await disableAuto(host as unknown as HTMLElement);
    expect((host.textContent || '')).toContain('ES 任务管理');
    expect(host.querySelectorAll('.tv-sel').length, '双 select（actions+节点）').toBe(2);
    const refresh = host.querySelector('[aria-label="刷新任务列表"]');
    expect(refresh, '刷新钮 aria-label 在场').toBeTruthy();
    expect(host.querySelectorAll('.tv-node').length, '2 根+1 子全展开=3 行').toBe(3);
    const meta = (host.querySelector('.tv-meta')?.textContent || '').replace(/\s+/g, '');
    expect(meta).toContain('运行中');
    expect((host.querySelector('.tv-prog-txt')?.textContent || '').replace(/\s+/g, '')).toContain('50/10050%');
  });
});

describe('777 G255 RawIo 三件套（铁律 F·头名·755 G200 同端点同构）', () => {
  it('三件套接线源码锁：RawIoModal 组件+ioRecorder 取 /cluster/tasks?+Terminal 图标钮', () => {
    expect(src.includes("import RawIoModal from '../components/RawIoModal.vue';"), '弹窗组件接入').toBe(true);
    expect(src.includes("ioRecorder.last('/cluster/tasks?')"), '按页端点取最近记录（? 前缀与 cancel 写端点互不混淆）').toBe(true);
    expect(src.includes('<Terminal'), 'Terminal 图标钮').toBe(true);
  });

  it('判空链：无记录点「原始 IO」→不开空弹窗（toast 引导）', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    ioRing.length = 0; /* 清记录环模拟「从未请求」空窗 */
    findBtn(host, /原始IO/).click();
    await settle(4);
    expect(document.querySelector('.rim'), '无记录不开弹窗').toBeFalsy();
  });

  it('直达链：拉取后点「原始 IO」→弹窗开+url 含 /cluster/tasks?+原始请求/响应两分节', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    findBtn(host, /原始IO/).click();
    await settle(6);
    const rim = document.querySelector('.rim');
    expect(rim, '弹窗开（teleport to body）').toBeTruthy();
    expect(rim!.textContent).toContain('/cluster/tasks?');
    expect(rim!.textContent).toContain('原始请求');
    expect(rim!.textContent).toContain('原始响应');
  });
});

describe('777 G256 双钮在途双态（铁律 D·次刀）', () => {
  it('刷新钮 spinning 现状守卫：在途窗 disabled+icon spinning，复常双复位', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    await disableAuto(host as unknown as HTMLElement);
    const btn = host.querySelector('[aria-label="刷新任务列表"]') as HTMLButtonElement;
    expect(btn.disabled, '待机解禁').toBe(false);
    btn.click();
    await settle(4);
    expect(btn.disabled, '在途窗 disabled').toBe(true);
    expect(btn.querySelectorAll('[class*="spinning"]').length, '在途窗 icon spinning').toBe(1);
    releaseTasks();
    await settle(8);
    expect(btn.disabled, '复常解禁').toBe(false);
    expect(btn.querySelectorAll('[class*="spinning"]').length, '复常 spinning 移除').toBe(0);
  });

  it('重试钮 spinning 收口：失败态 err-bar 在场→在途窗 icon spinning（G256 刀面）→复常移除', async () => {
    const host = await mountView();
    pending.shift()!(new Error('network down')); /* 首拉失败 → err-bar */
    await settle(8);
    await disableAuto(host as unknown as HTMLElement);
    const bar = host.querySelector('.err-bar');
    expect(bar, 'err-bar 在场').toBeTruthy();
    expect(bar!.getAttribute('role')).toBe('alert');
    const retry = findBtn(host, /重试/);
    retry.click();
    await settle(4);
    expect(retry.disabled, '在途窗 disabled').toBe(true);
    expect(retry.querySelectorAll('[class*="spinning"]').length, 'G256 病灶：修前重试钮 icon 无 spinning（同页刷新钮有=两标准）').toBe(1);
    releaseTasks();
    await settle(8);
    expect(host.querySelector('.err-bar'), '复常 err-bar 移除').toBeFalsy();
    expect(host.querySelectorAll('.tv-node').length, '树再现').toBe(3);
  });

  it('取消钮 Loader2/X 双态：确认 OK 后在途窗 Loader2 让位 X+disabled→复常 X 复位（cancelling 按行门控）', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    await disableAuto(host as unknown as HTMLElement);
    const row = host.querySelector('[data-task-id="task-r1-sub"]') as HTMLElement;
    const cancelBtn = Array.from(row.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => (b.textContent || '').includes('取消'))!;
    expect(cancelBtn, '行取消钮在场（canWrite 测试态全放行）').toBeTruthy();
    cancelBtn.click();
    await settle(4);
    resolveConfirm(true); /* 确认门 OK（App.vue 宿主不在挂载内，直调 resolver） */
    await settle(6);
    expect(cancelPending.length, '取消请求在途').toBe(1);
    expect(row.querySelectorAll('[class*="lucide-loader"]').length, 'G256 病灶：修前 X 恒在无 Loader2').toBe(1);
    expect(row.querySelectorAll('[class*="lucide-x"]').length, 'Loader2 让位 X').toBe(0);
    expect(cancelBtn.disabled, '在途窗 disabled').toBe(true);
    cancelPending.shift()!({ acknowledged: true });
    await settle(8);
    expect(row.querySelectorAll('[class*="lucide-x"]').length, '复常 X 复位').toBe(1);
    expect(row.querySelectorAll('[class*="lucide-loader"]').length, '复常 Loader2 移除').toBe(0);
    expect(cancelBtn.disabled, '复常解禁').toBe(false);
  });

  it('确认门取消零写：resolveConfirm(false) 后不发取消请求（现状守卫）', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    await disableAuto(host as unknown as HTMLElement);
    const row = host.querySelector('[data-task-id="task-r1"]') as HTMLElement;
    const cancelBtn = Array.from(row.querySelectorAll<HTMLButtonElement>('button'))
      .find(b => (b.textContent || '').includes('取消'))!;
    cancelBtn.click();
    await settle(4);
    resolveConfirm(false);
    await settle(6);
    expect(cancelPending.length, '取消零写').toBe(0);
  });
});

describe('777 G257 aria 双刀（弱 P3 随批可裁）', () => {
  it('.tv-tree 容器 role=log+aria-label 含「任务树」（G210 容器族）', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    const tree = host.querySelector('.tv-tree');
    expect(tree, '树容器在场').toBeTruthy();
    expect(tree!.getAttribute('role'), 'G257a 病灶：修前无 role').toBe('log');
    expect(tree!.getAttribute('aria-label') || '').toContain('任务树');
  });

  it('进度条 role=progressbar+aria-valuenow=50+aria-label（704 G32/773 G35 族；aria-hidden 退役）', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    const bar = host.querySelector('.tv-prog-bar');
    expect(bar, '进度条在场').toBeTruthy();
    expect(bar!.getAttribute('role'), 'G257b 病灶：修前 aria-hidden 无语义').toBe('progressbar');
    expect(bar!.getAttribute('aria-valuenow')).toBe('50');
    expect(bar!.getAttribute('aria-label') || '').toContain('50');
    expect(bar!.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('777 G258 死规则负锚（G220 PageHeader 合并漏删族）', () => {
  it('.tv-title 死规则整删（模板零引用；527「卡头位保持」裁定随页头合并失效）', () => {
    expect(src.includes('.tv-title {'), 'G258 病灶：修前死规则在场').toBe(false);
  });
});
