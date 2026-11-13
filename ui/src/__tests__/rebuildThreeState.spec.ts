/**
 * G3（UX 轮 II rebuild 组）三态与提交链路契约——行为改动防回归：
 *
 *   B1 XmigrateView：作业表四态互斥——首载骨架 / 失败 err-bar / 真空 EmptyState / 表，
 *      加载中不得闪「暂无迁移作业」错误空态（G1 B3/G2 B6 同构）；
 *   B2 XmigrateView：连接检查失败 checkErr 内联面板（全文+重试）——不再仅 toast 后现场归零；
 *   B3 XmigrateView：启动失败 startErr 内联面板，重试重开 warn 级确认弹层（不旁路确认）；
 *   A1 ReindexAdvancedView：bodyTouched 脏标记——从未展开 body 时提交恒以表单为准，
 *      不再提交挂载时刻播种的陈旧 rawBody（dest.index=''）；
 *   A2 ReindexAdvancedView：query JSON 非法前置警示 + submit 阻断——
 *      不再静默剔除 query 退化为全量 reindex；
 *   B4 ReindexAdvancedView：提交失败内联全文（friendlyEsError，限高可滚）+ 重试；
 *   B5 ReindexPreviewView：runErr 独立顶置 err-bar——失败不再仅 toast 回落引导空态（R91b 同源），
 *      重跑失败保留旧预估（G2 保留旧数据裁定）；
 *   C6 ReindexPreviewView：0 命中醒目警示分档（.rp-zero）。
 *
 * 注意：IndexPicker 是组件封装，测试经其内部 .ixp-inp set value + input 事件驱动 v-model；
 * XmigrateView 的启动确认是视图内 ConfirmModal（teleport 到 body），在 document.body 查询；
 * ReindexAdvancedView 的 askConfirm 是全局服务（宿主在 App.vue），单测替换为直接确认桩。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口与全局确认服务，视图/组件/工具全用真的 */
const xbJobsFn = vi.fn();
const xbConnectCheckFn = vi.fn();
const xbStartFn = vi.fn();
const xbDestIndicesFn = vi.fn();
const xbPreflightFn = vi.fn(); /* 五百二十五批 W4：启动确认合并 askConfirm 后 openStartConfirm 先行 await preflight——stub 挡真实 fetch */
const keysFn = vi.fn();
const clustersListFn = vi.fn();
const clusterIndicesFn = vi.fn();
const aliasesFn = vi.fn();
const reindexAdvancedFn = vi.fn();
const reindexPreviewFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
      keys: (...args: any[]) => keysFn(...args),
      clustersList: (...args: any[]) => clustersListFn(...args),
      clusterIndices: (...args: any[]) => clusterIndicesFn(...args),
      aliases: (...args: any[]) => aliasesFn(...args),
      reindexAdvanced: (...args: any[]) => reindexAdvancedFn(...args),
      reindexPreview: (...args: any[]) => reindexPreviewFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* M1：store.loadIndices 链路出口补齐，挡 jsdom 真实 fetch 噪音（不断言故不需 vi.fn） */
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      /* M1 补漏：clusterIndices 成功后 loadVersion 走通用出口 api.raw('GET','/') 识别 ES 版本——
         本 spec 三个被测视图均不用 raw，stub 只挡这条链路的真实 fetch */
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      /* ux2 Task 8 补漏：ReindexPreview 换壳后 rpAssist 吃 useIndexFields——源索引驱动用例会发
         mappingDetail（空 properties → fields []），stub 只挡这条链路的真实 fetch（同 M1 先例） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      xb: {
        ...actual.api.xb,
        jobs: (...args: any[]) => xbJobsFn(...args),
        connectCheck: (...args: any[]) => xbConnectCheckFn(...args),
        start: (...args: any[]) => xbStartFn(...args),
        destIndices: (...args: any[]) => xbDestIndicesFn(...args),
        preflight: (...args: any[]) => xbPreflightFn(...args),
      },
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* ux2 Task 10：JsonArea 内核 Monaco——A1/A2 用例须驱动 body/query 编辑器，stub 升 caps 形态。
   monacoCaps 只在 setup 闭包内迟引用（mount 时执行），无 TDZ */
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));

import XmigrateView from '../views/XmigrateView.vue';
import ReindexAdvancedView from '../views/ReindexAdvancedView.vue';
import ReindexPreviewView from '../views/ReindexPreviewView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function setInput(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}

