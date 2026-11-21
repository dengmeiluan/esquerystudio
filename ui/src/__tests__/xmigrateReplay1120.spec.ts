/**
 * 一千一百二十批（可回放/便捷性三件）：Xmigrate 作业详情回放弹窗 + IndexHub 右键直达迁移 + 续跑弹窗表单统一。
 *
 * 行为面：
 *   ① 详情弹窗六区渲染——message 全文 / errorSamples / conflictSamples（含「样本上限 1000，
 *     总冲突 N」说明与 _id 逐条）/ formatlessDateFields 告知条 / sliceStatus·sliceMigrated·
 *     sliceErrors 逐片矩阵 / savedSettings 折叠面板；数据 mock 进 jobs（job doc 自持字段）；
 *   ② conflictSamples 一键复制：join('\n') 每行一个（copyText spy 断言实参）；
 *   ③ ?source= 深链：挂载回填源索引输入 + query 用后即清（?jobId 三口范式同族）；
 *   ④ resume 弹窗：RemoteSourceFields 统一件在场（host 输入/密码框），裸三 input 退役。
 * 源码锚：六区 data-test / 复制函数 / 深链消费与摘链 / IndexHub 菜单项与路由字面 / 表单统一接线。
 * 挂具范式同 xmigrateUx1120（setupState 直调 + 全真挂载；api/copyText 均 mock）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const copyTextFn = vi.fn();

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
/* copyText 打桩 spy（utils/format 其余导出保真）——复制行为断言只认实参串 */
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (...a: any[]) => copyTextFn(...a) };
});

const v = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountXm(query: Record<string, string> = {}) {
  location.hash = '#/';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/xmigrate', component: { template: '<div/>' } },
    ],
  });
  await router.push({ path: '/', query });
  await router.isReady();
  const app = createApp({ render: () => h(XmigrateView as any) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, router };
}

function stateOf(app: ReturnType<typeof createApp>): any {
  return (app._instance as any)!.subTree.component.setupState;
}

