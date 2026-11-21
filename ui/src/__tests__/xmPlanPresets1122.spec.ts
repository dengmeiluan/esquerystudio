/**
 * 2026-11-22 批：迁移方案预设（向导第③步高级参数折叠区内，localStorage xm-plan-presets-v1，
 * 交互照抄批量前缀预设 xm-batch-presets-v1 的既有模式）。
 *
 *   ① 入口在高级参数折叠区内（展开后预设行在场）；
 *   ② 保存当前方案六参（tuneMode/slices/batchSize/scrollKeepAliveSec/forceMerge/
 *     destCreateMode）为命名预设，同名覆盖；保存后选中态指向该预设；
 *   ③ 下拉选择即回填六参（建索引方式挡不可见档位）；
 *   ④ 删除清键与选中态；
 *   ⑤ cap 20 超限按保存时间淘汰最旧；
 *   ⑥ 预设不含任何连接信息/密码（存储 JSON 零 host/password 键）；
 *   ⑦ 持久化：重挂载读到既有预设；坏 JSON 静默丢弃；空名保存被拦。
 * 挂具范式同 xmigrateUx1120（全真挂载 + setupState 直调）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();

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
      xb: { ...actual.api.xb, jobs: (...a: any[]) => xbJobs(...a), destIndices: async () => [] },
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

const NIGHT_PRESET = {
  tuneMode: 'GENTLE', slices: 4, batchSize: 2000, scrollKeepAliveSec: 120,
  forceMerge: true, destCreateMode: 'COPY_FROM_SOURCE',
};

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe('方案预设 ①：入口在高级参数折叠区内', () => {
  it('展开高级参数后预设行在场（选择/名称/保存/删除四件）', async () => {
    const { app, host } = await mountXm();
    expect(host.querySelector('[data-test="xm-plan-preset-save"]'), '折叠态不渲染').toBeNull();
    (host.querySelector('.xm-adv-details .cp-toggle') as HTMLButtonElement).click();
    await settle(2);
    expect(host.querySelector('[data-test="xm-plan-preset-pick"]'), '下拉在场').toBeTruthy();
    expect(host.querySelector('[data-test="xm-plan-preset-name"]'), '名称输入在场').toBeTruthy();
    expect(host.querySelector('[data-test="xm-plan-preset-save"]'), '保存钮在场').toBeTruthy();
    const del = host.querySelector('.xm-plan-preset .btn:disabled') as HTMLButtonElement;
    expect(del, '删除钮无选中预设时禁用').toBeTruthy();
    app.unmount();
  }, 8000);
});

describe('方案预设 ②③④：存 / 回填 / 删', () => {
  it('保存当前六参 → localStorage 落盘且选中态指向该预设；不含连接信息/密码', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    Object.assign(st.form, NIGHT_PRESET);
    await settle(2);
    st.planPresetName = '夜间温和';
    await settle(2);
    st.savePlanPreset();
    await settle(4);
    const stored = JSON.parse(localStorage.getItem('xm-plan-presets-v1')!) as Record<string, any>;
    expect(stored['夜间温和']).toMatchObject(NIGHT_PRESET);
    expect(typeof stored['夜间温和'].savedAt).toBe('number');
    expect(st.planPresetId, '保存后选中态指向该预设').toBe('夜间温和');
    /* 方案只关参数：存储 JSON 零连接信息/密码键 */
    const rawStr = localStorage.getItem('xm-plan-presets-v1')!;
    expect(rawStr).not.toContain('password');
    expect(rawStr).not.toContain('host');
    expect(rawStr).not.toContain('username');
    app.unmount();
  }, 8000);

  it('改掉表单后选择预设回填六参；不可见/非法档位回落 NONE（destModes 挡法）', async () => {
    localStorage.setItem('xm-plan-presets-v1', JSON.stringify({
      '夜间温和': { ...NIGHT_PRESET, savedAt: 1 },
      '怪档': { ...NIGHT_PRESET, destCreateMode: 'BOGUS_MODE', savedAt: 2 },
    }));
    const { app } = await mountXm();
    const st = stateOf(app);
    Object.assign(st.form, { tuneMode: 'AGGRESSIVE', slices: null, batchSize: null, scrollKeepAliveSec: null, forceMerge: false, destCreateMode: 'NONE' });
    await settle(2);
    st.onPlanPresetPick('夜间温和');
    await settle(2);
    expect(st.form.tuneMode).toBe('GENTLE');
    expect(st.form.slices).toBe(4);
    expect(st.form.batchSize).toBe(2000);
    expect(st.form.scrollKeepAliveSec).toBe(120);
    expect(st.form.forceMerge).toBe(true);
    expect(st.form.destCreateMode).toBe('COPY_FROM_SOURCE');
    /* 档位不在当前可见 destModes（浏览器模式无 FROM_ENTITY、非法枚举同拦）：回填挡到 NONE */
    st.onPlanPresetPick('怪档');
    await settle(2);
    expect(st.form.destCreateMode).toBe('NONE');
    app.unmount();
  }, 8000);

  it('删除预设：清键与选中态；下拉选项随删随清', async () => {
    localStorage.setItem('xm-plan-presets-v1', JSON.stringify({ '夜间温和': { ...NIGHT_PRESET, savedAt: 1 } }));
    const { app } = await mountXm();
    const st = stateOf(app);
    st.planPresetId = '夜间温和';
    await settle(2);
    st.delPlanPreset();
    await settle(4);
    expect(JSON.parse(localStorage.getItem('xm-plan-presets-v1')!), '删除后清键').toEqual({});
    expect(st.planPresetId).toBeNull();
    expect(st.planPresetOpts).toEqual([]);
    app.unmount();
  }, 8000);
});