const JOB = { jobId: 'j-001', status: 'DONE', destIndex: 'orders-v2', sourceIndex: 'orders', remoteEndpoint: 'http://old:9200', migrated: 10, total: 10, conflicts: 0, errors: 0, createTime: 1760000000000 };
const PREVIEW = { docs: 1000, sourcePrimaryBytes: 1048576, sourceTotalDocs: 2000, avgDocBytes: 512, estimatedTargetBytes: 524288 };

beforeEach(() => {
  document.body.innerHTML = '';
  monacoCaps.length = 0;
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobsFn.mockReset().mockResolvedValue([]);
  xbConnectCheckFn.mockReset().mockResolvedValue([]);
  xbStartFn.mockReset().mockResolvedValue({ jobId: 'j-new' });
  xbDestIndicesFn.mockReset().mockResolvedValue([]);
  xbPreflightFn.mockReset().mockResolvedValue({ destExists: false });
  keysFn.mockReset().mockResolvedValue([]);
  clustersListFn.mockReset().mockResolvedValue([]);
  clusterIndicesFn.mockReset().mockResolvedValue([]);
  aliasesFn.mockReset().mockResolvedValue([]);
  reindexAdvancedFn.mockReset().mockResolvedValue({ taskId: 'task-1' });
  reindexPreviewFn.mockReset().mockResolvedValue(PREVIEW);
  askConfirmFn.mockReset().mockResolvedValue(true);
});

describe('G3-B1 XmigrateView：作业表四态互斥', () => {
  it('首载中（jobs 未回）→ 骨架在，「暂无迁移作业」不在', async () => {
    xbJobsFn.mockReturnValue(new Promise(() => { /* 永不 resolve，模拟拉取中 */ }));
    const { app, host } = await mountView(XmigrateView);
    expect(host.querySelector('.xm-sk'), '首载必须出骨架').toBeTruthy();
    expect(host.querySelectorAll('.xm-sk .sk').length, '骨架 3 块对齐表行节奏').toBe(3);
    expect(host.textContent, '加载中不许闪「暂无迁移作业」').not.toContain('暂无迁移作业');
    app.unmount();
  });

  it('拉取失败 → err-bar（全文+重试）在，「暂无迁移作业」不在，骨架消隐', async () => {
    xbJobsFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(XmigrateView);
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('加载迁移作业失败');
    expect(host.textContent).toContain('重试');
    expect(host.textContent, '失败时不许伪装「暂无迁移作业」').not.toContain('暂无迁移作业');
    expect(host.querySelector('.xm-sk'), '失败后骨架必须消隐').toBeNull();
    app.unmount();
  });

  it('真空（无作业且无错误）→ EmptyState 在，err-bar 与骨架不在', async () => {
    const { app, host } = await mountView(XmigrateView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.xm-sk')).toBeNull();
    expect(host.querySelector('.empty-state'), '真空必须出 EmptyState 组件').toBeTruthy();
    expect(host.textContent).toContain('暂无迁移作业');
    app.unmount();
  });

  it('有旧数据时手动刷新 → 表保留不闪骨架（loading && !jobs.length 守卫）', async () => {
    xbJobsFn.mockResolvedValue([JOB]);
    const { app, host } = await mountView(XmigrateView);
    expect(host.querySelector('.qrt-tbl'), '首载成功必须出表').toBeTruthy();
    let resolve2: (v: any) => void = () => {};
    xbJobsFn.mockReturnValue(new Promise(r => { resolve2 = r; }));
    const refreshBtn = host.querySelector<HTMLButtonElement>('.card-t .btn.ghost[title="刷新任务列表"]');
    expect(refreshBtn, '刷新按钮必须渲染').toBeTruthy();
    refreshBtn!.click();
    await settle(3);
    expect(host.querySelector('.xm-sk'), '有旧数据刷新不许闪骨架').toBeNull();
    expect(host.querySelector('.qrt-tbl'), '刷新中旧表保留').toBeTruthy();
    resolve2([JOB]);
    await settle();
    app.unmount();
  });

  it('有旧数据时刷新失败 → err-bar 在且旧表保留，不伪装空态（审查 I1 回归锁）', async () => {
    xbJobsFn.mockResolvedValue([JOB]);
    const { app, host } = await mountView(XmigrateView);
    expect(host.querySelector('.qrt-tbl'), '首载成功必须出表').toBeTruthy();
    xbJobsFn.mockRejectedValue(new Error('connect refused'));
    const refreshBtn = host.querySelector<HTMLButtonElement>('.card-t .btn.ghost[title="刷新任务列表"]');
    expect(refreshBtn, '刷新按钮必须渲染').toBeTruthy();
    refreshBtn!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '刷新失败必须出现错误条（独立于数据分支）').toBeTruthy();
    expect(host.textContent).toContain('加载迁移作业失败');
    expect(host.textContent).toContain('重试');
    expect(host.querySelector('.qrt-tbl'), '失败时旧表必须保留').toBeTruthy();
    expect(host.textContent, '有旧数据时不许伪装「暂无迁移作业」').not.toContain('暂无迁移作业');
    app.unmount();
  });
});

