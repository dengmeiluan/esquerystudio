/**
 * 九百三十三批：SystemView 查询执行链在途重入闸（真挂载行为锚四段）。
 *
 * 矿相：run() 的执行闸只落在钮面（执行钮/错误条重试钮 :disabled="running"），
 * 另两条触发通道直达函数本体不受闸——①Monaco 编辑器 Ctrl+回车（@execute，
 * 编辑器在在途窗常驻不卸载，连敲即连发）②QueryResultTable 刷新钮
 * （@refresh 意图事件；running 骨架分支卸载 QRT 前的同拍双击窗）。
 * 并发双发的实害：交错完成时旧包慢到覆写新包；旧包失败落在后会把新包的
 * 成功结果以 resp=null 清掉（错误条替换结果表=成功现场被失败样式吞）。
 * 修法=run() 入口单点重入闸（在途一律忽略）——闸收进函数本体即覆盖全部
 * 通道，钮面 disabled 保持现状双保险。
 *
 * 驱动方式照 systemThreeFamily778（视图/组件全真+只 mock ../api+Monaco stub
 * +真 memory router；挂载起手 onMounted 自动 loadInspect+run 双发，受控时序
 * 用双 pending 池）；execute 事件经 stub 根元素 __vueParentComponent.emit
 * 触发（dtSegMark565 读 props 同通道，emits 已声明故不走 fallthrough）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* ---- 网络出口 mock：systemThreeFamily778 同源（视图/组件全真） ---- */
const inspectFn = vi.fn();
const queryFn = vi.fn();
type Settle = { res: (v: any) => void; rej: (e: any) => void };
const inspectPending: Settle[] = [];
const queryPending: Settle[] = [];
const ioRing: any[] = [];
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

const INSPECT_933 = { name: 'esquerystudio_sys_lock', docCount: 42 };
const HITS_933 = [
  { _id: 'lock-1', _source: { job_id: 'J-933-001', status_name: 'RUNNING', index_name: 'orders-v9', created_ts: 1759800000000 } },
  { _id: 'lock-2', _source: { job_id: 'J-933-002', status_name: 'DONE', index_name: 'logs-x', created_ts: 1759800100000 } },
];

function releaseInspect(info: any = INSPECT_933) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'GET', url: '/system-inspect?which=lock', requestBody: '', status: 200, ok: true, durationMs: 4, responseRaw: JSON.stringify(info) });
  inspectPending.shift()!.res(info);
}
function failInspect(e: any = new Error('network down')) { inspectPending.shift()!.rej(e); }
function releaseQuery(list: any[] = HITS_933, total = 2) {
  ioRing.push({ id: ++ioSeq, ts: Date.now(), method: 'POST', url: '/system-query?which=lock&size=50', requestBody: '{\n  "size": 50,\n  "query": { "match_all": {} }\n}', status: 200, ok: true, durationMs: 12, responseRaw: JSON.stringify({ total, took: 12, hits: list }) });
  queryPending.shift()!.res({ total, took: 12, hits: list });
}
function failQuery(e: any = new Error('network down')) { queryPending.shift()!.rej(e); }

/* 编辑器 Ctrl+回车通道：stub 根元素取活实例发 execute 事件 */
function fireExecute(host: ParentNode) {
  const stub = host.querySelector('.monaco-stub') as any;
  expect(stub, 'Monaco stub 必须在场').toBeTruthy();
  stub.__vueParentComponent.emit('execute');
}
/* QRT 刷新钮（aria-label 唯一锚；页头「刷新」钮走 inspect 通道非本刀面） */
function qrtRefreshBtn(host: ParentNode): HTMLButtonElement {
  const btn = host.querySelector<HTMLButtonElement>('button[aria-label="刷新结果"]');
  expect(btn, 'QRT 刷新钮必须在场（首查落定后）').toBeTruthy();
  return btn!;
}

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

describe('933 SystemView 查询执行链在途重入闸', () => {
  it('A 在途窗编辑器 Ctrl+回车通道再触发不二发（闸前连发=矿红证）', async () => {
    const host = await mountView();
    expect(queryFn).toHaveBeenCalledTimes(1); // 挂载自动首查在途
    fireExecute(host); // 在途窗 Ctrl+回车
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(1); // 闸前实测 2 发
    releaseQuery();
    await settle();
    expect(host.textContent).toContain('J-933-001'); // 成功现场在位
  });

  it('B QRT 刷新钮同拍双击不二发（骨架分支卸载 QRT 前的同拍窗）', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery(); // 首查落定，QRT 在场
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(1);
    const btn = qrtRefreshBtn(host);
    btn.click();
    btn.click(); // 同拍双击（Vue patch 前双事件同达）
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(2); // 闸前实测 3 发
    releaseQuery();
    await settle();
    expect(host.textContent).toContain('J-933-001');
  });

  it('D 落定后闸复位：完成窗经同通道可再发（防闸死守卫）', async () => {
    const host = await mountView();
    releaseInspect();
    releaseQuery();
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(1);
    fireExecute(host);
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(2); // 复位后再发
    releaseQuery();
    await settle();
    expect(host.textContent).toContain('J-933-002');
  });

  it('E 失败后闸复位：失败现场经同通道可重试且复常表再现', async () => {
    const host = await mountView();
    failInspect();
    failQuery(); // 首查失败
    await settle();
    expect(host.textContent).toContain('查询失败');
    fireExecute(host);
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(2); // 失败现场可重试
    releaseQuery();
    await settle();
    expect(host.textContent).toContain('J-933-001'); // 复常表再现
  });
});
