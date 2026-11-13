/**
 * 九百一十七批：Tasks 任务管理 走查批刀①——「折叠全部」状态机缺陷
 * （轨6 常态轮转走查 TasksView 静态审计发现；tasksThreeFamily777 挂载范式同源）。
 *
 * 现象：caret 从「全展开」态收起单节点时，toggleExpand 把 expandedIds 初始化为
 * 「除该节点外全部任务」；此后「折叠全部」只翻转 expandAll，不清按需展开集——
 * 残留的父节点 id 让 flatList 继续走该节点子树，「折叠全部」实际不达。
 *   单父链：折叠全部 → caret 展开父 → 展开全部 → 折叠全部 ⇒ 子任务仍显示；
 *   双父链：caret 收起父A → 展开全部 → 折叠全部 ⇒ 父B 子树仍显示。
 * 修法=展开/折叠收敛 toggleExpandAll 单点：翻转同时清 expandedIds。
 *
 * 驱动照 tasksThreeFamily777（视图全真+只 mock ../api；resolveConfirm 兜底清挂起）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { resolveConfirm } from '../composables/confirm';

const src = readFileSync(join(__dirname, '../views/TasksView.vue'), 'utf-8');

/* ---- 网络出口 mock：tasksThreeFamily777 同源（视图/组件全真） ---- */
const pending: Array<(v: any) => void> = [];

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: () => new Promise<any>(res => { pending.push(res); }),
      cancelTask: () => new Promise<any>(() => {}),
    },
    ioRecorder: {
      last: () => null,
      all: () => [],
      get: () => null,
      clear: () => {},
    },
  };
});

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

function caretOf(host: ParentNode, taskId: string): HTMLElement {
  const row = host.querySelector(`[data-task-id="${taskId}"]`);
  expect(row, `任务行必须存在：${taskId}`).toBeTruthy();
  const caret = row!.querySelector<HTMLElement>('.tv-caret');
  expect(caret, `caret 必须存在：${taskId}`).toBeTruthy();
  return caret!;
}

async function disableAuto(host: HTMLElement) {
  const chk = host.querySelector('.tv-auto input') as HTMLInputElement | null;
  if (chk && chk.checked) { chk.click(); await settle(4); }
}

/* 双父结构：task-a/task-b 各带一个子任务（单父链用 777 同构单父 task-r1） */
const TASKS_2P = [
  { taskId: 'task-a', action: 'indices:data/write/reindex', node: 'n1', description: 'a -> a2', runningTimeNanos: 45000000000, cancellable: true, status: {} },
  { taskId: 'task-a-sub', action: 'indices:data/write/bulk', node: 'n2', parentTaskId: 'task-a', runningTimeNanos: 12000000000, cancellable: true },
  { taskId: 'task-b', action: 'indices:data/write/reindex', node: 'n1', description: 'b -> b2', runningTimeNanos: 30000000000, cancellable: true, status: {} },
  { taskId: 'task-b-sub', action: 'indices:data/write/bulk', node: 'n2', parentTaskId: 'task-b', runningTimeNanos: 9000000000, cancellable: true },
];

const TASKS_1P = [
  { taskId: 'task-r1', action: 'indices:data/write/reindex', node: 'n1', description: 'orders-v8 -> orders-v9', runningTimeNanos: 45000000000, cancellable: true, status: {} },
  { taskId: 'task-r1-sub', action: 'indices:data/write/bulk', node: 'n2', parentTaskId: 'task-r1', runningTimeNanos: 12000000000, cancellable: true },
  { taskId: 'task-m1', action: 'cluster:monitor/tasks/get', node: 'n1', runningTimeNanos: 1500000000, cancellable: false },
];

function releaseTasks(list: any[]) {
  pending.shift()!(list);
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  pending.length = 0;
});
afterEach(() => { resolveConfirm(false); while (apps.length) apps.pop()!.unmount(); });

describe('917 刀①「折叠全部」状态机（先红）', () => {
  it('单父残留链：折叠全部→caret 展开父→展开全部→折叠全部 ⇒ 子任务收起', async () => {
    const host = await mountView();
    releaseTasks(TASKS_1P);
    await settle(8);
    await disableAuto(host as unknown as HTMLElement);
    expect(host.querySelectorAll('.tv-node').length, '全展开初始 3 行').toBe(3);
    findBtn(host, /折叠全部/).click();
    await settle(4);
    expect(host.querySelectorAll('.tv-node').length, '首次折叠=2 根').toBe(2);
    caretOf(host, 'task-r1').click();
    await settle(4);
    expect(host.querySelectorAll('.tv-node').length, 'caret 展开父=3 行').toBe(3);
    findBtn(host, /展开全部/).click();
    await settle(4);
    expect(host.querySelectorAll('.tv-node').length, '展开全部=3 行').toBe(3);
    findBtn(host, /折叠全部/).click();
    await settle(4);
    expect(host.querySelectorAll('.tv-node').length, '缺陷病灶：折叠全部后子任务必须收起=2 行').toBe(2);
  });

  it('双父残留链：caret 收起父A→展开全部→折叠全部 ⇒ 父B 子树也收起', async () => {
    const host = await mountView();
    releaseTasks(TASKS_2P);
    await settle(8);
    await disableAuto(host as unknown as HTMLElement);
    expect(host.querySelectorAll('.tv-node').length, '全展开初始 4 行').toBe(4);
    caretOf(host, 'task-a').click();
    await settle(4);
    expect(host.querySelectorAll('.tv-node').length, '收起父A=3 行（a-sub 隐藏）').toBe(3);
    findBtn(host, /展开全部/).click();
    await settle(4);
    expect(host.querySelectorAll('.tv-node').length, '展开全部=4 行').toBe(4);
    findBtn(host, /折叠全部/).click();
    await settle(4);
    expect(host.querySelectorAll('.tv-node').length, '缺陷病灶：折叠全部后两棵子树都收起=2 行').toBe(2);
    expect((host.querySelector('.card-t')?.textContent || '')).toContain('已折叠子任务：2');
  });

  it('源码锁：展开/折叠收敛 toggleExpandAll 单点且折叠时清按需展开集', () => {
    expect(src.includes('@click="toggleExpandAll"'), '折叠钮接线 toggleExpandAll').toBe(true);
    const fn = src.match(/function toggleExpandAll\(\)[\s\S]*?\n}/);
    expect(fn, 'toggleExpandAll 函数在场').toBeTruthy();
    expect(fn![0], '翻转时清 expandedIds（折叠语义完整）').toContain('expandedIds.value = new Set()');
  });
});
