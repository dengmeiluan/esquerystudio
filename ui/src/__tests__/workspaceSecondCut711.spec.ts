/**
 * 七百一十一批：Workspace 第二刀=G46「reset 后数值补拉」（R91 首刀闭后仅剩项）。
 * - G46（P2）：refreshAll 对 health/remote/tasks 三卡条件拉取（l.on 才拉）——隐藏期
 *   reload 后挂载链跳过拉取，reset() 恢复默认全 on 但不重拉，卡面数值 0/null 陈旧，
 *   须手点「全部刷新」（R90 走查读数实证）→ 修法=reset 确认后复用 refreshAll()
 *   对 on 卡重拉（R90 修法原文）。
 * - 负锚守卫：askConfirm 取消通道零补拉（防无条件拉取）；「全部刷新」钮/挂载链
 *   契约原样（710 批 G44~G48 零回归面）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      healthReport: vi.fn().mockResolvedValue({ score: 92, checks: [{ level: 'info' }], summary: { status: 'yellow' } }),
      remoteClusters: vi.fn().mockResolvedValue({ count: 3 }),
      taskDetail: vi.fn().mockResolvedValue({ nodes: { n1: { tasks: { t1: {} } } } }),
      clusterIndices: vi.fn().mockResolvedValue([]),
      overview: vi.fn().mockResolvedValue({}),
      clusterHealth: vi.fn().mockResolvedValue({}),
      sqlJson: vi.fn(),
    },
  };
});

const askConfirmMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('../composables/confirm', () => ({ askConfirm: askConfirmMock }));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { api } from '../api';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountView() {
  const View = (await import('../views/WorkspaceView.vue')).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return app;
}

async function flush(n = 6) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

const LS_KEY = 'esquerystudio.workspace.v1';
const DEF_LAYOUT = [
  { k: 'health', span: 1 }, { k: 'indices', span: 1 }, { k: 'favorites', span: 1 },
  { k: 'quick-sql', span: 2 }, { k: 'remote', span: 1 }, { k: 'tasks', span: 1 },
  { k: 'shortcuts', span: 2 }, { k: 'wanquan', span: 1 },
];
/** 预种布局：offKeys 部件隐藏、其余默认（复刻 R90 病灶前置=隐藏期 reload 挂载跳过拉取） */
function seedLayout(offKeys: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(
    DEF_LAYOUT.map(l => ({ ...l, on: !offKeys.includes(l.k) }))));
}

const cardNum = (name: string) => {
  const card = [...host.querySelectorAll('.ws-w')]
    .find(w => (w.querySelector('.ws-w-tt')?.textContent || '').includes(name));
  return (card?.querySelector('.ws-num')?.textContent || '').trim();
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  askConfirmMock.mockResolvedValue(true);
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('G46：reset 后部件数值补拉（隐藏期挂载零拉取 → 重置恢复即补）', () => {
  it('隐藏 tasks/remote/health 挂载（零拉取）→ 重置确认 → 三卡 API 补拉+数值上卡+8 卡全显', async () => {
    seedLayout(['tasks', 'remote', 'health']);
    await mountView();
    await flush();
    /* 前置态先验（709-C1 约定）：隐藏期挂载 refreshAll 条件跳过——病灶复现地基 */
    expect(api.taskDetail, '隐藏期挂载不拉任务').not.toHaveBeenCalled();
    expect(api.remoteClusters, '隐藏期挂载不拉远程').not.toHaveBeenCalled();
    expect(api.healthReport, '隐藏期挂载不拉体检').not.toHaveBeenCalled();
    expect([...host.querySelectorAll('.ws-w')].length, '前置=5 卡可见').toBe(5);

    const btn = [...host.querySelectorAll('button')]
      .find(b => (b.textContent || '').includes('重置')) as HTMLButtonElement;
    expect(btn, '「重置」钮在场').toBeTruthy();
    btn.click();
    await flush(10);

    /* G46 补拉：reset 恢复默认全 on 后复用 refreshAll 条件拉取 */
    expect(api.taskDetail, '重置后补拉任务').toHaveBeenCalledTimes(1);
    expect(api.remoteClusters, '重置后补拉远程').toHaveBeenCalledTimes(1);
    expect(api.healthReport, '重置后补拉体检').toHaveBeenCalledTimes(1);
    /* 数值上卡：mock 球 n1×1 任务/远程 3/体检 92（710 同种子） */
    expect([...host.querySelectorAll('.ws-w')].length, '重置后 8 卡全显').toBe(8);
    expect(cardNum('运行中任务'), '任务数上卡非 0 陈旧').toBe('1');
    expect(cardNum('远程集群'), '远程数上卡').toBe('3');
    expect((host.querySelector('.ws-score')?.textContent || '').trim(), '体检分上卡').toContain('92');
    expect(localStorage.getItem(LS_KEY), '重置清自定义布局键（710 契约零扰）').toBeNull();
  });

  it('负锚：askConfirm 取消 → 零补拉+预种布局不动', async () => {
    seedLayout(['tasks']);
    await mountView();
    await flush();
    /* remote 卡挂载期 on 已被挂载链拉过——负锚判据=点击重置前后计数差（709-C1 前置态先验） */
    const before = {
      task: vi.mocked(api.taskDetail).mock.calls.length,
      remote: vi.mocked(api.remoteClusters).mock.calls.length,
      health: vi.mocked(api.healthReport).mock.calls.length,
    };
    askConfirmMock.mockResolvedValue(false);
    const btn = [...host.querySelectorAll('button')]
      .find(b => (b.textContent || '').includes('重置')) as HTMLButtonElement;
    btn.click();
    await flush(10);
    expect(vi.mocked(api.taskDetail).mock.calls.length, '取消重置不补拉任务').toBe(before.task);
    expect(vi.mocked(api.remoteClusters).mock.calls.length, '取消重置不补拉远程').toBe(before.remote);
    expect(vi.mocked(api.healthReport).mock.calls.length, '取消重置不补拉体检').toBe(before.health);
    expect(localStorage.getItem(LS_KEY), '预种布局原样（removeItem 未走）').toBeTruthy();
    expect([...host.querySelectorAll('.ws-w')].length, '布局不动=7 卡').toBe(7);
  });

  it('源码锁：reset 函数体复用 refreshAll()；「全部刷新」钮/挂载链契约原样', () => {
    const s = read('../views/WorkspaceView.vue');
    const resetFn = s.match(/async function reset\(\)[\s\S]*?\n\}/)![0];
    expect(resetFn, 'reset 确认后复用 refreshAll 重拉').toContain('refreshAll()');
    expect(s, '「全部刷新」钮直连契约原样').toMatch(/@click="refreshAll"/);
    /* 1125：挂载链改为过身份门（wsBoot.run），但必须仍落到 refreshAll——
       断言「挂载 → 门 → refreshAll」这条链完整，而不是断言某个具体写法 */
    expect(s, '挂载链过身份门').toMatch(/onMounted\(\(\) => \{[\s\S]*?wsBoot\.run\(\)/);
    expect(s, '门后仍执行 refreshAll').toContain("useGatedBootRead('workspace', () => refreshAll())");
  });
});
