/**
 * 九百六十三批：重建/迁移/批量写面权限执行体首行门（源码锁）。
 *
 * 背景：按钮 v-if 只挡鼠标通道；Monaco @execute(Ctrl+Enter)/@submit、弹窗 Enter、
 * 失败重试、右键菜单、深链回调仍可直达执行体，VIEWER 能触发必 403 或越权提交。
 * 契约：写动作执行体首行早退（权限判定 + warning notify），与按钮 v-if 双层门；
 * 角色档：VIEWER < OPERATOR(write) < 专项(ops) < ADMIN，ops 动作不得被 write 放行。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '../views', p), 'utf-8');

const reindexAdv = read('ReindexAdvancedView.vue');
const ubq = read('UpdateByQueryView.vue');
const bulk = read('BulkEditorView.vue');
const diff = read('DiffEditorView.vue');
const tasks = read('TasksView.vue');
const taskTree = read('TaskTreeView.vue');
const xmigrate = read('XmigrateView.vue');
const adhoc = read('AdhocRebuildView.vue');
const workspace = read('WorkspaceView.vue');
const authStore = readFileSync(join(__dirname, '../stores/auth.ts'), 'utf-8');

describe('ReindexAdvanced：执行体首行 canOps 门（含 Monaco Ctrl+Enter）', () => {
  it('submit 首行 canOps 早退 + warning 文案', () => {
    expect(reindexAdv).toMatch(/async function submit\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value\) \{ store\.notify\('warning', 'Reindex 需专项或 ADMIN 角色'\); return; \}/);
  });
  it('submit 仍是 @submit 唯一执行出口（键盘通道同门）', () => {
    expect(reindexAdv).toContain('@submit="submit"');
  });
});

describe('UpdateByQuery / BulkEditor：执行体首行 canOps 门 + 失败重试 v-if', () => {
  it('UpdateByQuery doSubmit 首行 canOps 早退', () => {
    expect(ubq).toMatch(/async function doSubmit\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value\) \{ store\.notify\('warning', '批量写需专项或 ADMIN 角色'\); return; \}/);
  });
  it('UpdateByQuery 失败重试钮 v-if="canOps"', () => {
    expect(ubq).toContain('<button v-if="canOps" class="btn sm" @click="doSubmit" :disabled="submitting || !index.trim() || !queryStr.trim()">重试</button>');
  });
  it('BulkEditor doSubmit 首行 canOps 早退', () => {
    expect(bulk).toMatch(/async function doSubmit\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value\) \{ store\.notify\('warning', '批量写需专项或 ADMIN 角色'\); return; \}/);
  });
  it('BulkEditor 失败重试钮 v-if="canOps"', () => {
    expect(bulk).toContain('<button v-if="canOps" class="btn sm" @click="doSubmit" :disabled="submitting || opsCount === 0">');
  });
});

describe('DiffEditor：doPush 执行体 canWrite 门（按钮既有 canWrite）', () => {
  it('按钮 v-if="canWrite" 保留', () => {
    expect(diff).toContain('<button v-if="canWrite" class="btn primary sm" @click="doPush"');
  });
  it('doPush 首行 canWrite 早退', () => {
    expect(diff).toMatch(/async function doPush\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canWrite\.value\)/);
  });
});

describe('Tasks / TaskTree：取消任务执行体 canWrite 门', () => {
  it('TasksView 右键取消项按 canWrite 过滤', () => {
    expect(tasks).toContain("...(t.cancellable && canWrite.value ? [{ key: 'cancel'");
  });
  it('TasksView cancelOne 首行 canWrite 早退（warning 文案）', () => {
    expect(tasks).toMatch(/async function cancelOne\(t: Task\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canWrite\.value\) \{ store\.notify\('warning', '取消任务是集群级动作：需 CLUSTER_OP 及以上角色，或该连接的集群设置写权限'\); return; \}/);
  });
  it('TaskTreeView 单条 cancelOne 首行 canWrite 早退', () => {
    expect(taskTree).toMatch(/async function cancelOne\(id: string, node\?: string\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canWrite\.value\) \{ store\.notify\('warning', '取消任务是集群级动作：需 CLUSTER_OP 及以上角色，或该连接的集群设置写权限'\); return; \}/);
  });
  it('TaskTreeView 批量 bulkCancel 首行 canWrite 早退', () => {
    expect(taskTree).toMatch(/async function bulkCancel\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canWrite\.value\) \{ store\.notify\('warning', '取消任务是集群级动作：需 CLUSTER_OP 及以上角色，或该连接的集群设置写权限'\); return; \}/);
  });
});

describe('Xmigrate：启动/中止/续跑全通道 canOps 门', () => {
  it('启动失败内联重试钮 v-if="canOps && canDestOps"', () => {
    /* 984：重试 = 重新发起迁移，需要源写键 + 宿主目标写键双证（与 openStartConfirm 早退同源） */
    expect(xmigrate).toContain('<button v-if="canOps && canDestOps" class="btn sm" @click="openStartConfirm"><RotateCcw :size="12" /> 重试</button>');
  });
  it('续跑弹窗 footer 续跑钮 v-if="canJobOps(actJob) && canDestOps"', () => {
    /* 984：续跑需要源写键 + 宿主目标写键双证，与 doResume 的早退条件同源 */
    expect(xmigrate).toContain('<button v-if="canJobOps(actJob) && canDestOps" class="btn pri" :disabled="resuming" @click="doResume">续跑</button>');
  });
  it('续跑弹窗 Enter 门含 canJobOps(actJob) 与宿主目标写键', () => {
    expect(xmigrate).toContain('useModalEnter(resumeOpen, doResume, () => !resuming.value && canJobOps(actJob.value) && canDestOps.value);');
  });
  it('openStartConfirm 首行源/宿主双写键早退（先于 preflight/确认窗）', () => {
    expect(xmigrate).toMatch(/async function openStartConfirm\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value \|\| !canDestOps\.value\) \{ store\.notify\('warning', '迁移发起需要源连接与宿主目标集群的迁移写权限'\); return; \}/);
    expect(xmigrate.indexOf("if (!canOps.value || !canDestOps.value)"))
      .toBeLessThan(xmigrate.indexOf("preflight.value = await api.xb.preflight("));
  });
  it('doStart 源/宿主双写键；doAbort 按源；doResume 源+宿主', () => {
    expect(xmigrate).toMatch(/async function doStart\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value \|\| !canDestOps\.value\) \{ store\.notify\('warning', '迁移发起需要源连接与宿主目标集群的迁移写权限'\); return; \}/);
    expect(xmigrate).toMatch(/async function doAbort\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canJobOps\(actJob\.value\)\) \{ store\.notify\('warning', '迁移操作需专项或 ADMIN 角色'\); return; \}/);
    expect(xmigrate).toMatch(/async function doResume\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canJobOps\(actJob\.value\) \|\| !canDestOps\.value\) \{ store\.notify\('warning', '续跑需要源连接与宿主目标集群的迁移写权限'\); return; \}/);
  });
});

