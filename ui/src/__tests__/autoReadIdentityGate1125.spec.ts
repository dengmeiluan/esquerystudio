/**
 * 1125 批（并发审计批次 C 收口）——自动读取/定时重放同样要过身份门。
 *
 * 背景：宿主换 token 的窗口里 `auth.probed` 仍为 false，`canEndpoint` 会 fail-open。
 * 任何「挂载即拉取 / 定时轮询」的读请求如果不门，就会带着上一账号的 target 与现场发出去
 * （只读也会 403 审计噪声，结果还可能串到新账号界面）。
 *
 * 锁定五处：
 *  ① DslQueryView 自动刷新定时器（此前直接 execQuery，绕过 autoRunAllowed）
 *  ② BrowserView 深链 openLinkedDoc（挂载即拉原文档）
 *  ③ DiffEditorView onMounted 的 doFetch / fetchCompare
 *  ④ SearchTemplatesView setup 期 load()
 *  ⑤ 门式公式统一：SearchTemplates / SqlConsole 补 `!auth.probeStarted`
 *     （缺它会在探测永不启动的测试宿主里把回放永久挂起）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '../views', p), 'utf-8');
const dsl = read('DslQueryView.vue');
const browser = read('BrowserView.vue');
const diff = read('DiffEditorView.vue');
const tpl = read('SearchTemplatesView.vue');
const sql = read('SqlConsoleView.vue');

describe('DslQueryView 自动刷新过身份门（1125）', () => {
  it('定时器回调内联身份判定后才 execQuery', () => {
    const m = dsl.match(/const autoRefresh = useAutoRefresh\(\(\) => \{[\s\S]{0,600}?\}, \{/);
    expect(m).toBeTruthy();
    const body = m![0];
    expect(body).toContain('auth.authDisabled');
    expect(body).toContain('auth.probeStarted');
    expect(body).toContain("auth.canReadPage('search', store.target)");
    expect(body).toContain('if (!allowed) return;');
    expect(body).toContain('execQuery(false)');
    // 判定必须出现在 execQuery 之前
    expect(body.indexOf('if (!allowed) return;')).toBeLessThan(body.indexOf('execQuery(false)'));
  });
});

describe('BrowserView 深链读文档过身份门（1125）', () => {
  it('onMounted 不再直调 openLinkedDoc，改为 linkDocAllowed 后消费', () => {
    const m = browser.match(/onMounted\(\(\) => \{[\s\S]{0,2000}?\n\}\);/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('if (linkDocAllowed()) void openLinkedDoc(');
    expect(m![0]).toContain('pendingLinkDocId.value = docId');
  });

  it('身份落地后补跑挂起的深链', () => {
    expect(browser).toContain('const linkDocAllowed = () => auth.authDisabled || !auth.probeStarted');
    expect(browser).toMatch(/watch\(\(\) => \[auth\.probed, auth\.authDisabled, auth\.me\?\.username, store\.target\][\s\S]{0,300}?openLinkedDoc\(store\.pickedIdx, id\)/);
  });
});

describe('DiffEditorView 挂载拉取过身份门（1125）', () => {
  it('docReadAllowed 含 probeStarted 与 doc-diff 读页判定', () => {
    expect(diff).toContain('const docReadAllowed = () => auth.authDisabled || !auth.probeStarted');
    expect(diff).toContain("auth.canReadPage('doc-diff', store.target)");
  });

  it('挂载不再直调 doFetch/fetchCompare，未放行即挂起并在身份落地补跑', () => {
    const m = diff.match(/function mountAutoRead\(\) \{[\s\S]{0,1200}?\n\}/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('if (!docReadAllowed()) { mountReadPending = true; return; }');
    expect(diff).toContain('onMounted(mountAutoRead);');
    expect(diff).toMatch(/watch\(\(\) => \[auth\.probed[\s\S]{0,300}?if \(mountReadPending && docReadAllowed\(\)\) mountAutoRead\(\);/);
  });
});

describe('SearchTemplatesView setup 期 load 过身份门（1125）', () => {
  it('loadGuarded 取代裸 load()', () => {
    expect(tpl).toContain('function loadGuarded() {');
    expect(tpl).toContain('if (!listAllowed()) { listPending = true; return; }');
    expect(tpl).toMatch(/\nloadGuarded\(\);\n<\/script>/);
    expect(tpl).not.toMatch(/\nload\(\);\n<\/script>/);
  });
});

describe('自动读门公式统一（1125）', () => {
  it('SearchTemplates 回放门含 !auth.probeStarted', () => {
    const m = tpl.match(/const tplAutoAllowed = \(\) => auth\.authDisabled[\s\S]{0,300}?;/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('!auth.probeStarted');
  });

  it('SqlConsole 预填门含 !auth.probeStarted', () => {
    const m = sql.match(/const prefillAutoAllowed = \(\) => auth\.authDisabled[\s\S]{0,300}?;/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('!auth.probeStarted');
  });
});

/* ═══ 批次 D 续：工作台/迁移/优化/漂移/索引工作台的挂载期读取 ═══ */
const hub = read('IndexHubView.vue');
const opt = read('IndexOptimizerView.vue');
const drift = read('ConfigDriftView.vue');
const adhoc = read('AdhocRebuildView.vue');
const xm = read('XmigrateView.vue');

