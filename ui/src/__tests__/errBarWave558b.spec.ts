/**
 * 五百五十八批（工蚁C·b 轨4）：红壳合并 err-bar 档 + RawIo 第五波 + 统一件合并。
 *
 *  ① 红壳合并 err-bar 档（557 IH ih-qerr 先例，track2Wave557 只读学习）：ProfileFlame .pf-err /
 *     MatchMatrix .mm-err / BoostTuner .bt-err 三处私造红壳挂全局 err-bar（role=alert 在场，
 *     border/err-soft/radius 三件套退役归 theme.css :554 单源；视图只留顶对齐与落位节奏）；
 *     QueryXray vrErr 面板 .qx-verdict.bad 补 role=alert（verdict 徽标族与 err-bar 同 token 族，
 *     保守保形不挂类）；顺带 vr.error 裸 ES 串换 friendlyEsError 显示+title 保原文（:40 vrErr
 *     双轨口径补齐结论档漏网）+ tvId placeholder 补「数据浏览页复制」引导；
 *  ② RawIo 第五波三面铺装（546 CASES 字面锁同形态）：SearchTemplates（渲染/执行双响应面双钮，
 *     548 QueryXray 双钮先例）/ DiffEditor（getDoc/putDoc 对比面，/cluster/doc 读写同前缀）/
 *     BoostTuner（searchRaw 调参执行）。⚠ '/cluster/search-raw' 与 ScoreExplain/MatchMatrix
 *     同特征：页域各自取最近一条，跨页互见备案（MatchMatrix 557 头注同口径）。
 *  ③ 统一件合并：ConfigDrift 清单角标 cd-verdict **保形**——曾按任务令改用 StatusPill，因
 *     useCurrentIdxWritePages525:210-212 黑名单存量逐字锁互斥，经 Lead 裁决最小回滚（原负锁
 *     StatusPill 不用于 cd-verdict + 正锁原形态在场；五百六十批该 spec 解禁后已同步更新改用兑现，
 *     本文件 cd-verdict 锚已随批翻转——正锁 StatusPill 改用形态）；ConfigDrift/
 *     TasksView 两处手写过滤框改用 SearchFilterBar（Esc 清空内建/Enter
 *     定向转出，胶囊壳三件套归组件单源；tv-kw 类锚随 input-class 保留——sweep524 挂载过滤锁
 *     同路径零迁）。BrowserView bw-search 豁免勿动（547 豁免册既有条目）。
 *  ④ BoostTuner 滑杆权重动态提示（×N 随行值）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const pf = read('../views/ProfileFlameView.vue');
const mm = read('../views/MatchMatrixView.vue');
const bt = read('../views/BoostTunerView.vue');
const qx = read('../views/QueryXrayView.vue');
const st = read('../views/SearchTemplatesView.vue');
const df = read('../views/DiffEditorView.vue');
const cd = read('../views/ConfigDriftView.vue');
const tv = read('../views/TasksView.vue');

/* ═══════════ ① 红壳合并 err-bar 档 ═══════════ */

describe('558b ①：三面私造红壳挂全局 err-bar（557 IH 先例）', () => {
  const SHELLS = [
    { n: 'ProfileFlameView', s: pf, cls: 'pf-err', cond: 'v-else-if="runErr"' },
    { n: 'MatchMatrixView', s: mm, cls: 'mm-err', cond: 'v-if="runErr"' },
    { n: 'BoostTunerView', s: bt, cls: 'bt-err', cond: 'v-else-if="runErr"' },
  ];
  for (const c of SHELLS) {
    it(`${c.n}：role=alert 在场 + err-bar 类挂载（v-if 链同条件保形）`, () => {
      expect(c.s).toContain(`<div ${c.cond} role="alert" class="err-bar ${c.cls}">`);
    });
    it(`${c.n}：私造红壳三件套退役（border/err-soft/radius 归 theme.css .err-bar 单源），只留顶对齐与落位`, () => {
      expect(c.s, 'border 不回流').not.toMatch(new RegExp('\\.' + c.cls + ' \\{[^}]*border'));
      expect(c.s, 'err-soft 底不回流').not.toMatch(new RegExp('\\.' + c.cls + ' \\{[^}]*err-soft'));
      expect(c.s, 'radius 不回流').not.toMatch(new RegExp('\\.' + c.cls + ' \\{[^}]*border-radius'));
      expect(c.s, '多行面板顶对齐保留（IH .ih-qerr 同款）').toMatch(new RegExp('\\.' + c.cls + ' \\{[^}]*align-items: flex-start;'));
    });
  }
});

