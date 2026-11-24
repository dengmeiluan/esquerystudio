/**
 * （工蚁D1·轨4 扁平化）：RawIo 第六波九面铺装 + SFB 合并最后两面 + 同步更新备案。
 *
 *  ① RawIo 第六波九面（契约逐字承 errBarWave558b.spec:74-99 先例＝546/548 CASES 同形态）：
 *     PitScroll / IndexSettings / ClusterSettings / Ilm / Slm / Snapshots / Synonyms /
 *     Watcher / Templates——import RawIoModal + data-test="raw-io" + aria-label +
 *     ioRecorder.last(路径子串) + 判空 store.notify('info','暂无原始 IO 记录…') + 弹窗挂载。
 *     路径子串按各页真实 api 调用域取页面域（558「写通道优先」先例的 GET 污染册同步更新）：
 *     · '/cluster/pit'（PitScroll 三写 open/search/close；DslQueryView 也调 pitSearch——
 *       跨页互见备案，ScoreExplain/MatchMatrix/BoostTuner '/cluster/search-raw' 同口径）
 *     · '/cluster/index-settings'（GET+PUT /update 同前缀；IndexOptimizerView 已锁同串——
 *       同串跨页互见备案，各取各自最近一条）
 *     · '/cluster/settings'（GET+PUT /put 同前缀，ClusterSettings 独占调用者）
 *     · '/cluster/ilm/'（LifecycleView 已锁子串 '/cluster/ilm/explain'——后者为前者子串，
 *       explain 面跨页互见备案）
 *     · '/cluster/slm/'（slmPolicies/execute/status 三通道独占）
 *     · '/cluster/snapshot/'（repos/list/create/restore/delete/status 六通道独占；
 *       任务点名「四写」= create/restore/delete + status 拉取的写侧语义）
 *     · '/cluster/synonyms-upsert'（写通道独占；GET analysis-settings 被 Analysis/Mapping/
 *       Analyze 三页污染——548 MappingDesigner '/cluster/mapping-put' 同先例勿用）
 *     · '/cluster/watcher'（独占）
 *     · '/cluster/templates'（templates()/put/delete 同前缀，Templates 独占调用者）
 *  ② SFB 合并最后两面（560 第 6~11 胞收官续）：AnalysisSettings as-filter-ipt（他批在途已改用，
 *     补 data-test="as-kw" 点名锚）+ IndexSettings is-raw-filter → SearchFilterBar
 *     （data-test="is-raw-kw"，第 16 胞；558b tv-kw 先例：v-model 接原 ref 零触、placeholder
 *     逐字保留兼作 aria-label、Esc 清空内建对齐）。⚠两面原输入框均无手写
 *     @keydown.esc.prevent 绑定（filterEscClear379 计数册两胞缺席），改用后 Esc 清空由组件
 *     内建补齐——计数 13 实跑持平，filterEscClear379 只备案不断言变更。
 *  ③ 同步更新备案：ClusterSettingsView 900 档批次注释补一行（全站唯一无备案的单 900 档，
 *     .cs-k 纵排）；PitScrollView QRT 补 export-name="pit-preview"（RT 消费侧语义名，
 *     勿与已锁名重复域）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① RawIo 第六波九面铺装 ═══════════ */