describe('G3-B2 XmigrateView：连接检查失败内联面板', () => {
  async function fillHostAndCheck(host: HTMLElement) {
    const hostInp = host.querySelector<HTMLInputElement>('.xm-conn input[placeholder^="host"]');
    expect(hostInp, 'host 输入框必须渲染').toBeTruthy();
    setInput(hostInp!, 'old-es:9200');
    await settle(2);
    findBtn(host, '连接检查')!.click();
    await settle();
  }

  it('连接失败 → checkErr 面板（全文+重试）在，不再仅 toast 后现场归零', async () => {
    xbConnectCheckFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(XmigrateView);
    await fillHostAndCheck(host);
    const panel = host.querySelector('.xm-conn-err');
    expect(panel, '连接失败必须出内联面板').toBeTruthy();
    expect(panel!.textContent).toContain('连接失败');
    expect(panel!.textContent).toContain('重试');
    app.unmount();
  });

  it('重试 → 重跑连接检查，成功后面板消隐、旧集群索引区出现', async () => {
    xbConnectCheckFn.mockRejectedValueOnce(new Error('connect refused'));
    const { app, host } = await mountView(XmigrateView);
    await fillHostAndCheck(host);
    expect(host.querySelector('.xm-conn-err')).toBeTruthy();
    xbConnectCheckFn.mockResolvedValue([{ index: 'old-1', 'docs.count': 5 }]);
    findBtn(host.querySelector('.xm-conn-err') as HTMLElement, '重试')!.click();
    await settle();
    expect(xbConnectCheckFn, '重试必须重跑连接检查').toHaveBeenCalledTimes(2);
    expect(host.querySelector('.xm-conn-err'), '成功后面板必须消隐').toBeNull();
    expect(host.querySelector('.xm-remote'), '成功后旧集群索引区必须出现').toBeTruthy();
    expect(host.textContent).toContain('old-1');
    app.unmount();
  });
});

describe('G3-B3 XmigrateView：启动失败内联面板', () => {
  async function fillFormAndStart(host: HTMLElement) {
    setInput(host.querySelector<HTMLInputElement>('.xm-conn input[placeholder^="host"]')!, 'old-es:9200');
    const idxInputs = host.querySelectorAll<HTMLInputElement>('.xm-idx-inp');
    setInput(idxInputs[0]!, 'orders');
    setInput(idxInputs[1]!, 'orders-v2');
    await settle(2);
    findBtn(host, '启动迁移')!.click();
    await settle(3);
    /* 五百二十五批 W4：启动确认合并全局 askConfirm（本 spec 的 confirm 服务是 mock、
       resolve true 直接放行）——直挂 ConfirmModal 的 .cf-mask 形态退役，「必须过确认」
       锁定改 askConfirm 调用计数（下方 ReindexAdvanced 用例同款口径） */
    expect(askConfirmFn, '启动必须过 askConfirm 确认').toHaveBeenCalledTimes(1);
    await settle();
  }

  it('启动失败 → startErr 面板（全文+重试）在，不再仅 toast', async () => {
    xbStartFn.mockRejectedValue(new Error('resource_already_exists_exception'));
    const { app, host } = await mountView(XmigrateView);
    await fillFormAndStart(host);
    const panel = host.querySelector('.xm-start-err');
    expect(panel, '启动失败必须出内联面板').toBeTruthy();
    expect(panel!.textContent).toContain('启动失败');
    expect(panel!.textContent).toContain('资源已存在');
    app.unmount();
  });

  it('重试 → 重走 askConfirm 确认（写操作重确认不旁路）', async () => {
    xbStartFn.mockRejectedValue(new Error('boom'));
    const { app, host } = await mountView(XmigrateView);
    await fillFormAndStart(host);
    expect(host.querySelector('.xm-start-err')).toBeTruthy();
    findBtn(host.querySelector('.xm-start-err') as HTMLElement, '重试')!.click();
    await settle(3);
    /* 五百二十五批 W4：合并后确认形态=askConfirm 调用——重试必须重走一次（计数 2） */
    expect(askConfirmFn, '重试必须重走确认（写操作不旁路）').toHaveBeenCalledTimes(2);
    app.unmount();
  });
});

