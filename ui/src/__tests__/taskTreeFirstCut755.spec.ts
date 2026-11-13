/**
 * 七百五十五批：TaskTree 首刀五小刀（R136；⑥754 头号建议落地=R135 裁决表
 * G200+G198+G199+G202+G201；741 G148/743 G152/745/747/749/751/753 首刀族同构）。
 *
 * ① G200（P3 铁律 F·头号）全页无 RawIo 原始请求/响应入口（754 S-G200 实锚 0 钮；
 *    列表通道 _tasks 原始响应无入口；detail 通道有 JSON 卡=部分合规；741 G148/746 G162
 *    族）——修法=rim 族三件套（Terminal 钮+判空 toast 引导+直达弹窗 Esc 关），
 *    端点锚 '/cluster/tasks?'（含查询串前缀，与 /cluster/tasks/cancel 写端点互不混淆）。
 * ② G198（P3 铁律 D·次刀）立即刷新钮 disabled 绑 busy 而 load 只置 loading 在途零
 *    守卫可连点重入（754 S-G198 实锚 dis=false；748 G170 精确同构）——修法=改绑
 *    busy||loading 一行刀。
 * ③ G199（P3 铁律 F）详情网格 action/node/running/cancellable/parent/description
 *    六 label 裸英文无 :title（754 S-G199 实锚 tips 全空；值位已人话化=半合规）——
 *    修法=span 补 title 悬停中文（753 G191/745 G156 双语同款：英文键留检索、悬浮层
 *    中文语义）。
 * ④ G202（P3 注释失实）R42 §8.3 宣称「过滤词进 URL」vs useScopedDraft 纯
 *    sessionStorage 实现（754 S-G202 实锚 ?filter= 零消费；748 G176 同构）——
 *    修法=注释诚实化（行为零改；真深链留增强裁决）。
 * ⑤ G201（弱 P3 aria 随批可裁）tr-chk 行勾选框无 aria-label（754 S-G201 实锚空；
 *    G47/G142/G154 族）——修法=补可读名（勾选目的+行任务标识）。
 *
 * 驱动方式照 analyzeFirstCut747（视图/组件全真+只 mock ../api+Monaco stub——
 * Monaco 内核 happy-dom canvas 崩）；TaskTree 首例真挂载 spec（既有 21 锚全源码锁）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { RawIoRec } from '../api';

const src = readFileSync(join(__dirname, '../views/TaskTreeView.vue'), 'utf-8');

/* ---- 网络出口 mock：analyzeFirstCut747 同源（视图/组件全真） ---- */
const tasksFn = vi.fn();
const taskDetailFn = vi.fn();
const pending: Array<(v: any) => void> = [];
const ioRing: RawIoRec[] = [];
let ioSeq = 0;

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: (...args: any[]) => tasksFn(...args),
      taskDetail: (...args: any[]) => taskDetailFn(...args),
      cancelTask: (...args: any[]) => Promise.resolve({}),
    },
    ioRecorder: {
      last: (sub?: string) => [...ioRing].reverse().find(r => r.url.includes(sub ?? '')) ?? null,
      all: () => [...ioRing].reverse(),
      get: () => null,
      clear: () => { ioRing.length = 0; },
    },
  };
});

/* Monaco 内核 happy-dom canvas 崩统一 stub（743/745/747 spec 同款；RawIoModal 内两分节消费） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import TaskTreeView from '../views/TaskTreeView.vue';

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
  const app = createApp({ render: () => h(TaskTreeView as any) });
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

/* 两根三任务：task-a（reindex 父·45s·可取消·带 description）+task-a-sub（bulk 子·
   12s·可取消·带 parentTaskId）+task-b（monitor·1.5s·不可取消） */
const TASKS_755 = [
  { taskId: 'task-a', action: 'indices:data/write/reindex', node: 'node-755a', description: 'orders-v8 -> orders-v9', runningTimeNanos: 45000000000, cancellable: true },
  { taskId: 'task-a-sub', action: 'indices:data/write/bulk', node: 'node-755b', parentTaskId: 'task-a', runningTimeNanos: 12000000000, cancellable: true },
  { taskId: 'task-b', action: 'cluster:monitor/tasks/get', node: 'node-755a', runningTimeNanos: 1500000000, cancellable: false },
];

/* 模拟真实 fetch 包装层的记录环行为：resolve 同拍落一条 /cluster/tasks 记录
   （api.ts recordIo 语义），供 RawIoModal 直达链读到；shift 消费（G198 两次顺序拉取） */
