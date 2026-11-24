/**
 * 一千一百二十批：XmigrateView 前端可观测性/便捷性六项（行为锚 + 源码锚）。
 *
 * 行为面：
 *   ① pctOf 已处理口径——(migrated+conflicts+errors)/total：纯 migrated / 含跳过 /
 *     含错误三分量各自计入；重复迁移（migrated=0 全跳过）不再恒 0%；total 未知降级不回归；
 *   ② progressMeta 跳过段——conflicts>0 挂「N 跳过」+tip（幂等语义）；conflicts=0 不显；
 *   ③ DONE 目标对账段——宿主清单 docs.count 对比已处理量（migrated+conflicts），
 *     差异≠0 挂 warn；清单无该索引/差异=0/非 DONE 不显（不冒充）；
 *   ④ 速率曲线——轮询两拍出 SparkLine，终态（值不变）保留最后曲线；
 *   ⑤ 三档条数——30/100/500 切换即按新档值拉取。
 * 源码锚：三档钮/回填四字段/预览钮移出模式门/对账段组装/SparkLine 接线/新口径公式。
 * 挂具范式同 xmFetchCfgPanel960（setupState 直调 + 全真挂载）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import XmigrateView from '../views/XmigrateView.vue';

const xbJobs = vi.fn();
const xbDestIndices = vi.fn();
const xbDeleteJob = vi.fn();
const askConfirmFn = vi.fn();

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
        destIndices: (...a: any[]) => xbDestIndices(...a),
        deleteJob: (...a: any[]) => xbDeleteJob(...a),
      },
    },
  };
});
/* 速率历史持久化用例需要：行删除链确认窗自动放行 */
vi.mock('../composables/confirm', () => ({
  askConfirm: (...a: any[]) => askConfirmFn(...a),
}));

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

const baseJob = (over: Record<string, any>) => ({
  jobId: 'j-1120', status: 'DONE', destIndex: 'dest-rc', sourceIndex: 'src-rc',
  remoteEndpoint: '', migrated: 100, total: 200, conflicts: 0, errors: 0,
  createTime: 1700000000000, sliceStatus: {}, ...over,
});

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  xbJobs.mockReset().mockResolvedValue([]);
  xbDestIndices.mockReset().mockResolvedValue([]);
  xbDeleteJob.mockReset().mockResolvedValue(undefined);
  askConfirmFn.mockReset().mockResolvedValue(true);
  (Element.prototype as any).scrollIntoView = vi.fn();
});

/* ═══ ① pctOf 已处理口径（setupState 直调） ═══ */
describe('1120 ①：pctOf 三口径（已处理=migrated+conflicts+errors）', () => {
  it('纯 migrated / 含 conflicts / 含 errors 三分量各自计入', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    expect(st.pctOf({ total: 200, migrated: 100, conflicts: 0, errors: 0 }), '纯 migrated').toBe(50);
    expect(st.pctOf({ total: 200, migrated: 60, conflicts: 30, errors: 0 }), 'conflicts 计入').toBe(45);
    expect(st.pctOf({ total: 200, migrated: 60, conflicts: 0, errors: 30 }), 'errors 计入').toBe(45);
    app.unmount();
  });

  it('重复迁移（migrated=0 全跳过）不再恒 0%；超量 clamp 100；total 未知降级不回归', async () => {
    const { app } = await mountXm();
    const st = stateOf(app);
    expect(st.pctOf({ total: 100, migrated: 0, conflicts: 100, errors: 0 }), '全跳过=已处理满量').toBe(100);
    expect(st.pctOf({ total: 100, migrated: 90, conflicts: 20, errors: 5 }), 'clamp 100').toBe(100);
    expect(st.pctOf({ total: 0, migrated: 5, status: 'RUNNING' }), 'total 未知运行中仍 0').toBe(0);
    expect(st.pctOf({ total: 0, migrated: 5, status: 'DONE' }), 'total 未知 DONE 仍 100').toBe(100);
    app.unmount();
  });
});