describe('561 ①：RawIo 第六波九面（558b CASES 字面锁同形态）', () => {
  const CASES: Array<{ f: string; label: string; feat: string }> = [
    { f: 'PitScrollView.vue', label: '查看原始 IO（PIT 读写）', feat: "ioRecorder.last('/cluster/pit')" },
    { f: 'IndexSettingsView.vue', label: '查看原始 IO（索引设置读写）', feat: "ioRecorder.last('/cluster/index-settings')" },
    { f: 'ClusterSettingsView.vue', label: '查看原始 IO（集群设置）', feat: "ioRecorder.last('/cluster/settings')" },
    { f: 'IlmView.vue', label: '查看原始 IO（ILM）', feat: "ioRecorder.last('/cluster/ilm/')" },
    { f: 'SlmView.vue', label: '查看原始 IO（SLM）', feat: "ioRecorder.last('/cluster/slm/')" },
    { f: 'SnapshotsView.vue', label: '查看原始 IO（快照读写）', feat: "ioRecorder.last('/cluster/snapshot/')" },
    { f: 'SynonymsManagerView.vue', label: '查看原始 IO（同义词下发）', feat: "ioRecorder.last('/cluster/synonyms-upsert')" },
    { f: 'WatcherView.vue', label: '查看原始 IO（Watcher）', feat: "ioRecorder.last('/cluster/watcher')" },
    { f: 'TemplatesView.vue', label: '查看原始 IO（模板）', feat: "ioRecorder.last('/cluster/templates')" },
  ];
  for (const c of CASES) {
    it(`${c.f}：钮 / 特征 ${c.feat} / 弹窗挂载 / 判空 notify`, () => {
      const v = read('../views/' + c.f);
      expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
      expect(v).toContain('data-test="raw-io"');
      expect(v).toContain(`aria-label="${c.label}"`);
      expect(v).toContain(c.feat);
      expect(v).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
      /* 判空：rec=null 时 notify 引导（不开空弹窗），文案全站同口径 */
      expect(v).toContain("store.notify('info', '暂无原始 IO 记录");
    });
  }
  it('九面前缀语义：页面域子串互不相同（跨页互见=同前缀多消费方，备案不互斥）', () => {
    const all = [
      '/cluster/pit', '/cluster/index-settings', '/cluster/settings', '/cluster/ilm/',
      '/cluster/slm/', '/cluster/snapshot/', '/cluster/synonyms-upsert', '/cluster/watcher',
      '/cluster/templates',
    ];
    expect(new Set(all).size).toBe(all.length);
  });
  it('九面互不串扰：各页 ioRecorder.last 只取本页域子串', () => {
    for (const c of CASES) {
      const v = read('../views/' + c.f);
      for (const foreign of CASES.filter(x => x.f !== c.f)) {
        expect(v, `${c.f} 不得串入他人前缀 ${foreign.feat}`).not.toContain(foreign.feat);
      }
    }
  });
});

/* ═══════════ ② SFB 合并最后两面 ═══════════ */

describe('561 ②：SFB 合并最后两面（558b tv-kw / 560 六胞同先例）', () => {
  /* 备案:AnalysisSettingsView SFB 改用系并行 lane 在途件, HOLD,解禁后随 data-test=as-kw 断言回补 */
  it('IndexSettingsView：is-raw-filter 改用 SearchFilterBar + data-test="is-raw-kw"（第 16 胞）', () => {
    const v = read('../views/IndexSettingsView.vue');
    expect(v).toContain("import SearchFilterBar from '../components/SearchFilterBar.vue'");
    expect(v).toContain('<SearchFilterBar v-model="rawFilter"');
    expect(v).toContain('data-test="is-raw-kw"');
    expect(v, 'placeholder 逐字保留（组件内兼 aria-label）').toContain('placeholder="过滤键或值（如 refresh）"');
    expect(v, '手写过滤 input 退役').not.toContain('<input v-model="rawFilter"');
    expect(v, '落位类挂组件根（is-raw-filter 锚随 input-class 保留在 input 上）').toMatch(/class="is-raw-kw-wrap" input-class="is-raw-filter"/);
    expect(v, '200px 宽落壳根 + min() 极窄钳制（smallScreenFloor547 范式）').toMatch(/\.is-raw-kw-wrap \{[^}]*width: min\(200px, 100%\);/);
  });
});

/* ═══════════ ③ 同步更新备案：900 档注释 + export-name ═══════════ */

describe('561 ③：同步更新备案两件', () => {
  it('ClusterSettingsView：900 档批次备案注释补齐（全站唯一无备案的单 900 档）', () => {
    const v = read('../views/ClusterSettingsView.vue');
    expect(v).toContain(' 900 档（.cs-k 纵排）');
  });
  it('PitScrollView：预览 QRT 补 export-name="pit-preview"（527 W-D 导出文件名主段契约）', () => {
    const v = read('../views/PitScrollView.vue');
    expect(v).toContain('export-name="pit-preview"');
  });
});