describe('G3-A1/A2 ReindexAdvancedView：提交 body 权威性与非法 query 阻断', () => {
  function pickers(host: HTMLElement) {
    return host.querySelectorAll<HTMLInputElement>('.ixp-inp');
  }

  it('A1：从未展开 body——提交 body 以表单为准（dest.index 为后填值，非挂载快照）', async () => {
    const { app, host } = await mountView(ReindexAdvancedView);
    setInput(pickers(host)[1], 'orders-v2'); // 目标索引（模板序：Source 卡在前）
    await settle(2);
    findBtn(host, '开始 Reindex')!.click();
    await settle();
    expect(askConfirmFn, '必须进确认弹层').toHaveBeenCalledTimes(1);
    const msg = askConfirmFn.mock.calls[0][0].message as string;
    /* 未手编时 submit 取 JSON.stringify(buildBody())（无缩进压缩格式），断言串不带空格 */
    expect(msg, '确认弹层 body 必须含表单后填的 dest.index（修复前为挂载快照空值）').toContain('"index":"orders-v2"');
    expect(reindexAdvancedFn).toHaveBeenCalledTimes(1);
    expect(reindexAdvancedFn.mock.calls[0][0], '实际提交 body 必须含 dest.index').toContain('"index":"orders-v2"');
    app.unmount();
  });

  it('A1：手编 body 后——表单改动不覆写，提交以手编 body 为准', async () => {
    const { app, host } = await mountView(ReindexAdvancedView);
    setInput(pickers(host)[1], 'orders-v2');
    await settle(2);
    findBtn(host, '展开原始 body')!.click();
    await settle(2);
    /* JsonArea 内核升级 Monaco：rawBody W4c 起 rows=14 定高退役改 fill 弹性 → height '100%'，钉特征找 cap */
    const bodyCap = monacoCaps.find(c => c.props.height === '100%');
    expect(bodyCap, 'body 编辑区 Monaco（rawBody fill 弹性）必须在位').toBeTruthy();
    const manual = JSON.stringify({ source: { index: 'manual-src' }, dest: { index: 'manual-dst' } }, null, 2);
    bodyCap!.emit('update:modelValue', manual);
    await settle(2);
    /* 手编后再改表单：body 不许被覆写 */
    setInput(pickers(host)[1], 'orders-v3');
    await settle(2);
    findBtn(host, '开始 Reindex')!.click();
    await settle();
    expect(reindexAdvancedFn.mock.calls[0][0], '手编 body 必须原样提交').toBe(manual);
    app.unmount();
  });

  it('A2：query JSON 非法 → 内联警示在，submit 阻断（不进确认弹层、不调接口）', async () => {
    const { app, host } = await mountView(ReindexAdvancedView);
    setInput(pickers(host)[1], 'orders-v2');
    /* srcQuery rows=4 → 92px（同视图 'max(110px, 28vh)' painless / '100%' rawBody fill 不撞） */
    const qCap = monacoCaps.find(c => c.props.height === '92px');
    expect(qCap, 'srcQuery Monaco（92px）必须在位').toBeTruthy();
    qCap!.emit('update:modelValue', '{ "query": { bad,, }');
    await settle(2);
    expect(host.querySelector('.ra-qerr'), '非法 query 必须出内联警示').toBeTruthy();
    expect(host.querySelector('.ra-qerr')!.textContent).toContain('退化为全量');
    findBtn(host, '开始 Reindex')!.click();
    await settle();
    expect(askConfirmFn, '非法 query 不许进确认弹层').not.toHaveBeenCalled();
    expect(reindexAdvancedFn, '非法 query 不许调接口').not.toHaveBeenCalled();
    app.unmount();
  });
});