describe('558b ①：QueryXray 结论档补齐（role=alert + friendlyEsError + placeholder）', () => {
  it('vrErr 失败面板 role=alert 在场（.qx-verdict.bad verdict 族保形，token 与 err-bar 同源）', () => {
    expect(qx).toContain('<div v-if="vrErr" role="alert" class="qx-verdict bad qx-err-panel">');
  });
  it('vr.error 裸 ES 串换 friendlyEsError 显示 + :title 保原文（vrErr 双轨口径补齐）', () => {
    expect(qx).toContain('<span v-if="vr.error" class="qx-verr" :title="vr.error">{{ friendlyEsError(vr.error) }}</span>');
  });
  it('tvId placeholder 补「数据浏览页复制」引导', () => {
    expect(qx).toMatch(/<input v-model="tvId" class="qx-ii wide" placeholder="[^"]*数据浏览页[^"]*"/);
  });
});

/* ═══════════ ② RawIo 第五波三面铺装 ═══════════ */

describe('558b ②：RawIo 第五波铺装（546 CASES 字面锁同形态）', () => {
  const CASES: Array<{ f: string; labels: string[]; feats: string[] }> = [
    {
      f: 'SearchTemplatesView.vue',
      labels: ['查看原始 IO（模板渲染）', '查看原始 IO（模板执行查询）'],
      feats: ["ioRecorder.last('/cluster/render-template')", "ioRecorder.last('/cluster/search-template')"],
    },
    { f: 'DiffEditorView.vue', labels: ['查看原始 IO（文档读写）'], feats: ["ioRecorder.last('/cluster/doc')"] },
    { f: 'BoostTunerView.vue', labels: ['查看原始 IO（调参执行）'], feats: ["ioRecorder.last('/cluster/search-raw')"] },
  ];
  for (const c of CASES) {
    it(`${c.f}：钮 / 特征 / 弹窗挂载 / 判空 notify`, () => {
      const v = read('../views/' + c.f);
      expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
      expect(v).toContain('data-test="raw-io"');
      for (const l of c.labels) expect(v).toContain(`aria-label="${l}"`);
      for (const f of c.feats) expect(v).toContain(f);
      expect(v).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
      expect(v, '判空：rec=null 时 notify 引导（不开空弹窗），文案全站同口径').toContain("store.notify('info', '暂无原始 IO 记录");
    });
  }
  it('SearchTemplatesView：双响应面双钮各取各的记录（548 QueryXray 双钮先例）', () => {
    expect(st).toContain('data-test="raw-io"');
    expect(st).toContain('data-test="raw-io-search"');
    expect(st).toContain('openRawIoRender');
    expect(st).toContain('openRawIoSearch');
  });
  it('三面前缀语义：render-template/search-template/doc 互不混淆（search-raw 跨页互见已备案）', () => {
    const all = ['/cluster/render-template', '/cluster/search-template', '/cluster/doc'];
    expect(new Set(all).size).toBe(all.length);
    expect(st).toContain("ioRecorder.last('/cluster/render-template')");
    expect(st, '不得串入 doc 前缀').not.toContain("ioRecorder.last('/cluster/doc')");
    expect(df, '不得串入 template 前缀').not.toContain("ioRecorder.last('/cluster/search-template')");
  });
});

/* ═══════════ ③ 统一件合并 ═══════════ */

describe('558b ③：ConfigDrift 清单角标（五百六十批解禁改用同步更新）+ SearchFilterBar 两面合并', () => {
  it('ConfigDrift 清单角标改用 StatusPill（558b 回滚件随 525:210 解禁由五百六十批兑现：负锁翻转，tone 走 cdVerdictPill 映射）', () => {
    expect(cd, 'StatusPill 改用在场（tone=cdVerdictPill 映射消费，文案逐字）').toContain('<StatusPill v-if="verdicts[k.indexKey]" class="cd-verdict" :tone="cdVerdictPill(verdicts[k.indexKey])"');
    expect(cd, '手写 .pill 裸挂形态退役（558b 原正锁随批翻转）').not.toContain('class="cd-verdict pill"');
    expect(cd, '外层定位壳保留（absolute right/top，useCurrentIdxWritePages525:211 锁）').toMatch(/\.cd-verdict \{ position: absolute; right: 10px; top: 10px; \}/);
  });
  it('ConfigDrift/TasksView 过滤框改用 SearchFilterBar（Esc 清空内建/Enter 定向转出）', () => {
    expect(cd).toContain('<SearchFilterBar v-model="kw" class="cd-kw-inp" placeholder="搜 indexKey / 别名…" @enter="onHitKey" />');
    expect(cd, '手写过滤框退役').not.toContain('@keydown.enter.prevent="onHitKey"');
    expect(tv).toContain('<SearchFilterBar v-model="kw" class="tv-kw-wrap" input-class="tv-kw" placeholder="过滤 taskId / action / 描述…" />');
    expect(tv, 'ipt tv-kw 手写形态退役').not.toContain('class="ipt tv-kw"');
  });
});