/* ═══ ② 跳过段渲染（挂载）+ ③ DONE 对账段（挂载 + 直调） ═══ */
describe('1120 ②③：progressMeta 跳过段与 DONE 目标对账段', () => {
  it('conflicts>0 → 「N 跳过」段在场含幂等 tip；conflicts=0 不显', async () => {
    xbJobs.mockResolvedValue([baseJob({ conflicts: 25 })]);
    const { app, host } = await mountXm();
    const meta = host.querySelector('.xm-p-meta')!;
    expect(meta.textContent).toContain('25');
    expect(meta.textContent).toContain('跳过');
    /* MetaStrip tip 通道随全站 v-tip 迁移不再落原生 title 属性——有 tip 的段挂 .help 类（锚随迁更新） */
    const skipEl = meta.querySelector('.ms-i.help')!;
    expect(skipEl, 'tip 挂段上（create 语义跳过非失败，help 档类在场）').toBeTruthy();
    app.unmount();

    xbJobs.mockResolvedValue([baseJob({ conflicts: 0 })]);
    const m2 = await mountXm();
    expect(m2.host.querySelector('.xm-p-meta')!.textContent).not.toContain('跳过');
    m2.app.unmount();
  });

  it('DONE 且清单 docs.count 与已处理差≠0 → warn 段「目标实存 N · 与已处理差 M」', async () => {
    xbDestIndices.mockResolvedValue([{ index: 'dest-rc', 'docs.count': '130' }]);
    xbJobs.mockResolvedValue([baseJob({ migrated: 100, conflicts: 25 })]); /* 已处理 125，实存 130 差 +5 */
    const { app, host } = await mountXm();
    const meta = host.querySelector('.xm-p-meta')!;
    expect(meta.textContent).toContain('目标实存 130');
    expect(meta.textContent).toContain('与已处理差 5');
    expect(meta.querySelector('b.ms-warn'), '差异段 warn 色档').toBeTruthy();
    app.unmount();
  });

  it('直调 destReconcileMeta：差异=0/清单无该索引/非 DONE 均不显（不冒充）', async () => {
    xbDestIndices.mockResolvedValue([{ index: 'dest-rc', 'docs.count': '125' }]);
    const { app } = await mountXm();
    const st = stateOf(app);
    const j = baseJob({ migrated: 100, conflicts: 25 });
    expect(st.destReconcileMeta(j), '实存=已处理 125：无差异不出段').toBeNull();
    expect(st.destReconcileMeta(baseJob({ destIndex: 'dest-gone' })), '清单无该索引：不冒充').toBeNull();
    expect(st.destReconcileMeta(baseJob({ status: 'RUNNING' })), '非 DONE 不对账').toBeNull();
    expect(st.destReconcileMeta(baseJob({ status: 'DONE', destIndex: '' })), '无 destIndex 不对账').toBeNull();
    const neg = st.destReconcileMeta(baseJob({ migrated: 130, conflicts: 0 })); /* 实存 125 < 已处理 130 */
    expect(neg?.unit).toContain('与已处理差 -5');
    app.unmount();
  });
});

/* ═══ ④ 速率曲线（轮询采样环形缓冲 → SparkLine） ═══ */
describe('1120 ④：速率曲线（SparkLine 接线，DONE 保留最后曲线）', () => {
  it('首拍单点不绘；第二拍值变化出线；终态值不变曲线保留', async () => {
    xbJobs.mockResolvedValueOnce([baseJob({ status: 'RUNNING', migrated: 100 })]);
    const { app, host } = await mountXm();
    expect(host.querySelector('.xm-p-spark'), '首拍单点不出线').toBeNull();
    const refresh = () => host.querySelector<HTMLButtonElement>('button[aria-label="刷新任务列表"]')!.click();
    xbJobs.mockResolvedValueOnce([baseJob({ status: 'RUNNING', migrated: 200 })]);
    refresh();
    await settle(6);
    const spark = host.querySelector('.xm-p-spark');
    expect(spark, '两拍采样出趋势线').toBeTruthy();
    expect(spark!.querySelector('polyline')!.getAttribute('points')).toBeTruthy();
    xbJobs.mockResolvedValueOnce([baseJob({ status: 'DONE', migrated: 200 })]); /* 终态值不变 */
    refresh();
    await settle(6);
    expect(host.querySelector('.xm-p-spark'), '终态保留最后曲线').toBeTruthy();
    app.unmount();
  });

  it('缓冲 cap 60：setupState 直查环形结构 (t, migrated)', async () => {
    xbJobs.mockResolvedValueOnce([baseJob({ migrated: 1 })]);
    const { app } = await mountXm();
    const st = stateOf(app);
    const buf = st.rateHist.get('j-1120');
    expect(buf.length).toBe(1);
    expect(buf[0]).toMatchObject({ m: 1 });
    expect(typeof buf[0].t).toBe('number');
    app.unmount();
  });
});