describe('挂载期读取统一门（批次 D）', () => {
  it('IndexHubView 挂载不再裸调 loadAliases/loadDetail', () => {
    const m = hub.match(/onMounted\(\(\) => \{[\s\S]{0,900}?\n\}\);/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('if (indexHubReadReady())');
    expect(m![0]).not.toMatch(/\n {2}loadAliases\(\);\n {2}if \(cur\.value\) \{/);
  });

  it('IndexOptimizerView 挂载扫描过门', () => {
    expect(opt).toContain('const scanReady = () => auth.authDisabled || !auth.probeStarted');
    expect(opt).toContain('onMounted(bootScan);');
  });

  it('ConfigDriftView 挂载过门且导入 auth/watch', () => {
    expect(drift).toContain("import { useAuthStore } from '../stores/auth';");
    expect(drift).toContain('const driftReady = () => auth.authDisabled || !auth.probeStarted');
    expect(drift).toMatch(/onMounted\(\(\) => \{[\s\S]{0,200}?if \(driftReady\(\)\) void bootDrift\(\);/);
  });

  it('AdhocRebuildView 挂载读作业/裁决过门', () => {
    expect(adhoc).toContain('const adhocReady = () => auth.authDisabled || !auth.probeStarted');
    expect(adhoc).toMatch(/onMounted\(\(\) => \{[\s\S]{0,300}?if \(adhocReady\(\)\) \{ consumeRebuildHandoff\(\); loadJobs\(\); adjudicateEntry\(\); \}/);
  });

  it('XmigrateView 挂载读清单过门', () => {
    expect(xm).toContain('const xmReady = () => auth.authDisabled || !auth.probeStarted');
    expect(xm).toMatch(/onMounted\(\(\) => \{[\s\S]{0,200}?if \(xmReady\(\)\) void bootReads\(\);/);
  });
});

/* ═══ 批次 E/F：统一走 usePageIdentityGate（抽出的共享门）+ 各页接线 ═══ */
const readG = (p: string) => readFileSync(join(__dirname, '../views', p), 'utf-8');
const GATED: [string, string][] = [
  ['AnalyzeView.vue', 'analyze'],
  ['AnalyzerLabView.vue', 'analyzer-lab'],
  ['PainlessLabView.vue', 'painless-lab'],
  ['SystemView.vue', 'system'],
  ['DiagView.vue', 'diag'],
  ['TopologyView.vue', 'topology'],
  ['WorkspaceView.vue', 'workspace'],
  ['SynonymsManagerView.vue', 'synonyms'],
  ['ProfileFlameView.vue', 'profile-flame'],
  ['ScoreExplainView.vue', 'score-explain'],
  ['MatchMatrixView.vue', 'match-matrix'],
  ['BoostTunerView.vue', 'boost-tuner'],
  ['QueryXrayView.vue', 'query-xray'],
  ['RankDebugView.vue', 'rank-debug'],
  ['LiveDashboardView.vue', 'live'],
];

describe('批次 E/F 挂载期读取统一接门（1125）', () => {
  for (const [file, pageKey] of GATED) {
    it(`${file} 使用 useGatedBootRead('${pageKey}') 而非裸调`, () => {
      const src = readG(file);
      expect(src).toContain("from '../composables/usePageIdentityGate'");
      expect(src).toContain(`useGatedBootRead('${pageKey}'`);
    });
  }

  it('QueryXray / RankDebug 的 carry 回放先暂存、门放行才执行', () => {
    const x = readG('QueryXrayView.vue');
    expect(x).toContain('xrayPendingCarry = p');
    expect(x).toContain('if (!xrayBootGate.allowed())');
    const r = readG('RankDebugView.vue');
    expect(r).toContain('rankDebugPendingCarry = p');
    expect(r).toContain('if (!rankDebugBootGate.allowed())');
  });

  it('LiveDashboard 轮询 tick 内含身份门（不放行跳过本拍）', () => {
    const l = readG('LiveDashboardView.vue');
    expect(l).toContain('const liveReady = () => auth.authDisabled || !auth.probeStarted');
    const m = l.match(/const \{ setOn: histAutoSetOn \} = useAutoRefresh\(\(\) => \{[\s\S]{0,300}?\}, \{/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('if (!liveReady()) return;');
  });
});

describe('共享门自身不得写成 fail-open（1125）', () => {
  const gate = readFileSync(join(__dirname, '../composables/usePageIdentityGate.ts'), 'utf-8');
  /* 注释里故意写了反例说明，判据只作用于去注释后的代码 */
  const code = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('判定式为 authDisabled || !probeStarted || (probed && me && canReadPage)', () => {
    expect(code).toContain('auth.authDisabled');
    expect(code).toContain('!auth.probeStarted');
    expect(code).toContain('auth.probed && auth.me != null && auth.canReadPage(pageKey');
  });
  it('代码中不得出现 !auth.probed 的放行分支', () => {
    expect(code).not.toMatch(/!\s*auth\.probed\s*\|\|/);
  });
});

/* ═══ 页 key 必须存在于真实契约：写错 key 会让 canReadPage 永远 false → 有权限用户被误拦 ═══ */
describe('门使用的 pageKey 与后端契约同源（1125）', () => {
  const contract = JSON.parse(
    readFileSync(join(__dirname, '../../../platform/src/main/resources/META-INF/esquerystudio-pages.json'), 'utf-8'),
  ) as { pages: { key: string }[] };
  const valid = new Set(contract.pages.map(p => p.key));

  const usedKeys: [string, string][] = [
    ['AnalyzeView.vue', 'analyze'], ['AnalyzerLabView.vue', 'analyzer-lab'],
    ['PainlessLabView.vue', 'painless-lab'], ['SystemView.vue', 'system'],
    ['DiagView.vue', 'diag'], ['TopologyView.vue', 'topology'],
    ['WorkspaceView.vue', 'workspace'], ['SynonymsManagerView.vue', 'synonyms'],
    ['ProfileFlameView.vue', 'profile-flame'], ['ScoreExplainView.vue', 'score-explain'],
    ['MatchMatrixView.vue', 'match-matrix'], ['BoostTunerView.vue', 'boost-tuner'],
    ['QueryXrayView.vue', 'query-xray'], ['RankDebugView.vue', 'rank-debug'],
    ['LiveDashboardView.vue', 'live'],
    // 前几批手写门用到的 key 一并纳入
    ['IlmView.vue', 'ilm'], ['SnapshotsView.vue', 'snapshots'], ['SecurityView.vue', 'security'],
    ['AliasesView.vue', 'aliases'], ['IndexHubView.vue', 'indices'],
    ['IndexOptimizerView.vue', 'optimizer'], ['ConfigDriftView.vue', 'config-drift'],
    ['AdhocRebuildView.vue', 'adhoc-rebuild'], ['XmigrateView.vue', 'xmigrate'],
    ['DiffEditorView.vue', 'doc-diff'], ['BrowserView.vue', 'browser'],
    ['SearchTemplatesView.vue', 'search-templates'], ['DslQueryView.vue', 'search'],
    ['SqlConsoleView.vue', 'search'], ['AnalyzerLabView.vue', 'analyze'],
  ];

  it('契约本身可读且为 53 页', () => {
    expect(contract.pages.length).toBe(53);
  });

  for (const [file, key] of usedKeys) {
    it(`${file} 使用的 '${key}' 是契约内真实页 key`, () => {
      expect(valid.has(key), `'${key}' 不在 esquerystudio-pages.json 中 → canReadPage 恒 false，会误拦有权限用户`).toBe(true);
    });
  }
});
