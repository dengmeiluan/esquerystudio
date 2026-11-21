/**
 * 2026-11-22 批：DONE 作业「等价验证」（api.xb.verifyEquivalence 只读收尾核对）。
 *
 *   ① 入口条件——行动区按钮仅 DONE 且有 destIndex 的行在场（RUNNING/无 destIndex 不出）；
 *     详情 footer 同款按钮同条件；
 *   ② 请求契约——点击即调 api.xb.verifyEquivalence({jobId, sampleSize:100})，弹层加载态；
 *   ③ EQUIVALENT——绿 verdict 大徽标 + countsMatch 计数一致徽标 + 样本 matched/checked +
 *     空明细显示「样本全部匹配」；
 *   ④ DIVERGENT——红 verdict + 计数不一致 + missingInDest/mismatched（id+reason）明细 +
 *     服务端截断标志如实标注；
 *   ⑤ INCONCLUSIVE——中性 verdict + warnings 列表；
 *   ⑥ 错误态——内联展示可复制（不冒充结论）；加载中防重入（在途二次点击不重复发请求）。
 * 挂具范式同 xmigrateUx1120（全真挂载 + api/copyText mock；n-modal teleport 查 document）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbEvents = vi.fn();
const xbVerify = vi.fn();
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
      xb: {
        ...actual.api.xb,
        jobs: (...a: any[]) => xbJobs(...a),
        destIndices: async () => [],
        events: (...a: any[]) => xbEvents(...a),
        verifyEquivalence: (...a: any[]) => xbVerify(...a),
      },
    },
  };
});
vi.mock('../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/format')>();
  return { ...actual, copyText: (...a: any[]) => copyTextFn(...a) };
});

const NOW = Date.now();
const DONE_JOB = {
  jobId: 'j-vf', status: 'DONE', destIndex: 'dest-vf', sourceIndex: 'src-vf',
  remoteEndpoint: 'http://old:9200', migrated: 100, total: 100, conflicts: 0, errors: 0,
  createTime: NOW - 60000, startedAtMs: NOW - 30000, finishedAtMs: NOW - 5000,
  sliceStatus: {}, sliceMigrated: {}, sliceErrors: {},
};

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

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([DONE_JOB]);
  xbEvents.mockReset().mockResolvedValue({ events: [] });
  xbVerify.mockReset();
  copyTextFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① 入口条件 + ② 请求契约 ═══ */
describe('等价验证 ①②：入口条件与请求契约', () => {
  it('DONE 且有 destIndex 行在场出「等价验证」钮；RUNNING / 无 destIndex 不出', async () => {
    xbJobs.mockResolvedValue([
      DONE_JOB,
      { ...DONE_JOB, jobId: 'j-run', status: 'RUNNING' },
      { ...DONE_JOB, jobId: 'j-nodest', destIndex: '' },
    ]);
    const { app, host } = await mountXm();
    const rows = [...host.querySelectorAll('.qrt-tbl tbody tr')];
    expect(rows.length).toBe(3);
    const btns = rows.map(r => r.querySelector('[data-test="xm-verify-btn"]'));
    expect(btns[0], 'DONE+destIndex 行有入口').toBeTruthy();
    expect(btns[1], 'RUNNING 行不出').toBeNull();
    expect(btns[2], 'DONE 无 destIndex 不出').toBeNull();
    expect(btns[0]!.textContent).toContain('等价验证');
    app.unmount();
  }, 8000);

  it('点击调 api.xb.verifyEquivalence({jobId, sampleSize:100})，弹层先出加载态再出结果', async () => {
    let resolveVerify: (v: any) => void = () => {};
    xbVerify.mockReturnValue(new Promise(r => { resolveVerify = r; }));
    const { app, host } = await mountXm();
    (host.querySelector('[data-test="xm-verify-btn"]') as HTMLButtonElement).click();
    await settle(2);
    expect(xbVerify).toHaveBeenCalledWith({ jobId: 'j-vf', sampleSize: 100 }, undefined);
    expect(document.querySelector('[data-test="xm-verify"]')).toBeTruthy();
    expect(document.querySelector('[data-test="xm-verify-loading"]'), '在途加载态').toBeTruthy();
    resolveVerify({
      source: { index: 'src-vf', count: 100 }, dest: { index: 'dest-vf', count: 100 },
      countsMatch: true,
      sample: { requested: 100, checked: 100, matched: 100, missingInDest: [], mismatched: [] },
      verdict: 'EQUIVALENT', warnings: [],
    });
    await settle(2);
    expect(document.querySelector('[data-test="xm-verify-loading"]'), '落定后加载态退场').toBeNull();
    app.unmount();
  }, 8000);
});

