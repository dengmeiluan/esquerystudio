/**
 * 九百四十八批刀①：OverviewView 主 load 执行闸（933-C1 通道覆盖律+937-C1 置位纪律谱系）。
 *
 * 矿相：load() 三接口并行执行体零本体闸——头部刷新钮无 disabled、本体无闸读，
 * 同拍双击（两 click 同 tick 均在 Vue patch 前入队）双发三接口；5s 进度轮询 tick
 * （useAutoRefresh guard 只验 hasActiveJob）在慢拍在途窗叠加并发拍；ovLoading
 * finally 复位使首拍收尾即熄进度位（次拍仍在途）。798 批只补了 busy ref 与重试钮
 * 守卫，主刷新钮与本体两通道仍开（同域两口径：重试钮有守卫、主刷新钮零守卫）。
 * 修法：闸读收本体首行（ovLoading 自守）+头部刷新钮 :disabled 双保险（940/941 同页
 * 同语言形态）。锁定形态：行为锚（挂载+pending 袋手控回包，raceGuard860 三拍范式）
 * +源码锁双通道；inflightPatrol798（ovLoading 置位/复位与重试钮字面）、
 * overviewPollAutorefresh375（轮询接线）、raceGuard860（loadHistory 竞态域）共处零扰动。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const overviewFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      overview: (...a: any[]) => overviewFn(...a),
      health: vi.fn(async () => ({ status: 'green' })),
      clusterHealth: vi.fn(async () => ({ status: 'green' })),
      monitorHistory: vi.fn(async () => ({ records: [] })),
      nodesStatsBrief: vi.fn(async () => []),
      pendingTasks: vi.fn(async () => ({ tasks: [] })),
      snapshotRepos: vi.fn(async () => []),
      snapshotStatusSummary: vi.fn(async () => ({ running: [] })),
      clusterTasks: vi.fn(async () => []),
    },
  };
});

import OverviewView from '../views/OverviewView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
let pendingOv: { res: (v: any) => void }[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountOv() {
  const pinia = createPinia();
  setActivePinia(pinia);
  /* 预置索引清单断开 store.loadIndices 旁路——app store 侧 loadIndices 也调 api.overview
     （集群自识别副通道），不 seed 则挂载拍计数+1 污染（860-C2 触发通道清点维） */
  useAppStore(pinia).indices = [{ index: 'seed-idx', 'docs.count': 1 }] as any[];
  const app = createApp({ render: () => h(OverviewView as any) });
  app.use(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  await settle();
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/** 按触发序放行并摘袋（raceGuard860 release 同源：袋长=在途拍数） */
function releaseOv(i: number, v: any) {
  if (!pendingOv[i]) throw new Error(`pending #${i} 不在场`);
  pendingOv.splice(i, 1)[0]!.res(v);
}

function refreshBtn(host: ParentNode): HTMLButtonElement {
  /* 主刷新钮=PageHeader actions 槽（.ph .ph-r）；.ov-mh 卡内另有同名「刷新」钮须域锚排除 */
  const slot = host.querySelector('.ph .ph-r');
  const btn = [...(slot?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    .find(b => (b.textContent || '').trim() === '刷新');
  if (!btn) throw new Error('header refresh button not found');
  return btn;
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  pendingOv = [];
  overviewFn.mockReset().mockImplementation(() =>
    new Promise<any>(res => { pendingOv.push({ res }); }));
});
afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
});

describe('948 刀①：Overview 主 load 执行闸（行为锚）', () => {
  it('同拍双击刷新钮：单发铁证（闸收本体首行）', async () => {
    const { host } = await mountOv();
    expect(pendingOv.length).toBe(1);                          /* 挂载首拍在袋 */
    releaseOv(0, { indices: [] });
    await settle(8);
    expect(stateOf(apps[0]!).ovLoading).toBe(false);
    const btn = refreshBtn(host);
    btn.click();
    btn.click();                                               /* 同拍二击：Vue patch 前两 handler 均入队 */
    await settle(8);
    expect(overviewFn).toHaveBeenCalledTimes(2);               /* 首拍 1+双击闸后 1（修复前=3） */
    expect(pendingOv.length).toBe(1);
  });

  it('落定复位防闸死：在途拍释放后可再发', async () => {
    const { host } = await mountOv();
    releaseOv(0, { indices: [] });
    await settle(8);
    refreshBtn(host).click();
    await settle(4);
    expect(pendingOv.length).toBe(1);
    releaseOv(0, { indices: [{ index: 'i1' }] });
    await settle(8);
    const st = stateOf(apps[0]!);
    expect(st.loaded).toBe(true);
    expect(st.ovLoading).toBe(false);
  });

  it('失败路径复位：err-bar 在场后重试通道仍可用', async () => {
    const { host } = await mountOv();
    releaseOv(0, Promise.reject(new Error('boom')));
    await settle(8);
    const st = stateOf(apps[0]!);
    expect(st.loadErr).toContain('概览接口');
    refreshBtn(host).click();
    await settle(4);
    expect(pendingOv.length).toBe(1);                          /* 失败不闸死 */
    releaseOv(0, { indices: [] });
    await settle(8);
    expect(stateOf(apps[0]!).loadErr).toBe('');
  });

  it('在途窗钮面双保险：刷新钮 disabled（渲染 flush 后），落定复位', async () => {
    const { host } = await mountOv();
    await settle(4);
    const btn = refreshBtn(host);
    btn.click();
    await settle(2);
    expect(btn.disabled).toBe(true);
    releaseOv(0, { indices: [] });
    await settle(8);
    expect(btn.disabled).toBe(false);
  });
});

describe('948 刀①：Overview 主 load 执行闸（源码锁）', () => {
  const src = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');

  it('闸读收本体首行且先于置位；头部刷新钮守卫字面', () => {
    const body = src.slice(src.indexOf('async function load()'), src.indexOf('const ovRefresher'));
    expect(body, '闸读收本体首行').toContain('if (ovLoading.value) return;');
    expect(body.indexOf('if (ovLoading.value) return;'), '闸读先于置位')
      .toBeLessThan(body.indexOf('ovLoading.value = true;'));
    expect(src, '头部刷新钮守卫').toContain(
      '<button class="btn sm ghost" :disabled="ovLoading" @click="load"><RotateCw :size="11" /> 刷新</button>');
  });
});
