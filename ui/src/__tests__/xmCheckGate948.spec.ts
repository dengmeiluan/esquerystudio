/**
 * 九百四十八批刀③：XmigrateView check() 执行闸（933-C1 通道覆盖律谱系）。
 *
 * 矿相：check() 本体零闸读——同文件 fetchCfg 复用 checking 做闸（「拉取在途直接
 * 短路」既有注释自证 checking=本页共享互斥位），check() 自身却不读自家互斥=同域
 * 两口径；通道面全靠钮面 disabled 承接（933-C1 反形态：新增通道即漏），其中失败
 * 内联面板的重试钮零守卫——首败面板在场时同拍双击重试（两 click 同 tick 均在
 * checkErr 清串的 Vue patch 前入队）双发 connectCheck。修法：闸读收本体首行
 * （checking 自守，fetchCfg 既有行同形收敛）+重试钮 :disabled 双保险。
 * 锁定形态：行为锚（挂载+pending 袋，xmigrateJobDeepLink527 挂具范式）+源码锁；
 * xmigrateGateExport941（start/abort 闸形态）、track2Wave554（进度条 checking‖starting
 * 字面）、inflightPatrol798 共处零扰动。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbConnectCheck = vi.fn();
const xbFetchConfig = vi.fn();

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
        connectCheck: (...a: any[]) => xbConnectCheck(...a),
        fetchConfig: (...a: any[]) => xbFetchConfig(...a),
      },
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

let pendingConn: { res: (v: any) => void; rej: (e: unknown) => void }[] = [];
let pendingCfg: { res: (v: any) => void }[] = [];

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
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

function retryBtn(host: ParentNode): HTMLButtonElement {
  const panel = host.querySelector('.xm-conn-err');
  const btn = panel?.querySelector<HTMLButtonElement>('button');
  if (!btn) throw new Error('conn-error retry button not found');
  return btn;
}

/** 按触发序放行并摘袋（raceGuard860 release 同源：袋长=在途拍数） */
function releaseConn(i: number, v: any) {
  if (!pendingConn[i]) throw new Error(`pending #${i} 不在场`);
  pendingConn.splice(i, 1)[0]!.res(v);
}
function rejectConn(i: number, e: unknown) {
  if (!pendingConn[i]) throw new Error(`pending #${i} 不在场`);
  pendingConn.splice(i, 1)[0]!.rej(e);
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  pendingConn = [];
  pendingCfg = [];
  xbJobs.mockReset().mockResolvedValue([]);
  xbConnectCheck.mockReset().mockImplementation(() =>
    new Promise<any>((res, rej) => { pendingConn.push({ res, rej }); }));
  xbFetchConfig.mockReset().mockImplementation(() =>
    new Promise<any>(res => { pendingCfg.push({ res }); }));
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe('948 刀③：check() 执行闸（行为锚）', () => {
  it('失败面板重试钮同拍双击：单发铁证（闸收本体首行）', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.conn = { scheme: 'http', host: 'old-es', port: 9200, username: '', password: '' };
    void st.check();
    await settle(4);
    expect(pendingConn.length).toBe(1);
    rejectConn(0, new Error('boom'));
    await settle(8);
    expect(host.querySelector('.xm-conn-err'), '失败面板在场').toBeTruthy();
    const btn = retryBtn(host);
    btn.click();
    btn.click();                                               /* 同拍二击：patch 前两 handler 均入队 */
    await settle(8);
    expect(xbConnectCheck).toHaveBeenCalledTimes(2);            /* 首败 1+重试闸后 1（修复前=3） */
    expect(pendingConn.length).toBe(1);
    releaseConn(0, []);
    await settle(8);
    expect(host.querySelector('.xm-conn-err'), '成功后面板退场').toBeNull();
  });

  it('fetchCfg 在途 → check() 被共享互斥位闸死（同域两口径收敛行为锚）', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    st.conn = { scheme: 'http', host: 'old-es', port: 9200, username: '', password: '' };
    void st.fetchCfg();
    await settle(4);
    expect(pendingCfg.length).toBe(1);
    void st.check();
    await settle(4);
    expect(xbConnectCheck).toHaveBeenCalledTimes(0);            /* 修复前=1（两口径互不感知） */
    pendingCfg[0]!.res({ mapping: {}, settings: {} });
    await settle(8);
  });
});

describe('948 刀③：check() 执行闸（源码锁）', () => {
  const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

  it('闸读收本体首行（fetchCfg 既有共享互斥行同形）；重试钮守卫字面', () => {
    const body = src.slice(src.indexOf('async function check()'), src.indexOf('const cfgPreview'));
    expect(body, '闸读收本体首行').toContain('if (checking.value) return;');
    expect(body.indexOf('if (checking.value) return;'), '闸读先于校验置位')
      .toBeLessThan(body.indexOf('checking.value = true;'));
    expect(src, '重试钮守卫').toContain(
      '<button v-if="canOps" class="btn sm" :disabled="checking" @click="check"><RefreshCw :size="12" /> 重试</button>');
  });
});