/* ═══ ③④⑤ 三 verdict 态渲染 ═══ */
describe('等价验证 ③④⑤：三 verdict 态', () => {
  async function openWith(result: any) {
    xbVerify.mockResolvedValue(result);
    const { app, host } = await mountXm();
    (host.querySelector('[data-test="xm-verify-btn"]') as HTMLButtonElement).click();
    await settle(4);
    return { app, host };
  }

  it('EQUIVALENT：绿大徽标 + 计数一致 + 样本 matched/checked + 空明细正面态', async () => {
    const { app } = await openWith({
      source: { index: 'src-vf', count: 12345 }, dest: { index: 'dest-vf', count: 12345 },
      countsMatch: true,
      sample: { requested: 100, checked: 100, matched: 100, missingInDest: [], mismatched: [], missingTruncated: false, mismatchTruncated: false },
      verdict: 'EQUIVALENT', warnings: [],
    });
    const verdict = document.querySelector('[data-test="xm-verify-verdict-EQUIVALENT"]');
    expect(verdict, 'EQUIVALENT verdict 徽标（data-test 带枚举原文）').toBeTruthy();
    expect(verdict!.className).toContain('xm-verify-v-g');
    expect(verdict!.textContent).toContain('等价');
    const counts = document.querySelector('[data-test="xm-verify-counts"]')!;
    expect(counts.textContent).toContain('src-vf');
    expect(counts.textContent).toContain('dest-vf');
    expect(counts.textContent).toContain('12,345');
    expect(counts.textContent).toContain('计数一致');
    const sample = document.querySelector('[data-test="xm-verify-sample"]')!;
    expect(sample.textContent).toContain('matched 100 / checked 100');
    expect(sample.textContent).toContain('样本全部匹配');
    expect(document.querySelector('[data-test="xm-verify-missing"]'), '无缺失清单').toBeNull();
    app.unmount();
  }, 8000);

  it('DIVERGENT：红大徽标 + 计数不一致 + 缺失/不一致明细（id+reason）+ 截断标志如实标注', async () => {
    const { app } = await openWith({
      source: { index: 'src-vf', count: 100 }, dest: { index: 'dest-vf', count: 97 },
      countsMatch: false,
      sample: {
        requested: 100, checked: 100, matched: 95,
        missingInDest: ['doc-1', 'doc-2'], mismatched: [{ id: 'doc-3', reason: '内容摘要不一致' }],
        missingTruncated: true, mismatchTruncated: false,
      },
      verdict: 'DIVERGENT', warnings: ['目标集群只读副本可能有写入延迟'],
    });
    const verdict = document.querySelector('[data-test="xm-verify-verdict-DIVERGENT"]')!;
    expect(verdict.className).toContain('xm-verify-v-r');
    expect(verdict.textContent).toContain('有分歧');
    expect(document.querySelector('[data-test="xm-verify-counts"]')!.textContent).toContain('计数不一致');
    const sampleSec = document.querySelector('[data-test="xm-verify-sample"]')!;
    const missing = document.querySelector('[data-test="xm-verify-missing"]')!;
    expect(missing.textContent).toContain('doc-1');
    expect(sampleSec.textContent).toContain('目标缺失 _id（2）');
    expect(sampleSec.textContent).toContain('已被服务端截断');
    const mismatched = document.querySelector('[data-test="xm-verify-mismatched"]')!;
    expect(mismatched.textContent).toContain('doc-3');
    expect(mismatched.textContent).toContain('内容摘要不一致');
    expect(mismatched.textContent, '无截断不标注截断').not.toContain('截断');
    const warns = document.querySelector('[data-test="xm-verify-warnings"]')!;
    expect(warns.textContent).toContain('写入延迟');
    app.unmount();
  }, 8000);

  it('INCONCLUSIVE：中性档大徽标（不吞枚举原文）', async () => {
    const { app } = await openWith({
      source: { index: 'src-vf', count: 100 }, dest: { index: 'dest-vf', count: null },
      countsMatch: false,
      sample: { requested: 100, checked: 0, matched: 0, missingInDest: [], mismatched: [] },
      verdict: 'INCONCLUSIVE', warnings: ['目标侧计数取数失败'],
    });
    const verdict = document.querySelector('[data-test="xm-verify-verdict-INCONCLUSIVE"]')!;
    expect(verdict.className).toContain('xm-verify-v-n');
    expect(verdict.textContent).toContain('无法判定');
    expect(verdict.textContent).toContain('INCONCLUSIVE');
    expect(document.querySelector('[data-test="xm-verify-warnings"]')!.textContent).toContain('目标侧计数取数失败');
    app.unmount();
  }, 8000);
});