describe('G3-B4 ReindexAdvancedView：提交失败内联全文 + 重试', () => {
  it('失败 → err 面板含 friendlyEsError 全文与重试按钮（不再埋折叠 details）', async () => {
    reindexAdvancedFn.mockRejectedValue(new Error('index_not_found_exception: no such index [orders-v2]'));
    const { app, host } = await mountView(ReindexAdvancedView);
    setInput(host.querySelectorAll<HTMLInputElement>('.ixp-inp')[1], 'orders-v2');
    await settle(2);
    findBtn(host, '开始 Reindex')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '失败必须出 err 结果面板').toBeTruthy(); /* 561 批同步更新：err 档合并 theme.css .err-bar 单源 */
    const full = host.querySelector('.ra-err-full');
    expect(full, '失败全文必须内联展示').toBeTruthy();
    expect(full!.textContent).toContain('索引不存在（index_not_found）');
    const retryBtn = findBtn(host.querySelector('.err-bar') as HTMLElement, '重试'); /* 561 批同步更新同上 */
    expect(retryBtn, '失败面板必须含重试按钮').toBeTruthy();
    retryBtn!.click();
    await settle();
    expect(askConfirmFn, '重试必须重走确认（写操作不旁路）').toHaveBeenCalledTimes(2);
    expect(reindexAdvancedFn, '重试必须重调接口').toHaveBeenCalledTimes(2);
    app.unmount();
  });
});

describe('G3-B5/C6 ReindexPreviewView：runErr 互斥 + 0 命中分档', () => {
  /* 五百二十五批同步更新：页内 IndexPicker 退役换只读 CurrentIdxChip（选索引唯一入口=顶栏）——
     源索引改经 store.pick 驱动（useIdxState follow 下行跟随，chip 回显） */
  async function pickSource(host: HTMLElement) {
    const { useAppStore } = await import('../stores/app');
    const store = useAppStore();
    store.indices.push({ index: 'orders', health: 'green' } as any);
    store.pick('orders');
    await settle(2);
    expect(host.querySelector('.rp-bar .cic-nm')?.textContent, '源 chip 必须回显顶栏选中').toBe('orders');
  }

  it('初始 → 引导 EmptyState 在，err-bar 不在', async () => {
    const { app, host } = await mountView(ReindexPreviewView);
    expect(host.querySelector('.err-bar')).toBeNull();
    expect(host.querySelector('.empty-state'), '初始必须出引导 EmptyState').toBeTruthy();
    expect(host.textContent).toContain('选择源索引后点击「运行预估」');
    app.unmount();
  });

  it('预估失败 → err-bar（全文+重试）在，引导空态不在（失败不伪装未运行）', async () => {
    reindexPreviewFn.mockRejectedValue(new Error('connect refused'));
    const { app, host } = await mountView(ReindexPreviewView);
    await pickSource(host);
    findBtn(host, '运行预估')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '失败必须出现错误条').toBeTruthy();
    expect(host.textContent).toContain('预估失败');
    expect(host.textContent).toContain('重试');
    expect(host.textContent, '失败时不许回落引导空态').not.toContain('选择源索引后点击「运行预估」');
    app.unmount();
  });

  it('重跑失败 → err-bar 在且旧预估保留（err-bar 独立于数据分支）', async () => {
    const { app, host } = await mountView(ReindexPreviewView);
    await pickSource(host);
    findBtn(host, '运行预估')!.click();
    await settle();
    expect(host.querySelector('.rp-meta-pos'), '首跑成功必须出预估元信息行(五百一十九批合并 MetaStrip 统一件)').toBeTruthy();
    reindexPreviewFn.mockRejectedValue(new Error('timeout'));
    findBtn(host, '运行预估')!.click();
    await settle();
    expect(host.querySelector('.err-bar'), '重跑失败必须出 err-bar').toBeTruthy();
    expect(host.querySelector('.rp-meta-pos'), '重跑失败旧预估元信息行必须保留(v3.0.1 容器换代)').toBeTruthy();
    app.unmount();
  });

  it('0 命中 → 醒目警示条在（分档不再只是建议区一条 li）', async () => {
    reindexPreviewFn.mockResolvedValue({ ...PREVIEW, docs: 0, estimatedTargetBytes: 0 });
    const { app, host } = await mountView(ReindexPreviewView);
    await pickSource(host);
    findBtn(host, '运行预估')!.click();
    await settle();
    expect(host.querySelector('.rp-zero'), '0 命中必须出醒目警示条').toBeTruthy();
    expect(host.textContent).toContain('过滤后 0 命中');
    app.unmount();
  });
});