/* ═══════════ ④ BoostTuner 滑杆权重提示 ═══════════ */

describe('558b ④：BoostTuner 滑杆动态权重提示', () => {
  it('bt-slider 补 :title（动态 ×N + multi_match 提权系数语义）', () => {
    /* 动态倍数走 fmtBoost 归一（草稿恢复值经 JSON.parse 不受类型约束，展示前
     Number 归一防 .toFixed 抛 TypeError；857 随刀锁随迁——锁语义 ×N 动态+multi_match 语义不变） */
    expect(bt).toMatch(/<input type="range" v-model\.number="x\.f\.boost"[^>]*:title="'权重 ×' \+ fmtBoost\(x\.f\.boost\) \+ '[^']*multi_match[^']*'"/);
  });
});

/* ═══════════ ③ 挂载行为：过滤仍工作 + Esc 清空 + StatusPill 胶囊 ═══════════ */

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterTasks: () => Promise.resolve([
        { taskId: 'node-es-01:123', action: 'indices:data/write/reindex', description: 'rebuild by hand', parentTaskId: '', startTimeMillis: 0, runningTimeNanos: 6e9, cancellable: false, status: null },
        { taskId: 'node-es-02:456', action: 'indices:data/read/search', description: 'scroll query', parentTaskId: '', startTimeMillis: 0, runningTimeNanos: 1e9, cancellable: false, status: null },
      ]),
      configLab: {
        ...actual.api.configLab,
        driftKeys: () => Promise.resolve([{ indexKey: 'FooIndex', alias: 'foo' }, { indexKey: 'BarIndex', alias: 'bar' }]),
        drift: () => Promise.resolve({
          liveExists: true, alias: 'foo', physicalIndex: 'foo_v1',
          settingsDiff: { clean: true, different: [], onlyInCode: [], onlyInLive: [] },
          mappingEqual: true, codeSettings: '{}', liveSettings: '{}', codeMapping: '{}', liveMapping: '{}',
        }),
      },
    },
  };
});

import TasksView from '../views/TasksView.vue';
import ConfigDriftView from '../views/ConfigDriftView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountComp(comp: unknown) {
  document.body.innerHTML = '';
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp as any) });
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

describe('558b ③：SearchFilterBar 两面挂载行为（过滤仍工作 + Esc 清空）', () => {
  it('TasksView：tv-kw 类锚落 input，过滤 taskId/描述仍工作，Esc 清空回全量', async () => {
    const { app, host } = await mountComp(TasksView);
    const inp = host.querySelector<HTMLInputElement>('input.tv-kw');
    expect(inp, 'tv-kw 类锚经 inputClass 落 input（sweep524 同路径）').toBeTruthy();
    inp!.value = 'reindex';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelectorAll('.tv-node').length, '过滤后仅剩 reindex 任务').toBe(1);
    inp!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(inp!.value, 'Esc 清空内建').toBe('');
    expect(host.querySelectorAll('.tv-node').length, '清空回全量').toBe(2);
    app.unmount();
  });

  it('ConfigDrift：kw 过滤仍工作 + Esc 清空；检测后清单角标 .pill 胶囊在场（cd-verdict pill 原形态）', async () => {
    const { app, host } = await mountComp(ConfigDriftView);
    const inp = host.querySelector<HTMLInputElement>('.cd-kw-inp input');
    expect(inp, 'SearchFilterBar 内 input 在场（.cd-kw-inp 落位类挂根）').toBeTruthy();
    inp!.value = 'foo';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelectorAll('.cd-item').length, '过滤后仅命中 FooIndex').toBe(1);
    inp!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(inp!.value, 'Esc 清空内建').toBe('');
    expect(host.querySelectorAll('.cd-item').length, '清空回全量').toBe(2);
    const scanBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('检测全部'));
    scanBtn!.click();
    await settle();
    const pill = host.querySelector('.cd-verdict.pill');
    expect(pill, '清单角标 .pill 胶囊在场（cd-verdict pill 原形态，外层定位壳保留）').toBeTruthy();
    expect(pill!.textContent).toContain('一致');
    app.unmount();
  });
});