/* ═══ ⑥ 错误态 + 防重入 + 详情 footer 入口 ═══ */
describe('等价验证 ⑥：错误态可复制 / 加载中防重入 / 详情 footer 同款入口', () => {
  it('请求失败：内联错误在场可复制（copyText 实参=错误原文），不冒充结论', async () => {
    xbVerify.mockRejectedValue(new Error('connection refused'));
    const { app, host } = await mountXm();
    (host.querySelector('[data-test="xm-verify-btn"]') as HTMLButtonElement).click();
    await settle(4);
    const err = document.querySelector('[data-test="xm-verify-err"]')!;
    expect(err, '内联错误态').toBeTruthy();
    expect(err.textContent).toContain('等价验证失败');
    expect(document.querySelector('[data-test="xm-verify-verdict-EQUIVALENT"]'), '失败不出结论徽标').toBeNull();
    (err.querySelector('button') as HTMLButtonElement).click();
    await settle(2);
    expect(copyTextFn).toHaveBeenCalledWith(expect.stringContaining('等价验证失败'));
    app.unmount();
  }, 8000);

  it('加载中防重入：在途期间二次点击不重复发请求', async () => {
    let resolveVerify: (v: any) => void = () => {};
    xbVerify.mockReturnValue(new Promise(r => { resolveVerify = r; }));
    const { app, host } = await mountXm();
    const btn = host.querySelector('[data-test="xm-verify-btn"]') as HTMLButtonElement;
    btn.click();
    await settle(2);
    btn.click();
    await settle(2);
    expect(xbVerify, '在途防重入：只发一次').toHaveBeenCalledTimes(1);
    resolveVerify({ verdict: 'EQUIVALENT', sample: {} });
    await settle(2);
    app.unmount();
  }, 8000);

  it('详情 footer 同款入口：DONE 作业详情弹窗在场，点击走同一验证链', async () => {
    xbVerify.mockResolvedValue({
      source: { index: 'src-vf', count: 100 }, dest: { index: 'dest-vf', count: 100 },
      countsMatch: true, sample: { requested: 100, checked: 100, matched: 100, missingInDest: [], mismatched: [] },
      verdict: 'EQUIVALENT', warnings: [],
    });
    const { app, host } = await mountXm();
    (host.querySelector('[aria-label^="作业详情"]') as HTMLButtonElement).click();
    await settle(2);
    const footBtn = document.querySelector('[data-test="xm-verify-detail-btn"]') as HTMLButtonElement;
    expect(footBtn, '详情 footer 等价验证钮在场').toBeTruthy();
    footBtn.click();
    await settle(4);
    expect(xbVerify).toHaveBeenCalledWith({ jobId: 'j-vf', sampleSize: 100 }, undefined);
    expect(document.querySelector('[data-test="xm-verify-verdict-EQUIVALENT"]')).toBeTruthy();
    app.unmount();
  }, 8000);
});