describe('方案预设 ⑤：cap 20 超限按保存时间淘汰最旧', () => {
  it('预置 20 个 + 保存新名 → 仍 20 键且 savedAt 最早的被淘汰', async () => {
    const seed: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      seed['p-' + String(i).padStart(2, '0')] = { ...NIGHT_PRESET, savedAt: 1000 + i };
    }
    localStorage.setItem('xm-plan-presets-v1', JSON.stringify(seed));
    const { app } = await mountXm();
    const st = stateOf(app);
    st.planPresetName = '新方案';
    st.savePlanPreset();
    await settle(4);
    const stored = JSON.parse(localStorage.getItem('xm-plan-presets-v1')!) as Record<string, any>;
    expect(Object.keys(stored).length, 'cap 20 收敛').toBe(20);
    expect(stored['p-00'], 'savedAt 最早（最旧）被淘汰').toBeUndefined();
    expect(stored['p-01'], '次旧保留').toBeTruthy();
    expect(stored['新方案'], '新保存的在场').toBeTruthy();
    app.unmount();
  }, 8000);
});

describe('方案预设 ⑦：持久化与防呆', () => {
  it('重挂载读到既有预设（下拉选项）；坏 JSON 静默丢弃不炸页面；空名保存被拦', async () => {
    localStorage.setItem('xm-plan-presets-v1', JSON.stringify({ '夜间温和': { ...NIGHT_PRESET, savedAt: 1 } }));
    const first = await mountXm();
    const st1 = stateOf(first.app);
    expect(st1.planPresetOpts).toEqual([{ label: '夜间温和', value: '夜间温和' }]);
    first.app.unmount();
    document.body.innerHTML = '';
    /* 坏快照：读侧静默丢弃（最坏=预设列表空） */
    localStorage.setItem('xm-plan-presets-v1', '{oops');
    const second = await mountXm();
    const st2 = stateOf(second.app);
    expect(st2.planPresetOpts, '坏快照静默丢弃').toEqual([]);
    /* 空名保存被拦：不落盘 */
    st2.planPresetName = '   ';
    await settle(2);
    st2.savePlanPreset();
    await settle(4);
    expect(localStorage.getItem('xm-plan-presets-v1'), '空名不落盘（坏快照也不被覆盖）').toBe('{oops');
    second.app.unmount();
  }, 10000);
});
