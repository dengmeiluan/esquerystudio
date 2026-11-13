/**
 * 五百三十一批工蚁 WD：rebuild/migrate 双页收口（源码锁 + 最小挂载）。
 *
 * A AdhocRebuildView：
 *   ① 中文接线锚——stageZh（job.stage 监控步/最近作业双点）、sevZh（校验报告 severity）、
 *     roundZh（轮次 r.phase，Lead 收口新增轮次域映射，未收录回退原英文）；
 *   ② 13 处手滚 pill → StatusPill 改用锚（锚类 ar-st-funnel/ar-st-en/sm 外挂保留，
 *     tone 走 statusTone/sevTone/stagePill 字面量收窄）；
 *   ③ step0 结构序锚——索引名行（card-t+row+探测失败条）在双 Tab 编辑器之前（先选索引再贴配置）；
 *   ④ 弹性档锚——粘贴配置 Monaco min(60vh, 420px) / 校验报告 val-box max(240px, 42vh) /
 *     最近作业 QRT max-height="none"（对齐 Xmigrate 滚动口径）；
 *   ⑤ 900 紧凑微调档在场（工具行 wrap/侧距收窄，档内零 ≥300px 裸 width）。
 *
 * B XmigrateView：
 *   ⑥ 状态 cell 改用 StatusPill（xmStatusZh 中文主显 + en 英文小字；n 档兜底——
 *     未命中枚举回显原文并进 title；RUNNING dot-pulse 随装退役）；
 *   ⑦ 进度 meta 手滚 mono 串 → MetaStrip（items+tone 分档：运行中 info/完成 ok；
 *     「N/T（P%）」「迁移中 N 条（总量未知）」文案对位）；
 *   ⑧ keyOpts localeCompare 字母序 + 最近选用置顶（usePref xm.recentKeys 落盘，cap 5）；
 *   ⑨ QRT 补 fieldTypes（进度/冲突/错误=long、发起=date——数值/日期徽标+区间过滤白得）；
 *     xm-group 三分节去 background（边框与 1/2/3 编号语义保留）；900 档查漏（xm-actions wrap）。
 *
 * 挂载面：状态/阶段中文渲染（Adhoc 最近作业表 + 监控步卡头、Xmigrate 作业表状态 cell）
 * 与进度 MetaStrip 渲染（Xmigrate）。Monaco stub 范式同 adhocJobsQrt529（happy-dom 必炸）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  adhocJobs: vi.fn(),
  adhocStatus: vi.fn(),
  xbJobs: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      keys: async () => [],
      clustersList: async () => [],
      clusterIndices: async () => [],
      overview: async () => ({}),
      clusterHealth: async () => ({}),
      adhoc: { ...orig.api.adhoc, jobs: mocks.adhocJobs, status: mocks.adhocStatus },
      xb: { ...orig.api.xb, jobs: mocks.xbJobs, destIndices: async () => [] },
    },
  };
});

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

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const adhoc = read('../views/AdhocRebuildView.vue');
const xm = read('../views/XmigrateView.vue');

const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountView(View: any) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
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
  localStorage.clear();
  sessionStorage.clear();
  monacoCaps.length = 0;
  mocks.adhocJobs.mockResolvedValue([]);
  mocks.adhocStatus.mockResolvedValue({});
  mocks.xbJobs.mockResolvedValue([]);
});

/* ═══ A① 中文接线锚（Lead 跨工蚁契约：esEnumZh sevZh/stageZh/roundZh——roundZh 为
   Lead 收口新增轮次域映射，实地核 addRound 四值 FULL/CATCHUP/CATCHUP_BLOCKED/FINAL） ═══ */