/* ═══ ④b 速率历史持久化（xm-rate-hist-v1：载入补水 / 采样落盘 / 删除清键 / 键数 cap 50） ═══ */
describe('1120 ④b：速率历史持久化（localStorage xm-rate-hist-v1）', () => {
  it('载入补水：预置历史两点 + 首拍值与尾点相同（不推新点）→ SparkLine 首拍即出线', async () => {
    localStorage.setItem('xm-rate-hist-v1', JSON.stringify({
      'j-1120': [{ t: Date.now() - 60000, m: 100 }, { t: Date.now() - 30000, m: 200 }],
    }));
    xbJobs.mockResolvedValueOnce([baseJob({ status: 'RUNNING', migrated: 200 })]);
    const { app, host } = await mountXm();
    const spark = host.querySelector('.xm-p-spark');
    expect(spark, '载入历史两点 → 首拍即绘（无需等第二拍采样）').toBeTruthy();
    expect(spark!.querySelector('polyline')!.getAttribute('points')).toBeTruthy();
    app.unmount();
  });

  it('采样落盘：两拍值变化后 xm-rate-hist-v1 含该 job 两点序列', async () => {
    xbJobs.mockResolvedValueOnce([baseJob({ status: 'RUNNING', migrated: 100 })]);
    const { app, host } = await mountXm();
    expect(JSON.parse(localStorage.getItem('xm-rate-hist-v1')!), '首拍落盘').toEqual({
      'j-1120': [expect.objectContaining({ m: 100 })],
    });
    xbJobs.mockResolvedValueOnce([baseJob({ status: 'RUNNING', migrated: 300 })]);
    (host.querySelector('button[aria-label="刷新任务列表"]') as HTMLButtonElement).click();
    await settle(6);
    const stored = JSON.parse(localStorage.getItem('xm-rate-hist-v1')!) as Record<string, { t: number; m: number }[]>;
    expect(stored['j-1120'].map(p => p.m), '第二拍新点追加落盘').toEqual([100, 300]);
    app.unmount();
  });

  it('行删除同步清键：确认删除后 xm-rate-hist-v1 不再含该 job', async () => {
    xbJobs.mockResolvedValue([baseJob({ status: 'DONE', migrated: 100 })]);
    const { app, host } = await mountXm();
    expect(JSON.parse(localStorage.getItem('xm-rate-hist-v1')!)['j-1120']).toBeTruthy();
    (host.querySelector('button[aria-label="删除记录"]') as HTMLButtonElement).click();
    await settle(6);
    expect(xbDeleteJob).toHaveBeenCalledWith('j-1120', undefined);
    const stored = JSON.parse(localStorage.getItem('xm-rate-hist-v1')!) as Record<string, unknown>;
    expect(stored['j-1120'], '删除记录后速率历史键同步清除').toBeUndefined();
    app.unmount();
  });

  it('键数 cap 50：超限按最后采样时间淘汰最旧（新采样拍落盘时收敛）', async () => {
    const seed: Record<string, { t: number; m: number }[]> = {};
    for (let i = 0; i < 51; i++) seed['old-' + i] = [{ t: 1000 + i, m: i }];
    localStorage.setItem('xm-rate-hist-v1', JSON.stringify(seed));
    xbJobs.mockResolvedValueOnce([baseJob({ status: 'RUNNING', migrated: 42 })]);
    const { app } = await mountXm();
    const stored = JSON.parse(localStorage.getItem('xm-rate-hist-v1')!) as Record<string, unknown>;
    const keys = Object.keys(stored);
    expect(keys.length, '51 旧键 + 1 新键 → 收敛 50').toBe(50);
    expect(stored['old-0'], '最后采样时间最早的键被淘汰').toBeUndefined();
    expect(stored['old-1'], '次旧键同样淘汰（52→50）').toBeUndefined();
    expect(stored['j-1120'], '新采样键在场').toBeTruthy();
    app.unmount();
  });
});

/* ═══ ⑤ 三档条数（切换即按新档值拉取） ═══ */
describe('1120 ⑤：作业表条数三档（30/100/500，选择记忆）', () => {
  it('默认 30 拉取；点击 500 档即以 500 重拉', async () => {
    xbJobs.mockResolvedValue([baseJob({})]);
    const { app, host } = await mountXm();
    expect(xbJobs).toHaveBeenLastCalledWith(30, undefined);
    const seg = host.querySelector('.xm-jobs-limit')!;
    const btn500 = [...seg.querySelectorAll('button')].find(b => b.textContent === '500')! as HTMLButtonElement;
    btn500.click();
    await settle(6);
    expect(xbJobs).toHaveBeenLastCalledWith(500, undefined);
    expect(localStorage.getItem('esquerystudio.pref.xm.jobsLimit')).toBe('500');
    app.unmount();
  });
});

