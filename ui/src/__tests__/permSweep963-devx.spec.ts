/**
 * 九百六十三批：devx 权限扫荡（按钮门 + 执行体首行门双保险，源码锁）。
 *
 * 背景：963 权限系统扫描确认若干视图只做了按钮显隐（部分连按钮门都没有），
 * 键盘/历史/prefill/Enter/Monaco 快捷键等旁路仍可直达执行体，后端 403 成为
 * 唯一防线。本批统一为「按钮 v-if（或禁用）+ 执行体首行早退」双保险：
 * - raw 透传=ADMIN；snapshot/ILM/SLM/settings/templates/painless 写=rank3(ops)；
 * - config-lab/validate=write（OPERATOR）；ILM move 按真实端点单独 open 门；
 * - 守卫必须先于 busy/在途闸置位，避免只读请求把 busy 卡死。
 * 本 spec 只做源码锁（逐函数首行断言），行为回归归既有挂载 spec。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const V = (f: string) => readFileSync(join(__dirname, '../views', f), 'utf-8');
const devtools = V('DevToolsView.vue');
const snapshots = V('SnapshotsView.vue');
const lifecycle = V('LifecycleView.vue');
const ilm = V('IlmView.vue');
const configValidator = V('ConfigValidatorView.vue');
const painless = V('PainlessLabView.vue');
const slm = V('SlmView.vue');
const clusterSettings = V('ClusterSettingsView.vue');
const diag = V('DiagView.vue');
const templates = V('TemplatesView.vue');
const searchTemplates = V('SearchTemplatesView.vue');

/** 取具名函数体（花括号配对，忽略字符串内花括号的极端场景——本批函数体无此形态） */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `函数必须存在：${name}`).toBeGreaterThanOrEqual(0);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (!depth) return src.slice(brace + 1, i);
    }
  }
  throw new Error(`函数体未闭合：${name}`);
}

/** 剥掉函数体开头空白与注释，取第一个语句 */
function firstStmt(body: string): string {
  return body.replace(/^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\s*)*/, '');
}

function expectFirstGuard(src: string, name: string, cond: string, ret: 'return;' | 'return false;') {
  const head = firstStmt(fnBody(src, name));
  expect(head.startsWith(`if (!${cond}`), `${name} 首行守卫`).toBe(true);
  /* 守卫体可能是多行（条件里带 canExecInner 后换行），取整个 if 块判早退 */
  const guard = head.slice(0, head.indexOf('}') + 1);
  expect(guard, `${name} 守卫必须早退（${ret}）`).toContain(ret);
}

describe('963 DevTools：raw 透传 ADMIN 门（按钮+run/runSmart/execSend 三执行体）', () => {
  it('写档能力按透传端点判定（1133 起读写分档，写档仍是 canPassthroughWrite）', () => {
    expect(devtools).toContain("const canAdmin = computed(() => auth.canPassthroughWrite(");
    expect(devtools).toContain("'/internal/es/index/cluster/devtools/execute'");
    /* 读档能力同样必须存在——只读身份否则连只读请求都执行不了 */
    expect(devtools).toContain("const canExecRead = computed(() => auth.canPassthroughRead(");
    expect(devtools).toContain('const canExecInner = (method: string, path: string) => auth.canExecutePassthrough(');
  });
  it('run/runSmart 首行守卫先于 busy 置位', () => {
    /* 1133：守卫按内层方法分档，但「首句即早退」的强度不变 */
    expectFirstGuard(devtools, 'run', 'cur.value || !canExecInner(cur.value.method, cur.value.path)', 'return;');
    expectFirstGuard(devtools, 'runSmart', 'cur.value || !canExecInner(cur.value.method, cur.value.path)', 'return;');
    const run = fnBody(devtools, 'run');
    expect(run.indexOf('if (!cur.value || !canExecInner('), 'run 守卫必须在 t.busy = true 之前')
      .toBeLessThan(run.indexOf('t.busy = true'));
  });
  it('execSend 内核单点守卫返回 false（覆盖全量/段/预填/历史）', () => {
    expectFirstGuard(devtools, 'execSend', 'canExecInner(t.method, t.path)', 'return false;');
    expect(fnBody(devtools, 'execSend').indexOf('if (!canExecInner(t.method, t.path))'))
      .toBeLessThan(fnBody(devtools, 'execSend').indexOf('const t0 = performance.now();'));
  });
});

describe('963 Snapshots：创建/恢复/删除 ops 门 + 空态入口按角色收起', () => {
  it('空态 actionText 条件化（只读无创建入口）', () => {
    expect(snapshots).toContain(`:action-text="canOps ? '创建快照' : undefined"`);
  });
  it('openCreate/doCreate/doRestore/doDeleteSnapshot 首行守卫', () => {
    for (const fn of ['openCreate', 'doCreate', 'doRestore', 'doDeleteSnapshot']) expectFirstGuard(snapshots, fn, 'canOps', 'return;');
  });
  it('两个弹窗 Enter 通道 can 条件含 canOps', () => {
    expect(snapshots).toContain('useModalEnter(createOpen, doCreate, () => canOps.value && !creating.value);');
    expect(snapshots).toContain('useModalEnter(restoreOpen, doRestore, () => canOps.value);');
  });
});