describe('AdhocRebuild：校验/write 与启动/中止/切换 ops 双层门', () => {
  it('canValidate 走 config-lab/validate 写端点或 adhoc 写键', () => {
    expect(adhoc).toContain("auth.canEndpoint('write', 'POST', '/internal/es/index/config-lab/validate', store.target)");
    expect(adhoc).toContain("auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target)");
  });
  it('仅校验/校验并继续 v-if="canValidate" + disabled 合并 canValidate + title', () => {
    /* 984：入口按「校验」真实权限面（config-validator 写键 或 adhoc 写键）显示——
       原 v-if="canOps" 会让持 config-validator 写键的人看不到后端允许的校验入口 */
    expect(adhoc).toContain('v-if="canValidate" class="btn ghost" :disabled="validating || !canValidate" title="校验需配置校验页或托管重建写权限" @click="doValidateConfig(false)"');
    expect(adhoc).toContain('v-if="canValidate" class="btn primary" :disabled="validating || !canValidate" title="校验需配置校验页或托管重建写权限" @click="doValidateConfig(true)"');
  });
  it('doValidateConfig 首行 canValidate 早退 + notify', () => {
    expect(adhoc).toMatch(/async function doValidateConfig\(advance: boolean\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canValidate\.value\) \{ store\.notify\('warning', '校验需配置校验页或托管重建写权限'\); return; \}/);
  });
  it('doStart 首行 canOps；doAbort/doConfirmSwitch 首行 canMutateJob（创建者或 ADMIN）', () => {
    expect(adhoc).toMatch(/async function doStart\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value\)/);
    expect(adhoc).toMatch(/async function doAbort\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canMutateJob\.value\)/);
    expect(adhoc).toMatch(/async function doConfirmSwitch\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canMutateJob\.value\)/);
  });
});

describe('Xmigrate 探测面：与迁移写同档 rank3（防 VIEWER SSRF/环境变量读取）', () => {
  it('连接检查/拉取配置四钮 v-if="canOps"', () => {
    expect(xmigrate).toContain('<button v-if="canOps" class="btn sm" style="margin-left:auto" :disabled="checking" @click="check">');
    expect(xmigrate).toContain('<button v-if="canOps" class="btn sm" :disabled="checking" @click="check">');
    expect(xmigrate).toContain('<button v-if="canOps" class="btn sm" :disabled="!form.sourceIndex || checking" @click="fetchCfg">');
    expect(xmigrate).toContain('<button v-if="canOps" class="btn sm" :disabled="checking" @click="fetchCfg">');
  });
  it('check/fetchCfg 执行体首行 canOps 早退', () => {
    expect(xmigrate).toMatch(/async function check\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value\) \{ store\.notify\('warning', '迁移探测需专项或 ADMIN 角色'\); return; \}/);
    expect(xmigrate).toMatch(/async function fetchCfg\(\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(!canOps\.value\) \{ store\.notify\('warning', '迁移探测需专项或 ADMIN 角色'\); return; \}/);
  });
  it('前端只读 POST 清单移除 connect-check/fetch-config/resolve-preview（后端已升 rank3）', () => {
    const roLine = authStore.split('\n').find(l => l.includes('const READONLY_POST_KEYWORDS')) || '';
    expect(roLine).not.toContain("'/xmigrate/connect-check'");
    expect(roLine).not.toContain("'/xmigrate/fetch-config'");
    expect(roLine).not.toContain("'/xmigrate/resolve-preview'");
  });
});

describe('Workspace：只读总览页零写动作（不加门也不应出现写出口）', () => {  it('无批量写/取消任务/迁移等写 API 调用', () => {
    expect(workspace).not.toMatch(/api\.(bulk|cancelTask|reindexAdvanced|updateByQuery)\s*\(/);
    expect(workspace).not.toMatch(/api\.xb\.(start|abort|resume)\s*\(/);
    expect(workspace).not.toMatch(/api\.adhoc\.(start|abort|confirmSwitch)\s*\(/);
  });
  it('快捷 SQL 为只读 sqlJson（不加权限门）', () => {
    expect(workspace).toContain('api.sqlJson(');
  });
});