/* ═══ 源码锚（六项接线 + 旧形态不回流） ═══ */
describe('1120 源码锚：六项接线', () => {
  const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

  it('① 对账段组装：destIndices 清单按 destIndex 取 docs.count，与 migrated+conflicts 对比', () => {
    expect(src).toContain('function destReconcileMeta(j: any): MetaStripItem | null');
    expect(src).toContain("Number(hit?.['docs.count'])");
    expect(src).toContain('const diff = actual - (Number(j.migrated || 0) + Number(j.conflicts || 0));');
    expect(src).toContain('目标实存 ${fmtNum(actual)}');
    expect(src).toContain('与已处理差 ${fmtNum(diff)}');
    expect(src).toContain('...(rec ? [rec] : [])');
  });

  it('② SparkLine 接线：(t, migrated) 环形缓冲 cap 60 + 轮询拍采样 + 进度列挂线', () => {
    expect(src).toContain("import SparkLine from '../components/SparkLine.vue';");
    expect(src).toContain('const rateHist = reactive(new Map<string, { t: number; m: number }[]>())');
    expect(src).toContain('const XM_RATE_CAP = 60;');
    expect(src).toMatch(/buf\.push\(\{ t: now, m \}\);/);
    expect(src).toContain('pushRateSamples(); /* 速率环形缓冲随拍采样（弃拍在上方 return，不采旧数据） */');
    expect(src).toContain('<SparkLine v-if="sp.length >= 2" class="xm-p-spark" :data="sp" :w="96" :h="16" />');
    /* 1120 单调化：单元素 v-for 局部变量让 sparkOf 每行只求值一次（原 v-if/:data 双调各建一次数组） */
    expect(src).toContain(`<template v-for="sp in [sparkOf(rowJob(row))]" :key="'sp'">`);
  });

  it('③ 三档钮：JOBS_LIMIT_TIERS + usePref 记忆 + loadJobs 实参换档值变量', () => {
    expect(src).toContain('const JOBS_LIMIT_TIERS = [30, 100, 500];');
    expect(src).toContain("usePref<number>('xm.jobsLimit', 30)");
    expect(src).toContain('api.xb.jobs(jobsLimit.value, srcConnId.value || undefined)');
    expect(src).toContain('v-for="n in JOBS_LIMIT_TIERS"');
    /* 写死 30 不回流 */
    expect(src).not.toContain('api.xb.jobs(30,');
  });

  it('④ 回填四字段：destCreateMode/tuneMode/slices/batchSize 随作业回填（null 安全回退默认）', () => {
    expect(src).toContain('form.value.destCreateMode = destModes.value.some(o => o.k === mode) ? mode : XM_FORM_DEFAULT.destCreateMode;');
    expect(src).toContain('form.value.tuneMode = j.tuneMode || XM_FORM_DEFAULT.tuneMode;');
    expect(src).toContain('form.value.slices = Number(j.slices) > 0 ? Number(j.slices) : XM_FORM_DEFAULT.slices;');
    expect(src).toContain('form.value.batchSize = Number(j.batchSize) > 0 ? Number(j.batchSize) : XM_FORM_DEFAULT.batchSize;');
    /* 旧「置默认」形态与旧 toast 文案不回流 */
    expect(src).not.toContain('form.value.tuneMode = XM_FORM_DEFAULT.tuneMode;');
    expect(src).not.toContain('已重置默认');
  });

  it('⑤ 预览钮移出模式门：.xm-cfg 分节不再被 COPY_FROM_SOURCE v-if 包裹', () => {
    expect(src).not.toContain('<div v-if="form.destCreateMode === \'COPY_FROM_SOURCE\'" class="xm-cfg">');
    expect(src).toContain('<button v-if="canOps" class="btn sm" :disabled="!form.sourceIndex || checking" @click="fetchCfg">');
  });

  it('⑥ pctOf 新口径公式 + 跳过段幂等 tip；旧纯 migrated 公式不回流', () => {
    expect(src).toContain('return Math.min(100, Math.round((((j.migrated || 0) + (j.conflicts || 0) + (j.errors || 0)) / j.total) * 100));');
    /* 旧纯 migrated 公式不回流 */
    expect(src).not.toMatch(/\(\(j\.migrated \|\| 0\) \/ j\.total\) \* 100/);
    expect(src).toContain("tip: '目标已存在同 _id 按 create 语义跳过（幂等），非失败'");
  });
});