describe('963 Lifecycle：生命周期页 ops 端点归一 + Dry Run 同门', () => {
  it('canOps 改按 lifecycle start 端点（start/stop/move/rollover 同页）', () => {
    expect(lifecycle).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/start', store.target));");
  });
  it('Dry Run 预检钮 v-if=canRollover（/cluster/rollover 是 rank3）', () => {
    expect(lifecycle).toMatch(/<button v-if="canRollover" class="btn ghost sm" @click="doRollover\(true\)"/);
  });
  it('ilmStart/ilmStop 走 canOps；doRollover 走 canRollover；doMove 走 canMove', () => {
    expectFirstGuard(lifecycle, 'ilmStart', 'canOps', 'return;');
    expectFirstGuard(lifecycle, 'ilmStop', 'canOps', 'return;');
    expectFirstGuard(lifecycle, 'doRollover', 'canRollover', 'return;');
    expectFirstGuard(lifecycle, 'doMove', 'canMove', 'return;');
  });
});

describe('963 Ilm：move 按真实端点单立 canMove；策略写门进执行体与 Enter 闸', () => {
  it('canMove 定义=ilm/move 端点，重试 step 钮随 canMove', () => {
    expect(ilm).toContain("const canMove = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/move', store.target));");
    expect(ilm).toContain('v-if="canMove && isRetryable(info)"');
  });
  it('doRetryStep 首行 canMove；save/deletePolicy 首行 canOps', () => {
    expectFirstGuard(ilm, 'doRetryStep', 'canMove', 'return;');
    expectFirstGuard(ilm, 'savePolicy', 'canOps', 'return;');
    expectFirstGuard(ilm, 'deletePolicy', 'canOps', 'return;');
  });
  it('策略弹窗 Enter 提交 can 条件含 canOps', () => {
    expect(ilm).toContain('useModalEnter(policyEditOpen, savePolicy, () => canOps.value && !policyBusy.value);');
  });
});

describe('963 ConfigValidator：validate=write 门 + create=ops 门', () => {
  it('canValidate 定义=config-lab/validate（write 档）', () => {
    expect(configValidator).toContain("auth.canEndpoint('write', 'POST', '/internal/es/index/config-lab/validate', store.target)");
    expect(configValidator).toContain("auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target)");
  });
  it('快速 Lint / 校验+Dry-run / 错误重试三钮均 v-if=canValidate', () => {
    expect(configValidator).toContain('<button v-if="canValidate" class="btn ghost sm" @click="doValidate(false)" :disabled="busy">');
    expect(configValidator).toContain('<button v-if="canValidate" class="btn primary sm" @click="doValidate(true)" :disabled="busy">');
    expect(configValidator).toContain('<button v-if="canValidate" class="btn sm" @click="doValidate(lastDryRun)" :disabled="busy">');
  });
  it('doValidate（Monaco Ctrl+Enter/重试同汇入）首行 canValidate；askCreate/doCreate 首行 canOps', () => {
    expectFirstGuard(configValidator, 'doValidate', 'canValidate', 'return;');
    expectFirstGuard(configValidator, 'askCreate', 'canOps', 'return;');
    expectFirstGuard(configValidator, 'doCreate', 'canOps', 'return;');
  });
});

describe('963 其余写执行体首行 ops/admin 守卫', () => {
  it('PainlessLab：save/deleteStored 首行 canOps', () => {
    expectFirstGuard(painless, 'save', 'canOps', 'return;');
    expectFirstGuard(painless, 'deleteStored', 'canOps', 'return;');
  });
  it('SlmView：execNow 首行 canOps', () => {
    expectFirstGuard(slm, 'execNow', 'canOps', 'return;');
  });
  it('ClusterSettingsView：apply 首行 canOps', () => {
    expectFirstGuard(clusterSettings, 'apply', 'canOps', 'return;');
  });
  it('DiagView：retryFailedAlloc 首行 canOps', () => {
    expectFirstGuard(diag, 'retryFailedAlloc', 'canOps', 'return;');
  });
  it('TemplatesView：del 首行 canOps（save 既有守卫保留）', () => {
    expectFirstGuard(templates, 'del', 'canOps', 'return;');
    expect(fnBody(templates, 'save')).toContain('if (!canOps.value) { store.notify(');
  });
  it('SearchTemplatesView：save/del 首行 canOps', () => {
    expectFirstGuard(searchTemplates, 'save', 'canOps', 'return;');
    expectFirstGuard(searchTemplates, 'del', 'canOps', 'return;');
  });
  it('SnapshotsView：非 ADMIN 恢复必须显式业务 indices（防 restore-all 覆盖控制面）', () => {
    expect(snapshots).toContain("const mustSpecifyRestoreIndices = computed(() => !auth.can('admin'));");
    expect(snapshots).toContain(':disabled="restoring || (mustSpecifyRestoreIndices && !restoreIndices.trim()) || !canOps"');
    expect(snapshots).toContain("if (mustSpecifyRestoreIndices.value && !restoreIndices.value.trim()) {");
  });
});
