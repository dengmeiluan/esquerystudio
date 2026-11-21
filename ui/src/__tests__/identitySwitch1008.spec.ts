import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1008：账号切换污染的二次收口（在 1007 基础上补齐查询工作台新增的模块级状态）。
   跨文件契约用源码锚锁死：只清 localStorage、或在飞请求回填旧账号数据，都会让这里红。 */
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
const auth = read('stores/auth.ts');
const app = read('App.vue');
const palette = read('components/CmdPalette.vue');
const liveMonitor = read('stores/liveMonitor.ts');
const terms = read('composables/useTermsSuggest.ts');
const fields = read('composables/useIndexFields.ts');
const aliases = read('composables/useAliases.ts');
const stash = read('utils/queryStash.ts');
const dsl = read('views/DslQueryView.vue');
const sql = read('views/SqlConsoleView.vue');
const guide = read('data/integrationGuide.ts');

describe('1008 账号切换：查询工作台现场与在飞回填', () => {
  it('新增查询现场键纳入清理（SQL 参数/DSL 请求参数/沙盒 body/大屏）', () => {
    /* 1100 起 `.params` 单键扩为整族 `esquerystudio.pref.sql.`：时区/超时/columnar 同样
       决定执行口径，只清参数原文仍会把上一账号的时区套到新账号的日期列与 cursor 续页。 */
    expect(auth).toContain("'esquerystudio.pref.sql.'");
    expect(auth).toContain("'esquerystudio.pref.dq.req.'");
    expect(auth).toContain("'ss_dsl_body'");
    expect(auth).toContain("'esquerystudio.live.'");
  });

  it('内置登出也清工作现场，并清连接 env 映射', () => {
    expect(auth).toContain('purgeLocalUserState();');
    expect(auth).toContain('connEnvById.value = {};');
  });

  it('App 清模块级 ref：子树剪贴/字段检索上下文/SQL 补全单例', () => {
    expect(app).toContain('clearSubtreeStash();');
    expect(app).toContain('clearFieldSearchContext();');
    expect(app).toContain('resetSqlCompletion();');
    expect(stash).toContain('export function clearSubtreeStash()');
  });

  it('在飞请求有换号代际守卫（词项/字段/别名不回填旧账号数据）', () => {
    expect(terms).toContain('let epoch = 0;');
    expect(terms).toContain('if (reqEpoch !== epoch)');
    expect(fields).toContain('let epoch = 0;');
    expect(fields).toContain('reqEpoch === epoch');
    expect(aliases).toContain('let epoch = 0;');
    expect(aliases).toContain('if (reqEpoch !== epoch) return;');
  });

  it('监控作业数曲线归零且换号不恢复旧快照', () => {
    expect(liveMonitor).toContain('jobCountSeries.value = [];');
    const start = liveMonitor.indexOf('function resetIdentityState()');
    const end = liveMonitor.indexOf('return {', start);
    const body = liveMonitor.slice(start, end);
    expect(body).not.toContain('restore();');
  });

  it('命令面板最近使用在身份事件后归零', () => {
    expect(palette).toContain("window.addEventListener('esquerystudio:identity-changed'");
    expect(palette).toContain('recent.value = [];');
  });

  it('深链/预填自动执行前必须已探测到身份与读页权限', () => {
    expect(dsl).toContain('const autoRunAllowed = () => auth.authDisabled');
    expect(dsl).toContain("auth.canReadPage('search', store.target)");
    expect(dsl).toContain('autoRunPending = true');
    expect(sql).toContain('const prefillAutoAllowed = () => auth.authDisabled');
    expect(sql).toContain("auth.canReadPage('search', store.target)");
    expect(sql).toContain('prefillAutoPending = true');
  });

  it('集成文档不再教宿主用 * 作为 postMessage targetOrigin', () => {
    expect(guide).not.toContain("}, '*');");
    expect(guide).toContain('CONSOLE_ORIGIN');
    expect(guide).toContain('e.source !== iframe.contentWindow');
  });
});
