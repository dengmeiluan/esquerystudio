/**
 * 2026-11-22 批（可选件）：预检报告弹层「能力对比」入口（compareCapabilities 只读探测）。
 *
 *   ① 入口门——手输源连接（无 srcConnId）按钮禁用；选档案后启用；
 *   ② 调用与渲染——点击调 api.xb.compareCapabilities（srcConnId/destConnId 按
 *     源档案与顶栏目标），diff 摘要行（版本差/厂商切换/插件差）+ risks 矩阵
 *     （severity 中文化徽标 + message + action 建议）；
 *   ③ 错误态——对比失败 role=alert 如实展示原文（不静默不冒充）；
 *   ④ 零风险正面态——risks 空 → 「未发现能力差异风险」。
 * 挂具范式同 xmCompatBody1122（preflight 快照经 setupState 注入，弹层不依赖后端链）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbCompareCaps = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        compareCapabilities: (...a: any[]) => xbCompareCaps(...a),
      },
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm() {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/* 预检快照注入 + 打开弹层（不走 openStartConfirm 后端链） */
async function openPf(app: ReturnType<typeof createApp>) {
  const st = stateOf(app);
  st.preflight = { destExists: false, srcDocCount: 100, sourceBytes: 1024 };
  st.preflightOpen = true;
  await settle(2);
  return document.querySelector('[data-test="xm-preflight"]') as HTMLElement;
}

const CAPS = {
  source: { vendor: { id: 'aliyun', label: '阿里云 ES' }, version: '7.10.2', plugins: ['apack', 'analysis-ik'] },
  target: { vendor: { id: 'tencent', label: '腾讯云 ES' }, version: '7.14.2', plugins: ['apack'] },
  diff: {
    versionGap: '7.10 → 7.14', vendorChanged: true,
    pluginsOnlyInSource: ['analysis-ik'], pluginsOnlyInTarget: [],
    nodeScale: '3 → 2',
    risks: [
      { kind: 'analyzer', severity: 'high', message: '源索引使用 analysis-ik 分词器，目标集群未安装', action: '同步结构时自动降级为 standard，或目标安装同版本插件' },
      { kind: 'version', severity: 'medium', message: '跨大版本 7.10 → 7.14，mapping 语义有差异', action: '先「预览兼容计划」核对逐项剔除清单' },
      { kind: 'node', severity: 'info', message: '目标节点数少于源，副本数建议下调', action: '' },
    ],
  },
};

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbCompareCaps.mockReset().mockResolvedValue(CAPS);
});

/* ═══ ① 入口门 ═══ */
describe('1122 能力对比 ①：入口门', () => {
  it('手输源连接（无 srcConnId）禁用；选档案后启用', async () => {
    const { app } = await mountXm();
    const pf = await openPf(app);
    const btn = pf.querySelector('[data-test="xm-pf-capbtn"]') as HTMLButtonElement;
    expect(btn, '能力对比入口在场').toBeTruthy();
    expect(btn.disabled, '无源档案禁用').toBe(true);
    const st = stateOf(app);
    st.srcConnId = 'conn-src';
    await settle(2);
    expect((pf.querySelector('[data-test="xm-pf-capbtn"]') as HTMLButtonElement).disabled, '选档案后启用').toBe(false);
    app.unmount();
  }, 8000);
});

/* ═══ ② 调用与渲染 ═══ */
describe('1122 能力对比 ②：调用与渲染', () => {
  it('点击调 compareCapabilities；diff 摘要行 + risks 矩阵（severity 徽标/message/action）', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    st.srcConnId = 'conn-src';
    st.form.sourceIndex = 'prod-orders';
    await settle(2);
    const pf = await openPf(app);
    (pf.querySelector('[data-test="xm-pf-capbtn"]') as HTMLButtonElement).click();
    await settle(4);
    expect(xbCompareCaps).toHaveBeenCalledTimes(1);
    const req = xbCompareCaps.mock.calls[0][0] as any;
    expect(req.srcConnId).toBe('conn-src');
    expect(req.sourceIndex).toBe('prod-orders');
    expect(req.destConnId).toBeTruthy();
    const sec = pf.querySelector('[data-test="xm-pf-capdiff"]')!;
    expect(sec, '对比区在场').toBeTruthy();
    expect(sec.textContent).toContain('版本差');
    expect(sec.textContent).toContain('7.10 → 7.14');
    expect(sec.textContent).toContain('厂商切换');
    expect(sec.textContent).toContain('analysis-ik');
    const pills = [...sec.querySelectorAll('.pill')].map(p => p.textContent);
    expect(pills, 'severity 中文化徽标').toEqual(expect.arrayContaining(['高风险', '注意']));
    expect(sec.textContent).toContain('源索引使用 analysis-ik 分词器');
    expect(sec.textContent).toContain('自动降级为 standard');
    app.unmount();
  }, 10000);

  it('risks 空 → 零风险正面态', async () => {
    xbCompareCaps.mockResolvedValue({ ...CAPS, diff: { ...CAPS.diff, risks: [] } });
    const { app } = await mountXm();
    const st = stateOf(app);
    st.srcConnId = 'conn-src';
    await settle(2);
    const pf = await openPf(app);
    (pf.querySelector('[data-test="xm-pf-capbtn"]') as HTMLButtonElement).click();
    await settle(4);
    expect(pf.querySelector('[data-test="xm-pf-capdiff"]')!.textContent).toContain('未发现能力差异风险');
    app.unmount();
  }, 10000);
});

/* ═══ ③ 错误态 ═══ */
describe('1122 能力对比 ③：错误态', () => {
  it('对比失败：role=alert 展示原文（不静默不冒充）', async () => {
    xbCompareCaps.mockRejectedValue(new Error('目标连接探测超时'));
    const { app } = await mountXm();
    const st = stateOf(app);
    st.srcConnId = 'conn-src';
    await settle(2);
    const pf = await openPf(app);
    (pf.querySelector('[data-test="xm-pf-capbtn"]') as HTMLButtonElement).click();
    await settle(4);
    const err = pf.querySelector('[data-test="xm-pf-capdiff-err"]')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('能力对比失败');
    expect(err.textContent).toContain('目标连接探测超时');
    app.unmount();
  }, 10000);
});