function releaseTasks(list: any[] = TASKS_755, url = '/cluster/tasks?detailed=true') {
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
  ioRing.length = 0;
  ioSeq = 0;
  tasksFn.mockReset().mockImplementation(() => new Promise<any>(res => { pending.push(res); }));
  taskDetailFn.mockReset().mockImplementation(() => Promise.resolve({ complete: false, task: {} }));
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('755 A0 挂载不变量负锚（现状即守卫）', () => {
  it('页头三件套+计数 2 根·3 任务+工具行（过滤/自动刷新/批量/立即刷新）+树 2 根 3 行', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    expect(host.textContent).toContain('任务树');
    expect(host.textContent).toContain('集群在途任务与父子任务层级');
    expect((host.querySelector('.tt-count')?.textContent || '').trim()).toBe('2 根 · 3 任务');
    expect(host.querySelector('.tt-filter input'), '过滤框').toBeTruthy();
    expect(host.querySelector('.tt-chk input'), '自动刷新开关').toBeTruthy();
    const bulk = findBtn(host, /批量cancel/);
    expect(bulk.disabled, '零勾选批量钮禁用').toBe(true);
    expect(findBtn(host, /立即刷新/)).toBeTruthy();
    expect(host.querySelectorAll('.tt-node').length, '2 根').toBe(2);
    expect(host.querySelectorAll('.tt-left .tr').length, '根+子行展开=3 行').toBe(3);
  });
});

describe('755 G198 立即刷新钮在途守卫 busy||loading（铁律 D·748 G170 精确同构）', () => {
  it('在途窗 disabled=true（G198 病灶：修前绑 busy 恒 false 可连点）+双击单发+复常解禁', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    const btn = findBtn(host, /立即刷新/);
    expect(btn.disabled, '待机解禁').toBe(false);
    btn.click();
    await settle(4);
    expect(tasksFn.mock.calls.length).toBe(2);
    expect(btn.disabled, 'G198 病灶：在途窗 disabled=false 可连点重入').toBe(true);
    btn.click(); /* 防重入守卫下二次点击不触发 */
    await settle(4);
    expect(tasksFn.mock.calls.length, '在途窗双击单发（busy||loading 守卫）').toBe(2);
    releaseTasks();
    await settle(8);
    expect(btn.disabled, '复常解禁').toBe(false);
  });
});

describe('755 G199 详情六 label :title 中文释义（铁律 F·753 G191 双语同款）', () => {
  it('action/node/running/cancellable/description 五键（根任务行）+parent 键（子任务行）title 全中文（G199 病灶：修前 tips 全空）', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    const rootRow = host.querySelector('.tt-node .tr') as HTMLElement;
    rootRow.click();
    await settle(6);
    const tipOf = (host: HTMLElement, key: string) =>
      (Array.from(host.querySelectorAll('.tt-det-grid .lbl')) as HTMLElement[])
        .find(l => (l.textContent || '').trim() === key)?.getAttribute('title') || '';
    expect(tipOf(host, 'action')).toContain('任务动作');
    expect(tipOf(host, 'node')).toContain('节点');
    expect(tipOf(host, 'running')).toContain('运行');
    expect(tipOf(host, 'cancellable')).toContain('取消');
    expect(tipOf(host, 'description')).toContain('描述');
    const childRow = host.querySelector('.tt-node .tr-kids .tr') as HTMLElement;
    childRow.click();
    await settle(6);
    expect(tipOf(host, 'parent')).toContain('父任务');
  });
});

describe('755 G200 RawIo 三件套（铁律 F·头号·747 G162 同构）', () => {
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

  it('直达链：拉取后点「原始 IO」→弹窗开+url 含 /cluster/tasks?+请求/响应两分节', async () => {
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

describe('755 G201 tr-chk 行勾选框 aria-label（G47/G142/G154 族·随批可裁）', () => {
  it('勾选框带可读名：含任务标识与批量取消目的（G201 病灶：修前 aria-label 空）', async () => {
    const host = await mountView();
    releaseTasks();
    await settle(8);
    const chk = host.querySelector('.tt-left .tr-chk') as HTMLInputElement;
    expect(chk, '行勾选框在场（canWrite=me null 全放行）').toBeTruthy();
    const label = chk.getAttribute('aria-label') || '';
    expect(label.includes('task-a'), '可读名含行任务标识').toBe(true);
    expect(label.includes('批量取消') || label.includes('勾选'), '可读名含勾选目的').toBe(true);
  });
});

describe('755 G202 注释诚实化（748 G176 同款·源码锁·行为零改）', () => {
  it('R42 §8.3 注释不再宣称「过滤词进 URL」，新注释记 useScopedDraft 草稿实况（G202 病灶：修前注释与实现不符）', () => {
    expect(src.includes('过滤词进 URL'), '失实宣称清零').toBe(false);
    expect(src.includes('不进 URL'), '注释记实况：不进 URL').toBe(true);
    expect(src.includes('useScopedDraft'), '注释锚定实现件').toBe(true);
  });
});