/* 详情六区数据全量齐备的 job doc（conflictSamples/formatlessDateFields/sliceStatus 均带） */
const DETAIL_JOB = {
  jobId: 'j-replay', status: 'DONE', destIndex: 'dest-r', sourceIndex: 'src-r',
  remoteEndpoint: 'http://old:9200', migrated: 100, total: 200, conflicts: 1200, errors: 2,
  createTime: 1700000000000,
  message: '迁移完成：100 新写入 / 1200 跳过（目标已存在同 _id）',
  errorSamples: ['bulk idx=1 id=a1 版本冲突', 'bulk idx=1 id=a2 映射解析失败'],
  conflictSamples: ['doc-409-1', 'doc-409-2', 'doc-409-3'],
  formatlessDateFields: ['created_at', 'updated_at'],
  sliceStatus: { '0': 'DONE', '1': 'FAILED', '2': 'RUNNING' },
  sliceMigrated: { '0': 60, '1': 30, '2': 10 },
  sliceErrors: { '0': 0, '1': 2, '2': 0 },
  savedSettings: { 'index.refresh_interval': '-1', 'index.number_of_replicas': '0' },
};

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  copyTextFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ①② 详情弹窗六区渲染 + conflictSamples 复制（挂载） ═══ */
describe('1120 replay ①②：作业详情回放弹窗（六区 + 冲突样本复制）', () => {
  it('行尾「详情」钮打开弹窗：六区 data-test 全在场，各区块内容锚定', async () => {
    xbJobs.mockResolvedValue([DETAIL_JOB]);
    const { app, host } = await mountXm();
    const btn = host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement;
    expect(btn, '行尾详情钮必须在场（纯读不限状态）').toBeTruthy();
    btn.click();
    await settle();
    const root = document.querySelector('[data-test="xm-detail"]');
    expect(root, '详情弹窗根容器').toBeTruthy();
    /* 六区 data-test 锚逐一在场 */
    for (const key of ['xm-detail-msg', 'xm-detail-errors', 'xm-detail-conflicts', 'xm-detail-formatless', 'xm-detail-slices', 'xm-detail-settings']) {
      expect(document.querySelector(`[data-test="${key}"]`), `区块 ${key}`).toBeTruthy();
    }
    const txt = (sel: string) => (document.querySelector(sel) as HTMLElement)?.textContent ?? '';
    /* message 全文（StatusPill tooltip 藏着的原文进弹窗正文） */
    expect(txt('[data-test="xm-detail-msg"]')).toContain('迁移完成：100 新写入 / 1200 跳过');
    /* 错误样本逐条 */
    expect(txt('[data-test="xm-detail-errors"]')).toContain('id=a1 版本冲突');
    expect(txt('[data-test="xm-detail-errors"]')).toContain('id=a2 映射解析失败');
    /* 冲突样本：_id 逐条 + 上限 1000 说明 + 总冲突计数（fmtNum 千分位） */
    const cf = txt('[data-test="xm-detail-conflicts"]');
    expect(cf).toContain('doc-409-1');
    expect(cf).toContain('doc-409-3');
    expect(cf).toContain('样本上限 1000');
    expect(cf).toContain('总冲突 1,200');
    /* formatless 告知条：字段名如实列出（作业完成后仍须可见） */
    const fm = txt('[data-test="xm-detail-formatless"]');
    expect(fm).toContain('created_at');
    expect(fm).toContain('updated_at');
    expect(fm).toContain('未声明 format');
    /* 逐片矩阵：状态中文化 + 已迁/失败计数 */
    const sl = txt('[data-test="xm-detail-slices"]');
    expect(sl).toContain('#0');
    expect(sl).toContain('#1');
    expect(sl).toContain('失败');
    expect(sl).toContain('60');
    expect(sl).toContain('2');
    /* savedSettings 折叠面板（默认收起，标题在场） */
    expect(txt('[data-test="xm-detail-settings"]')).toContain('savedSettings');
    app.unmount();
  }, 8000);

  it('conflictSamples 一键复制：join 每行一个（copyText 实参断言）', async () => {
    xbJobs.mockResolvedValue([DETAIL_JOB]);
    const { app, host } = await mountXm();
    (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
    await settle();
    const cp = document.querySelector('[aria-label="复制冲突 _id 样本列表（每行一个）"]') as HTMLButtonElement;
    expect(cp, '冲突 _id 复制钮').toBeTruthy();
    cp.click();
    await settle(4);
    expect(copyTextFn, '复制实参=样本 _id 列表每行一个').toHaveBeenCalledWith('doc-409-1\ndoc-409-2\ndoc-409-3');
    app.unmount();
  }, 8000);

  it('缺字段静默降级：无 conflictSamples/formatless 的旧作业 → 对应区块显示「无」不冒充', async () => {
    xbJobs.mockResolvedValue([{ ...DETAIL_JOB, conflictSamples: undefined, formatlessDateFields: undefined, errorSamples: undefined, sliceStatus: {}, sliceMigrated: {}, sliceErrors: {}, savedSettings: undefined }]);
    const { app, host } = await mountXm();
    (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
    await settle();
    const cf = (document.querySelector('[data-test="xm-detail-conflicts"]') as HTMLElement).textContent ?? '';
    expect(cf).toContain('无');
    expect(cf).not.toContain('doc-409-1');
    expect((document.querySelector('[data-test="xm-detail-formatless"]') as HTMLElement).textContent).toContain('无');
    expect((document.querySelector('[data-test="xm-detail-slices"]') as HTMLElement).textContent).toContain('无逐片数据');
    app.unmount();
  }, 8000);
});

/* ═══ ③ ?source= 深链回填（挂载） ═══ */
describe('1120 replay ③：?source= 深链回填源索引输入', () => {
  it('挂载即回填 form.sourceIndex + 表单展开 + query.source 用后即清', async () => {
    xbJobs.mockResolvedValue([]);
    const { app, host, router } = await mountXm({ source: 'legacy-orders' });
    await settle(4);
    const inp = host.querySelector('.xm-idx-inp') as HTMLInputElement;
    expect(inp, '源索引输入框（表单组已随深链展开）').toBeTruthy();
    expect(inp.value, '深链 source 回填源索引').toBe('legacy-orders');
    expect(router.currentRoute.value.query.source, '一次性上下文用后即清').toBeUndefined();
    app.unmount();
  }, 8000);

  it('watch 口：SPA 内同页重入（query 从无到有）也消费', async () => {
    xbJobs.mockResolvedValue([]);
    const { app, host, router } = await mountXm();
    await router.push({ query: { source: 'wiki-v2' } });
    /* watch 口消费链（watch flush → loadJobs await → replace 导航）比挂载口多一跳，
       实测 16 拍落定——给足拍数再断言摘链 */
    await settle(24);
    const inp = host.querySelector('.xm-idx-inp') as HTMLInputElement;
    expect(inp.value, 'watch 口深链回填').toBe('wiki-v2');
    expect(router.currentRoute.value.query.source).toBeUndefined();
    app.unmount();
  }, 8000);
});

/* ═══ ④ resume 弹窗表单统一（挂载 + 源码锚） ═══ */
describe('1120 replay ④：续跑弹窗 RemoteSourceFields 统一', () => {
  it('askResume 打开弹窗：统一件在场（host 输入/密码框），裸三 input 退役', async () => {
    xbJobs.mockResolvedValue([{ ...DETAIL_JOB, status: 'FAILED', jobId: 'j-resume' }]);
    const { app, host } = await mountXm();
    stateOf(app).askResume({ jobId: 'j-resume', remoteEndpoint: 'http://old:9200' });
    await settle();
    /* n-modal teleport 到 body：第 1 步表单区也有同款统一件（手动模式常驻），
       弹窗内的输入=不在挂载宿主内的那一份 */
    expect(document.body.textContent).toContain('续跑迁移');
    const hostInps = [...document.querySelectorAll('input[placeholder^="host"]')] as HTMLInputElement[];
    const inModal = hostInps.filter(i => !host.contains(i));
    expect(inModal.length, '弹窗内统一件 host 输入').toBe(1);
    expect(inModal[0].value, '远程端点解析回填 host').toBe('old');
    const pwInModal = ([...document.querySelectorAll('input[placeholder^="密码"]')] as HTMLInputElement[]).filter(i => !host.contains(i));
    expect(pwInModal.length, '弹窗内统一件密码框').toBe(1);
    app.unmount();
  }, 8000);

  it('源码锚：resume 弹窗挂 RemoteSourceFields；裸 v-model 三件与 .xm-conn-port 皮肤不回流', () => {
    expect(v).toContain(':conn="resumeConn" @update:conn="resumeConn = $event"');
    expect(v).not.toContain('v-model="resumeConn.host"');
    expect(v).not.toContain('v-model="resumeConn.port"');
    expect(v).not.toContain('v-model="resumeConn.username"');
    expect(v).not.toContain('v-model="resumeConn.password"');
    expect(v).not.toContain('xm-conn-port');
  });
});

/* ═══ 源码锚：详情弹窗/深链/IndexHub 菜单 ═══ */
describe('1120 replay 源码锚', () => {
  it('详情弹窗：六区 data-test + copyConflictSamples 每行一个 + savedSettings 折叠', () => {
    for (const key of ['xm-detail', 'xm-detail-msg', 'xm-detail-errors', 'xm-detail-conflicts', 'xm-detail-formatless', 'xm-detail-slices', 'xm-detail-settings']) {
      expect(v).toContain(`data-test="${key}"`);
    }
    expect(v).toContain('function copyConflictSamples(j: any)');
    expect(v).toContain("list.join('\\n')");
    expect(v).toContain('样本上限 1000');
    expect(v).toContain('detailSettingsOpen');
  });
  it('?source= 深链：消费函数回填源索引 + 摘链只摘消费过的参数', () => {
    expect(v).toContain("form.value.sourceIndex = source");
    expect(v).toContain("delete rest.source");
    expect(v).toContain("route.query.source");
  });
  it('IndexHub 右键直达：goto-group 增项 + /xmigrate?source= 路由字面（不带 store.pick）', () => {
    expect(ih).toContain("'跨集群迁移此索引…'");
    expect(ih).toContain("router.push({ path: '/xmigrate', query: { source: nm } })");
    expect(ih).not.toContain("store.pick(nm); router.push({ path: '/xmigrate'");
  });
});