describe('531 A：AdhocRebuildView 中文接线（源码锚）', () => {
  it('stageZh 双点接线：监控步卡头 + 最近作业 #cell-stage（中文主体 + en 英文小字回显原枚举）', () => {
    expect(adhoc).toContain("import { sevZh, stageZh, roundZh } from '../utils/esEnumZh'");
    expect(adhoc).toContain(':label="stageZh(job.stage) || String(job.stage)"');
    expect(adhoc).toContain(':en="stageZh(job.stage) ? job.stage : undefined"');
    expect(adhoc).toContain(':label="stageZh(row[4]) || String(row[4] ?? \'\')"');
    expect(adhoc).toContain(':en="stageZh(row[4]) ? String(row[4] ?? \'\') : undefined"');
    /* stage 徽标 sm 锚类外挂保留（w80 徽标档位） */
    expect(adhoc).toContain('<StatusPill class="sm" :tone="stagePill(job.stage)"');
    expect(adhoc).toContain('<StatusPill class="sm" :tone="stagePill(row[4])"');
  });

  it('sevZh 接线校验报告；roundZh 接线轮次表（552 同步更新：改用 StatusPill b，未收录回退原英文）', () => {
    expect(adhoc).toContain(':label="sevZh(iss.severity)"');
    /* 轮次 phase：五百五十二批私造壳退役改用 StatusPill b——roundZh 命中即中文，
       未收录新枚举回退原英文（label 兜底），英文小字随组件 en 档回显 */
    expect(adhoc).toContain('<StatusPill tone="b" :label="roundZh(r.phase) || r.phase" :en="roundZh(r.phase) ? r.phase : undefined" />');
    /* 轮次私造壳/小字样式随改用全退役（状态+轮次 pill 小字视觉全归 StatusPill .sp-en） */
    expect(adhoc).not.toContain('ph-tag');
    expect(adhoc).not.toMatch(/^\.ar-st-en \{/m);
  });
});

/* ═══ A② StatusPill 改用锚（13 处手滚 pill 退役） ═══ */
describe('531 A：AdhocRebuildView StatusPill 改用（源码锚）', () => {
  it('统一件接线 + tone 字面量收窄包装在位', () => {
    expect(adhoc).toContain("import StatusPill from '../components/StatusPill.vue'");
    expect(adhoc).toMatch(/function statusTone\(s: any\): 'g' \| 'y' \| 'r' \| 'b' \| 'n'/);
    expect(adhoc).toMatch(/function sevTone\(s: any\): 'g' \| 'y' \| 'r' \| 'b' \| 'n'/);
    expect(adhoc).toMatch(/function stagePill\(s: any\): 'y' \| 'n'/);
  });

  it('校验报告/监控步卡头（状态+stage+锁安全四徽标）/作业表（漏斗+四徽标+stage）全数改用', () => {
    /* 211 校验报告 severity */
    expect(adhoc).toContain('<StatusPill :tone="sevTone(iss.severity)" :label="sevZh(iss.severity)" :en="iss.severity" />');
    /* 393 监控步作业状态（.ar-st-en 锚外挂）+ 400-403 锁安全四徽标（含 title） */
    expect(adhoc).toContain('<StatusPill v-if="job" class="ar-st-en" :tone="statusTone(job.status)"');
    expect(adhoc).toMatch(/<StatusPill v-if="job && job\.switchedWithoutLock" tone="r" label="无锁切换" title="/);
    expect(adhoc).toMatch(/<StatusPill v-else-if="job && job\.lockActive === false" tone="y" label="锁保护未生效" title="/);
    expect(adhoc).toMatch(/<StatusPill v-if="job && job\.gateOutcome === 'TIMED_OUT'" tone="y" label="确认超时" title="/);
    expect(adhoc).toMatch(/<StatusPill v-else-if="job && job\.gateOutcome === 'ABORTED'" tone="n" label="门已中止" title="/);
    /* 504 漏斗（role/aria-pressed/键盘 attrs 落根；ar-st-funnel + ar-st-en 双锚外挂）+ 508-511 四徽标 */
    expect(adhoc).toContain('<StatusPill class="ar-st-funnel ar-st-en" :tone="statusTone(row[3])"');
    expect(adhoc).toContain('role="button" tabindex="0"');
    expect(adhoc).toMatch(/:aria-pressed="jobStatusFilter === funnelKey\(row\[3\]\) \? 'true' : 'false'"/);
    /* 手滚形态零残留（改用勿留双份） */
    expect(adhoc).not.toContain('class="pill r" title=');
    expect(adhoc).not.toContain('class="pill y" title=');
    expect(adhoc).not.toContain('class="pill n" title=');
    expect(adhoc).not.toContain('<span class="pill" :class="statusColor(job.status)"');
  });

  it('挂载：最近作业表状态/阶段中文渲染（StatusPill 中文主体 + sp-en 英文小字）', async () => {
    mocks.adhocJobs.mockResolvedValue([
      { jobId: 'j-1', logicalName: 'idx', strategy: 'WRITE_BLOCK', status: 'RUNNING', stage: 'FULL_REINDEX', startedAt: 1700000000000 },
    ]);
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    /* 554 同步更新：.card 壳退役改 .ar-sec border-top 分节（定位语义=含作业表工具行的分节，不变） */
    const card = [...host.querySelectorAll('.ar-sec')].find(c => c.querySelector('.ar-jobs-tools'))!;
    const row = card.querySelector('tbody tr')!;
    expect(row.textContent).toContain('运行中');
    expect(row.textContent).toContain('全量重建');
    expect(row.textContent).toContain('RUNNING');
    expect(row.querySelector('.sp-en'), 'en 英文小字由组件 sp-en 渲染').toBeTruthy();
    /* 漏斗锚类仍挂 pill 根：点击过滤语义不回退 */
    const funnel = card.querySelector('.pill.ar-st-funnel') as HTMLElement;
    expect(funnel).toBeTruthy();
    funnel.click();
    await settle(4);
    expect(funnel.getAttribute('aria-pressed')).toBe('true');
    app.unmount();
  });

  it('挂载：监控步卡头状态+阶段中文（statusTone/stagePill 双 StatusPill）', async () => {
    mocks.adhocJobs.mockResolvedValue([
      { jobId: 'j-a', logicalName: 'idx', strategy: 'MANUAL', status: 'RUNNING', stage: 'SWITCH', startedAt: 1700000000000 },
    ]);
    mocks.adhocStatus.mockResolvedValue({ jobId: 'j-a', status: 'RUNNING', stage: 'FULL_REINDEX' });
    const View = (await import('../views/AdhocRebuildView.vue')).default;
    const { app, host } = await mountView(View);
    const watchBtn = host.querySelector('button[aria-label="查看任务详情"]') as HTMLElement;
    watchBtn.click();
    await settle();
    /* step4 卡头：状态中文 + 阶段中文 */
    expect(host.textContent).toContain('运行中');
    expect(host.textContent).toContain('全量重建');
    expect(host.querySelector('.card-t .pill'), '卡头状态 pill（StatusPill 根）在场').toBeTruthy();
    app.unmount();
  });
});

/* ═══ A③④⑤ 结构序 / 弹性档 / 900 档 ═══ */
describe('531 A：AdhocRebuildView 结构序与弹性档（源码锚）', () => {
  it('step0：索引名行（card-t+row+探测失败条）在双 Tab 编辑器之前（先选索引再贴配置）', () => {
    const cardT = adhoc.indexOf('<div class="card-t">选择要重建的逻辑索引名（别名或物理索引名均可）</div>');
    const tabs = adhoc.indexOf('<div class="ar-input-tabs">');
    const idxRow = adhoc.indexOf('<div ref="idxRowEl" class="row"');
    const probeErr = adhoc.indexOf('<div v-if="prepErr" class="ar-probe-err">');
    expect(cardT).toBeGreaterThan(-1);
    expect(tabs).toBeGreaterThan(-1);
    expect(cardT, '索引名卡头先于双 Tab').toBeLessThan(tabs);
    expect(idxRow, '索引名行先于双 Tab').toBeLessThan(tabs);
    expect(probeErr, '探测失败条随索引名行上移').toBeLessThan(tabs);
    /* 结构序换位不伤状态机/草稿键（adhocStateMachine/adhocStepPersist 口径） */
    expect(adhoc).toContain("const stepDraft = useScopedDraft('step', adhocScope, '0').text;");
    expect(adhoc).toContain("const indexName = useScopedDraft('index-name', adhocScope).text;");
  });

  it('弹性档三式：粘贴 Monaco useTierCycle 四档（原 min(60vh, 420px) 保底） / val-box max(240px, 42vh) / QRT max-height none', () => {
    /* 五百三十八批同步更新：height="min(60vh, 420px)" 定高字面 → :height="pasteH" 档值绑定
       （useTierCycle+usePref 落盘，原字面=档值数组首位=默认档，默认形态高度行为不变） */
    expect(adhoc).toContain("'min(60vh, 420px)'");
    expect(adhoc).toContain(':height="pasteH"');
    expect(adhoc).not.toContain('min(200px, 24vh)');
    expect(adhoc).toMatch(/\.val-box \{[^}]*max-height: max\(240px, 42vh\);/);
    expect(adhoc).not.toContain('max-height: 260px');
    expect(adhoc).toMatch(/storage-key="adhoc:jobs" max-height="none"/);
    expect(adhoc).not.toContain('max-height="420px"');
  });

  it('900 紧凑微调档在场且非空；档内零 ≥300px 裸 width；全文无 min-width:901px', () => {
    const block = adhoc.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
    expect(block, '900 档在场').toBeTruthy();
    expect(block![0], '900 档非空壳').toMatch(/\{[^{}]+\}/);
    for (const line of block![0].split('\n')) {
      const m = line.match(/(?:^|[^-.\w])width:\s*(\d{3,})px/);
      expect(!!m && Number(m[1]) >= 300, `900 档出现 ≥300px 裸 width：${line.trim()}`).toBe(false);
    }
    expect(adhoc).not.toContain('min-width: 901px');
  });
});

/* ═══ B⑥⑦⑧⑨ XmigrateView ═══ */
describe('531 B：XmigrateView 改用与排序（源码锚）', () => {
  it('状态 cell 改用 StatusPill：中文主显 + en 小字 + n 档兜底（未命中枚举回显原文进 title）', () => {
    expect(xm).toContain("import StatusPill from '../components/StatusPill.vue'");
    expect(xm).toContain(':label="statusZh(rowJob(row)?.status) || String(rowJob(row)?.status ?? \'\')"');
    expect(xm).toContain(':en="statusZh(rowJob(row)?.status) ? rowJob(row)?.status : undefined"');
    expect(xm).toContain(':title="xmStatusTitle(rowJob(row))"');
    expect(xm).toMatch(/function xmStatusTitle\(j: any\): string \| undefined/);
    /* 手滚形态零残留：dot-pulse 呼吸点与 xm-st-en 小字随装退役（换壳勿留双份；
       注释里的退役说明可提及字样，锁类定义/引用精确形态——w10 .val-sev 同口径） */
    expect(xm).not.toMatch(/class="dot-pulse/);
    expect(xm).not.toMatch(/\.xm-st-en/);
    expect(xm).not.toMatch(/class="xm-st-en/);
    expect(xm).not.toContain(':class="statusColor(rowJob(row)?.status)"');
  });

  it('进度 meta 换壳 MetaStrip：items+tone 分档，文案对位、原本地色档规则退役', () => {
    expect(xm).toContain("import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'");
    expect(xm).toContain('<MetaStrip class="xm-p-meta" :items="progressMeta(rowJob(row))" />');
    expect(xm).toMatch(/function progressMeta\(j: any\): MetaStripItem\[\]/);
    expect(xm).toContain("tone: j.status === 'RUNNING' ? 'info' : j.status === 'DONE' ? 'ok' : undefined");
    expect(xm).not.toContain('.xm-p-meta.xm-p-run');
    expect(xm).not.toContain('.xm-p-meta.xm-p-ok');
  });

  it('keyOpts：localeCompare 字母序 + 最近选用置顶（usePref xm.recentKeys，cap 5）', () => {
    expect(xm).toContain("const recentKeys = usePref<string[]>('xm.recentKeys', [])");
    expect(xm).toMatch(/function sortKeyOpts\(list: \{ label: string; value: string \}\[\]\)/);
    expect(xm).toContain('a.value.localeCompare(b.value)');
    expect(xm).toContain('[v, ...recentKeys.value.filter(k => k !== v)].slice(0, 5)');
    expect(xm).toContain('keyOpts.value = sortKeyOpts((await api.keys()).map((k: string) => ({ label: k, value: k })))');
  });

  it('QRT fieldTypes 数值/日期列 + xm-group 去 background + 900 档查漏', () => {
    expect(xm).toContain(":field-types=\"{ 进度: 'long', 冲突: 'long', 错误: 'long', 发起: 'date' }\"");
    /* xm-group：去 background 降视觉重量，边框/编号语义保留。
       五百四十七批锁同步更新：531 字面形（margin-bottom:var(--sp-3)…border-radius:var(--r-m)）
       自 534 批起就是被覆盖行压死的死规则，547 批将其退役删除——断言由「在场」改「退役」；
       现行生效形态（border-top 分节覆盖行）改由 rebuildFlat534:97 与 cardShellWave547 正锁 */
    expect(xm).not.toMatch(/\.xm-group \{ margin-bottom: var\(--sp-3\); padding: var\(--sp-2\) var\(--sp-3\); border: 1px solid var\(--line\); border-radius: var\(--r-m\); \}/);
    expect(xm).not.toMatch(/\.xm-group \{[^}]*background/);
    expect(xm).toContain('<span class="xm-g-num">1</span>');
    expect(xm).toContain('<span class="xm-g-num">2</span>');
    expect(xm).toContain('<span class="xm-g-num">3</span>');
    /* 900 档查漏：xm-actions wrap + xm-remote 侧距收窄 */
    const block = xm.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
    expect(block, '900 档在场').toBeTruthy();
    expect(block![0]).toContain('.xm-actions { flex-wrap: wrap; gap: var(--sp-2); }');
    expect(block![0]).toContain('.xm-remote { padding: var(--sp-2); }');
    /* --sp 裸 px 合并（2px → --sp-0 半档）。五百五十一批同步更新（击穿者：551 轨2 刀①——
       新建迁移 .card 壳退役，草稿行落位 margin 承接壳 padding，盒模型等值） */
    expect(xm).toMatch(/\.xm-p-obs \{[^}]*margin-top: var\(--sp-0\);/);
    expect(xm).toMatch(/\.xm-draft-row \{ margin: var\(--sp-2\) var\(--sp-4\) var\(--sp-2\); \}/);
  });

  it('挂载：状态 cell 中文渲染 + 进度 MetaStrip 渲染（文案对位）', async () => {
    mocks.xbJobs.mockResolvedValue([
      { jobId: 'xm-1', status: 'DONE', destIndex: 'dest-x', sourceIndex: 'src-x', remoteEndpoint: '', migrated: 10, total: 10, conflicts: 0, errors: 0, createTime: 1700000000000, sliceStatus: {} },
    ]);
    const View = (await import('../views/XmigrateView.vue')).default;
    const { app, host } = await mountView(View);
    const row = host.querySelector('.qrt-tbl tbody tr')!;
    expect(row.textContent).toContain('已完成');
    expect(row.querySelector('.sp-en')!.textContent).toBe('DONE');
    /* 进度 meta：MetaStrip（.ms 根合并 xm-p-meta 类），「10/10（100%）」对位 */
    const meta = host.querySelector('.xm-p-meta')!;
    expect(meta.textContent).toContain('10');
    expect(meta.textContent).toContain('/10（100%）');
    app.unmount();
  });
});
