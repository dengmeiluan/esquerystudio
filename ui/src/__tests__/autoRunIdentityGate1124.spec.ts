import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1124：身份探测窗口的自动执行门补齐（IndexHub 三条自动链 + 语法桥/模板回放）。
   此前 DslQueryView / SqlConsoleView 已有 autoRunAllowed，其余视图的「挂载即查 / 切 tab /
   切索引 / 历史回放」会把上一账号或旧 target 的请求先发出去。这里锁住源码契约：
   自动入口必须走门 + 挂起补跑，而用户手动点击不被排队阻塞。 */
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
const indexHub = read('views/IndexHubView.vue');
const bridge = read('views/SqlBridgeView.vue');
const templates = read('views/SearchTemplatesView.vue');
const lucene = read('views/LuceneQueryView.vue');
const sandbox = read('views/SearchSandboxView.vue');
const readTasks = read('views/TasksView.vue');
const readTaskTree = read('views/TaskTreeView.vue');
const readBrowser = read('views/BrowserView.vue');
const readOptimizer = read('views/IndexOptimizerView.vue');
const readIndexSettings = read('views/IndexSettingsView.vue');
const readSnapshots = read('views/SnapshotsView.vue');
const readIlm = read('views/IlmView.vue');
const readDsl = read('views/DslQueryView.vue');
const readSecurity = read('views/SecurityView.vue');
const auth = read('stores/auth.ts');

describe('1124 身份窗口的自动执行门', () => {
  it('IndexHub 自动链走 docsAutoAllowed 门 + 挂起补跑', () => {
    expect(indexHub).toContain('const docsAutoAllowed = () => auth.authDisabled');
    expect(indexHub).toContain("auth.canReadPage('indices', store.target)");
    expect(indexHub).toContain('docsAutoPending = true;');
    expect(indexHub).toContain('function runDocsAuto()');
    expect(indexHub).toContain('function runDslAuto()');
    expect(indexHub).toContain('void runDocs();');
    expect(indexHub).toContain('void runDsl();');
  });

  it('IndexHub 挂载/切 tab/切索引/历史回放都走自动门，手动按钮不走', () => {
    expect(indexHub).toContain("watch(tab, t => { if (t === 'docs' && cur.value && !docsRan.value && !docsLoading.value) runDocsAuto(); });");
    expect(indexHub).toContain('if (tab.value === \'docs\' && cur.value) runDocsAuto();');
    expect(indexHub).toContain('if (runIt) runDocsAuto();');
    expect(indexHub).toContain('if (runIt) runDslAuto();');
    /* 手动「检索/重试/执行查询」保持直接调用（有权限的人不被探测窗口挡住） */
    expect(indexHub).toContain('@click="runDocsNew()"');
    expect(indexHub).toContain('@click="runDslNew"');
  });

  it('IndexHub 挂起后身份/目标变化会补跑，且不因目标变化重放旧载荷', () => {
    const idx = indexHub.indexOf('watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target]');
    expect(idx).toBeGreaterThan(-1);
    const body = indexHub.slice(idx, idx + 320);
    expect(body).toContain('if (!docsAutoPending || !docsAutoAllowed()) return;');
    expect(body).toContain('docsAutoPending = false;');
  });

  it('语法桥回放自动试跑走身份门（手动试跑不受影响）', () => {
    expect(bridge).toContain("import { useAuthStore } from '../stores/auth';");
    expect(bridge).toContain('const sqlAutoAllowed = () => auth.authDisabled');
    expect(bridge).toContain("auth.canReadPage('search', store.target)");
    expect(bridge).toContain('function runSqlAuto()');
    expect(bridge).toContain('if (runIt) runSqlAuto();');
    expect(bridge).toContain('sqlAutoPending = true;');
  });

  it('模板历史回放自动执行走身份门', () => {
    expect(templates).toContain('const tplAutoAllowed = () => auth.authDisabled');
    expect(templates).toContain("auth.canReadPage('search-templates', store.target)");
    expect(templates).toContain('function runAuto()');
    expect(templates).toContain('if (runIt) runAuto();');
    expect(templates).toContain('tplAutoPending = true;');
  });

  it('Lucene / 检索沙盒的历史回放自动执行同样走身份门', () => {
    expect(lucene).toContain("import { useAuthStore } from '../stores/auth';");
    expect(lucene).toContain('const doRunAutoAllowed = () => auth.authDisabled');
    expect(lucene).toContain("auth.canReadPage('search', store.target)");
    expect(lucene).toContain('if (runIt) doRunAuto();');
    expect(sandbox).toContain("import { useAuthStore } from '../stores/auth';");
    expect(sandbox).toContain('const runAutoAllowed = () => auth.authDisabled');
    expect(sandbox).toContain("auth.canReadPage('search', store.target)");
    expect(sandbox).toContain('if (runIt) runAuto();');
  });

  it('五个回放自动入口都不再直接调用执行函数', () => {
    /* 回归线：既然 runIt 来自一次性回放载荷（可能属于上一账号），任何一处直调都会恢复旧行为 */
    for (const [name, src, direct] of [
      ['IndexHub', indexHub, 'if (runIt) runDocs();'],
      ['SqlBridge', bridge, 'if (runIt) runSql();'],
      ['SearchTemplates', templates, 'if (runIt) run();'],
      ['Lucene', lucene, 'if (runIt) doRun();'],
      ['SearchSandbox', sandbox, 'if (runIt) run();'],
    ] as const) {
      expect(src.includes(direct), `${name} 仍在回放通道里直调执行函数`).toBe(false);
    }
  });

  it('SQL 执行口径整族纳入换号清理（时区/超时/columnar/行数）', () => {
    const start = auth.indexOf('const USER_STATE_PREFIXES');
    const end = auth.indexOf('];', start);
    const body = auth.slice(start, end);
    expect(body).toContain("'esquerystudio.pref.sql.'");
    /* 整族必须以带点前缀出现——`esquerystudio.pref.sql` 会连 sqlbridge 等无关键一起清 */
    expect(body).toContain("'esquerystudio.pref.sql.'");
    expect(body).not.toContain("'esquerystudio.pref.sql'\n");
  });

  it('隐藏写控件的地方都有「缺什么」说明（不静默减半工具栏）', () => {
    const readOnlyViews: Array<[string, string, string]> = [
      ['TasksView', readTasks, 'tv-perm-note'],
      ['TaskTreeView', readTaskTree, 'tt-perm-note'],
      ['BrowserView', readBrowser, 'bw-perm-note'],
      ['IndexOptimizerView', readOptimizer, 'io-perm-note'],
      ['IndexSettingsView', readIndexSettings, 'is-perm-note'],
    ];
    for (const [name, src, cls] of readOnlyViews) {
      expect(src, `${name} 缺只读说明条`).toContain(cls);
      expect(src, `${name} 说明条未按身份就绪门控`).toContain('auth.probed &&');
    }
  });

  it('DevTools 跳转入口在来源页前置判定（不让只读身份进「点了没反应」的页面）', () => {
    expect(readSnapshots).toContain('v-if="canDevtools"');
    expect(readSnapshots).toContain('sv-dev-hint');
    expect(readIlm).toContain("if (!canDevtools.value) { store.notify('warning', 'DevTools 入口需要");
    expect(readDsl).toContain('const canDevtools = computed(');
    expect(indexHub).toContain('const canDevtools = computed(');  });

  it('安全中心账号写拒绝有提示（不是静默 return）', () => {
    expect(readSecurity).toContain("账号管理需要 ADMIN 角色");
  });
});
