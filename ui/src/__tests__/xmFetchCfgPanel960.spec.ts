/**
 * XmigrateView fetchCfg 失败反馈对齐连接检查既有内联面板形态——拉取失败不再仅 toast。
 *
 * 矿相：同页同域两口径——连接检查失败已有内联面板（全文可回看+原始对象旁路+
 * toast 同步保留），拉源配置失败却只 toast（证书/认证/超时排障需要回看全文的
 * 场景下，失败现场归零）。修法对齐既有形态：cfgErr/cfgErrRaw 状态位+err-bar
 * 双参渲染+重试钮（在途 disabled，共享 checking 互斥位）+成功重拉后面板退场；
 * toast 保留。
 * 锁定形态：行为锚（挂载+pending 袋，xmCheckGate948 挂具范式）+源码锁；
 * xmCheckGate948（检查闸读与共享互斥位）、track2Wave550（checkErr/startErr/
 * loadErr 三处 err-bar 双参）共处零扰动——本件新增第四处同族形态，零改既有三处。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbFetchConfig = vi.fn();

/* JsonArea（内嵌只读 Monaco）stub：jsdom 无 canvas 2d 上下文，真编辑器初始化
 在 PixelRatio 探测即炸；本件锁的是失败面板行为面，预览渲染体形态非锁面 */
vi.mock('../components/JsonArea.vue', () => ({
  default: { name: 'JsonAreaStub', template: '<div class="json-area-stub"/>' },
}));

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
        connectCheck: async () => [],
        fetchConfig: (...a: any[]) => xbFetchConfig(...a),
      },
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

let pendingCfg: { res: (v: any) => void; rej: (e: unknown) => void }[] = [];

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

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  pendingCfg = [];
  xbJobs.mockReset().mockResolvedValue([]);
  xbFetchConfig.mockReset().mockImplementation(() =>
    new Promise<any>((res, rej) => { pendingCfg.push({ res, rej }); }));
  (Element.prototype as any).scrollIntoView = vi.fn();
});

describe('fetchCfg 失败内联面板（行为锚）', () => {
  it('拉取失败 → 面板在场含全文与重试钮；成功重拉后面板退场', async () => {
    const { app, host } = await mountXm();
    const st = stateOf(app);
    st.conn = { scheme: 'http', host: 'old-es', port: 9200, username: '', password: '' };
    st.form.destCreateMode = 'COPY_FROM_SOURCE';
    st.form.sourceIndex = 'old_index';
    await settle(2);
    void st.fetchCfg();
    await settle(4);
    expect(pendingCfg.length).toBe(1);
    pendingCfg.splice(0, 1)[0]!.rej(new Error('self-signed certificate in certificate chain'));
    await settle(8);
    const panel = host.querySelector('.xm-cfg-err');
    expect(panel, '失败面板在场').toBeTruthy();
    expect(panel!.textContent).toContain('拉取失败：');
    const btn = panel!.querySelector<HTMLButtonElement>('button');
    expect(btn, '重试钮在场').toBeTruthy();
    btn!.click();
    await settle(4);
    expect(pendingCfg.length).toBe(1);
    pendingCfg[0]!.res({ mapping: {}, settings: {} });
    await settle(8);
    expect(host.querySelector('.xm-cfg-err'), '成功后面板退场').toBeNull();
  });
});

describe('fetchCfg 失败内联面板（源码锁）', () => {
  const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

  it('状态位声明+catch 双件+双参渲染+重试钮守卫字面', () => {
    expect(src).toContain("const cfgErr = ref('');");
    expect(src).toContain('const cfgErrRaw = ref<unknown>(null);');
    const body = src.slice(src.indexOf('async function fetchCfg()'), src.indexOf('/* 原始 IO 快查'));
    expect(body).toMatch(/cfgErr\.value = '';\s*\n\s*cfgErrRaw\.value = null;/);
    expect(body).toContain("cfgErr.value = '拉取失败：' + friendlyApiError(e)");
    expect(body).toContain('cfgErrRaw.value = e;');
    expect(body).toContain("store.notify('error', cfgErr.value)");
    expect(src).toContain('v-html="errPreHtml(cfgErr, errMeta(cfgErrRaw))"');
    expect(src).toContain(
      '<button v-if="canOps" class="btn sm" :disabled="checking" @click="fetchCfg"><RefreshCw :size="12" /> 重试</button>');
    expect(src).toContain('.xm-cfg-err { margin-top: var(--sp-2); }');
  });
});
