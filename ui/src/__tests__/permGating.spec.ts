/**
 * ：权限感知 UI + 自助操作流水（安全架构批）。
 * 背景：此前全站危险按钮对所有角色可见——VIEWER 点删索引/删文档/raw 系命令必 403 刷 PAGE_DENIED
 * （190 审计刷屏同类根因）；非 rank3 角色连自己的操作流水都看不到。
 * 锁定：①自助流水端点接线（mine，username 服务端强制）；②capability 门禁三处消费方；
 * ③危险按钮按角色隐藏（IndexHub/ResultTable/DslQueryView/CmdPalette）。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sec = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const dsl = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const pal = readFileSync(join(__dirname, '../components/CmdPalette.vue'), 'utf-8');
const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');
const apiSrc = readFileSync(join(__dirname, '../api.ts'), 'utf-8');
const authStore = readFileSync(join(__dirname, '../stores/auth.ts'), 'utf-8');

describe('自助操作流水（非 admin 可见自己的操作）', () => {
  it('api.opsAuditMine 走 /auth/ops-audit/mine（username 服务端强制，前端不传）', () => {
    expect(apiSrc).toContain("opsAuditMine: (action?: string, size = 50, from = 0, since?: number, connName?: string) =>"); /* 集群维度下推 */
    expect(apiSrc).toContain('`/auth/ops-audit/mine?${q({ action, size, from, since, connName })}`');
  });
  it('SecurityView：canAuditAll 分派全量/自助；身份就绪任意角色补拉', () => {
    expect(sec).toContain('const canAuditAll = computed(() => auth.canAuditAll(store.target));');
    /*  同步更新：uriPrefix 前缀下推第 7 参接活（ 输入挂了但通道缺失的死输入，
       服务端 ConsoleAuthController uriPrefix 形参在案），源码锁字面随之（mine 分支 5 参未动，31 行锁零触） */
    expect(sec).toContain('? await api.auth.opsAudit(fUser.value || undefined, fAction.value || undefined, AUDIT_PAGE, offset, sinceMsOf(), fConn.value || undefined, fUri.value || undefined)');
    expect(sec).toContain(': await api.auth.opsAuditMine(fAction.value || undefined, AUDIT_PAGE, offset, sinceMsOf(), fConnMine.value || undefined);'); /* 自助面集群维度 */
    expect(sec).toContain('（仅我的操作 · 全量需 AUDIT_OP/ADMIN + 安全中心读权限）');
    expect(sec).toContain('if (role && old !== role) { loadUsers(); loadAudit(); }');
    /* 用户过滤输入框仅全量可见（mine 模式用户名被服务端锁死，给了也没用） */
    expect(sec).toContain('v-if="canAuditAll" v-model.trim="fUser"');
  });
});

describe('capability 门禁真源（auth store 暴露）', () => {
  it('auth store：can(cap)/canAuditAll() 统一入口；仅明确无鉴权(authDisabled)全放行，身份未知 fail-closed', () => {
    /* 1002：canClusterScope 需要 roleRank 做「rank3 或 w:cluster-settings」双通道判定 */
    expect(authStore).toContain("import { canCap, canViewAllAudit, roleRank, type ConsoleCap } from '../utils/capability';");
    expect(authStore).toContain("const identityKnown = () => authDisabled.value || me.value != null || !probeStarted.value;");
    expect(authStore).toContain('if (!identityKnown()) return false;');
    expect(authStore).toContain('return me.value == null ? true : canCap(me.value.role, cap);');
    expect(authStore).toContain('const canAuditAll = (targetId?: string | null) => me.value != null');
    expect(authStore).toContain('&& canViewAllAudit(me.value.role) && canReadPage(\'security\', targetId);');
    /* 集群级动作门必须与后端 CLUSTER_SCOPE_WRITE_KEYWORDS 同源（rank3 或 w:cluster-settings） */
    expect(authStore).toContain("const canClusterScope = (targetId?: string | null) => {");
    expect(authStore).toContain("return gp.includes('conn:' + tid + ':w:cluster-settings');");
  });
});

describe('危险按钮按角色隐藏（点名：只读不再看到删索引/删记录）', () => {
  it('IndexHub：删索引/重建/改 Setting/新建索引/托管重建=ops；ops 页 raw 系=admin + 低权自述空态', () => {
    expect(ih).toContain('<button v-if="cur && canRebuild" aria-label="托管重建当前索引"');
    /* 头部删除钮与 ops 危险区双入口收敛——唯一入口收在危险区（askDelIndex
       critical 守卫不变），锚同步更新危险区删除钮形态 */
    expect(ih).toContain('<button class="btn sm danger" @click="askDelIndex">删除…</button>'); /*  W4 合并 askConfirm（askDelIndex）+头部入口收敛危险区 */
    expect(ih).toContain('<button v-if="canCreateIdx" aria-label="新建索引');
    expect(ih).toContain('v-if="!canOps && !canAdmin" class="ih-tip pad"');
    expect(ih).toContain('<div class="ih-op-sec" v-if="canAdmin">'); /* 数据可见性（raw 系） */
    expect(ih).toContain('<div class="ih-op-sec danger" v-if="canOps">');
    expect(ih).toContain('v-if="canAdmin && curInfo?.status === \'open\'"'); /* 关闭索引（raw 系） */
    /* 教育文案收进 rt-bar Info 钮 tooltip（只读态语义保留），独立行退役 */
    expect(ih).toContain('当前角色只读，双击不会进入编辑');
  });
  it('ResultTable：就地编辑=write 门禁；删除行/批删/Del 键=ops', () => {
    expect(rt).toContain('if (!canWrite.value) return;');
    /* 1364：行内删除钮收进「更多 ⋯」菜单（用户实报「太多功能平铺」）——
       守卫条件原样搬到菜单项：非 ops 用户打开菜单也看不到「删除文档」。 */
    expect(rt).toMatch(/canOps\.value[\s\S]{0,24}key: 'act-del', label: '删除文档'/);
    expect(rt).toContain('<button v-if="canOps" class="btn sm danger" @click="emit(\'batch-delete\', [...selected])">');
    expect(rt).toContain('if (editing.value || !selected.value.size || !canOps.value) return;');
    expect(rt).toContain("canWrite ? '双击编辑 · Shift+点击范围选 · Ctrl+点击数值聚合' : 'Shift+点击范围选 · Ctrl+点击数值聚合'");
  });
  it('DslQueryView：新文档=write 门禁', () => {
    expect(dsl).toContain('<button v-if="canWrite" class="btn sm pri" @click="openNewDoc()"');
  });
  it('：mine 审计集群维度下推（观察口径按集群）——api.opsAuditMine 传 connName+自助面筛选输入', () => {
    expect(apiSrc).toContain('opsAuditMine: (action?: string, size = 50, from = 0, since?: number, connName?: string) =>');
    expect(sec).toContain('v-else v-model.trim="fConnMine"');
  });
  it('CmdPalette：create-index=ops / create-doc=write / runRaw 五命令=admin / ILM=ops', () => {
    /* 同步更新：canW 定义行升连接感知档 canWriteOn(store.target)（第四波扫荡）；
       ：canO 细化为 canEndpoint(create-index 端点)——canO 唯一消费
       r59-create-index 的端点归 config-validator 页，连接模型按本页写键勾选裁决 */
    expect(pal).toContain("const canW = auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc', store.target), canO = auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target);");
    expect(pal).toContain("const canRawOps = () => auth.canAdminOps();");
    expect(pal).toContain("if (canO && canGo('/indices')) list.push(\n    { id: 'r59-create-index'");
    expect(pal).toContain("if (canW && canGo('/search')) list.push(\n    { id: 'r59-create-doc'");
    expect(pal).toContain("if (canGo('/search')) list.push(\n    { id: 'act-run'");
    expect(pal).toContain("if (idx && canGo('/adhoc-rebuild')) list.push(");
    expect(pal).toContain("if (idx && canGo('/browser')) list.push(");
    expect(pal).toContain("if (canRawOps()) list.push(\n    { id: 'ops-refresh'");
    expect(pal).toContain("if (canRawOps()) list.push(\n    { id: 'ops-reroute-retry'"); /* reroute 属集群系统写，仍 ADMIN */
    expect(pal).toContain('...(canIlm ? [\n      { id: \'dev-ilm-start\''); /* 963 同步更新：ILM 起停门随 ilm/start 端点（canIlm），不再借 create-index 的 canO */
  });
  it('ClusterSwitcher：连接档案管理（表单/⋯菜单）=admin；查看/切换/探活全角色保留', () => {
    expect(cs).toContain("const canAdmin = computed(() => auth.can('admin')); /* 连接档案/探活配置=系统管理域：ADMIN 角色专属，连接写键不放行 */");
    /* 同步更新：⋯ 次级菜单退役改 hover-reveal 图标直出（测试/编辑/删除仍 canAdmin 三件套门控；
       探活钮移出菜单后依旧不受门禁—— probe=VIEWER 豁免） */
    expect(cs).toContain('<template v-if="canAdmin">');
    expect(cs).toContain(':disabled="testingId === c.id" @click="testExisting(c.id)"');
    expect(cs).toContain('@click="editConn(c)"');
    expect(cs).toContain('@click="delConn(c)"');
    /* 同步更新：表单包折叠节（canAdmin 门控随 wrapper 语义不变） */
    expect(cs).toContain('<div class="cm-fold cm-fold-form" :class="{ open: formOpen }" v-if="canAdmin"');
    expect(cs).toContain('连接档案的新增/编辑/删除需 ADMIN 角色；当前可查看、切换与探活已有连接。');
    /* 探活钮不受门禁（ probe=VIEWER 豁免） */
    expect(cs).toContain(':disabled="probingId === c.id" @click="probeConn(c)"');
  });
});

/* ═══ ：权限隐藏第二波——全站写/危险按钮同法收尾（16 视图） ═══ */
describe('权限隐藏第二波（，16 视图写按钮收尾）', () => {
  const V = (f: string) => readFileSync(join(__dirname, '../views', f), 'utf-8');
  it('AliasesView：新建=ops；切换/设写/解绑=完整别名写权（add-only 授权不显示）', () => {
    const v = V('AliasesView.vue');
    expect(v).toContain('<button v-if="canOps" class="btn sm primary" @click="openCreate"');
    expect(v).toContain('<button v-if="canFullAlias" class="btn sm primary" @click="doSwitch"');
    expect(v).toContain("v-if=\"canFullAlias && g.rows.length > 1 && r.isWriteIndex !== true\"");
    expect(v).toContain('<button v-if="canFullAlias" :aria-label="\'解绑此索引\'"');
    expect(v).toContain('...(canFullAlias.value ? [{ key: \'switch\'');
    expect(v).toContain("if (canFullAlias.value && m.isWrite !== true) {");
  });
  it('XmigrateView：启动/中止/续跑=ops + 低权自述', () => {
    const v = V('XmigrateView.vue');
    expect(v).toContain('<button v-if="canOps" class="btn pri" :disabled="!canStart || starting"');
    /* 换壳 QRT：操作钮移 #row-actions 槽，行对象经 rowJob(row) 反查（权限门禁不变） */
    expect(v).toContain("v-if=\"canJobOps(rowJob(row)) && rowJob(row)?.status === 'RUNNING'\"");
    /* 984：续跑需「源写键 + 宿主目标写键」双证——只持源连接写键的用户不该看到必 403 的按钮 */
    expect(v).toContain("v-if=\"canJobOps(rowJob(row)) && canDestOps && ['FAILED','ABORTED','INTERRUPTED'].includes(rowJob(row)?.status ?? '')\"");
    expect(v).toContain('迁移发起需 REBUILD_OP/ADMIN 角色');
  });
  it('AdhocRebuildView：启动/中止/确认切换=ops + AWAIT_CONFIRM 低权指引', () => {
    const v = V('AdhocRebuildView.vue');
    expect(v).toContain('<button v-if="canOps" class="btn primary" :disabled="starting ||');
    expect(v).toContain("v-if=\"canMutateJob && job?.status === 'RUNNING'\"");
    expect(v).toContain('<button v-if="canMutateJob" class="btn primary sm" :disabled="confirming" @click="doConfirmSwitch">');
    expect(v).toContain('切换/中止需 REBUILD_OP/ADMIN 角色——请联系对应角色处置，勿自行尝试');
    expect(v).toContain('作业由 <b class="mono">{{ jobOwner }}</b> 创建'); /* 1007：非创建者前置说明 */
  });
  it('SnapshotsView：创建/恢复/删除=ops（删除按角色意图提级，后端关键词偏低档已披露）', () => {
    const v = V('SnapshotsView.vue');
    expect(v).toContain('<button v-if="canOps" class="btn primary sm" @click="openCreate"');
    expect(v).toContain('<button v-if="canOps" class="btn sm" @click="openRestore(s)"');
    expect(v).toContain('<button v-if="canOps" class="btn sm danger" @click="doDeleteSnapshot(s)"');
    expect(v).toContain('inProgress || !canOps.value ? [] : [');
  });
  it('UpdateByQueryView/BulkEditorView：批量写执行=ops + 自述', () => {
    const uq = V('UpdateByQueryView.vue');
    expect(uq).toContain('<button v-if="canOps" :class="mode === \'delete\'');
    expect(uq).toContain('批量写需 REBUILD_OP/ADMIN 角色');
    const be = V('BulkEditorView.vue');
    expect(be).toContain('<button v-if="canOps" class="btn primary sm" @click="doSubmit"');
    expect(be).toContain('执行需 REBUILD_OP/ADMIN 角色');
  });
  it('TasksView 取消=write / DiagView retryFailedAlloc=diag 页写键', () => {
    const tv = V('TasksView.vue');
    /* 该文件 CRLF 行尾——多行锁用 \s* 兼容 */
    expect(tv).toMatch(/v-if="canWrite"\s+class="btn sm"/);
    const dg = V('DiagView.vue');
    expect(dg).toContain("v-if=\"canOps && allocation.current_state === 'unassigned'\"");
  });
  it('IndexSettingsView 双保存出口/IlmView 策略与重试 step/TemplatesView 保存删除=ops', () => {
    const isv = V('IndexSettingsView.vue');
    expect(isv).toContain('v-if="canOps && canGuardedSave"');
    expect(isv).toContain('v-else-if="canOps" class="btn primary sm" @click="save"');
    const ilm = V('IlmView.vue');
    expect(ilm).toContain('<button v-if="canOps" aria-label="编辑策略"');
    expect(ilm).toContain('<button v-if="canOps" aria-label="删除策略"');
    /* 963：重试 step 实调 /cluster/ilm/move（lifecycle 页）——按真实端点单独判门，不复用策略写门 */
    expect(ilm).toContain("const canMove = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/move', store.target));");
    expect(ilm).toContain('v-if="canMove && isRetryable(info)"');
    expect(ilm).toContain('<button v-if="canOps" class="btn xs" style="margin-left:auto" @click="openNewPolicy">');
    const tv = V('TemplatesView.vue');
    expect(tv).toContain('<button v-if="canOps" class="btn sm" @click="openNew">');
    expect(tv).toContain('<button v-if="canOps" aria-label="删除" class="btn sm ghost" @click.stop="del(t)" :disabled="delBusy"');
    expect(tv).not.toContain('@click.stop="del(t)" title="删除">'); /* 旧形态防回潮：删除钮在途闸 disabled 缺席形态 */
    expect(tv).toContain('<button v-if="canOps" class="btn primary sm" @click="save" :disabled="saving">');
  });
  it('SynonymsManagerView 下发重载/ClusterSettingsView 下发/PainlessLabView stored=ops', () => {
    const sy = V('SynonymsManagerView.vue');
    /* 保存钮后续加了 saveBlockReason 禁用门（disabled+title 就近说明），@click 换行——
       断言按语义拆：canOps 门与 doSave 接线各自独立存在即可 */
    expect(sy).toMatch(/<button v-if="canOps" class="btn primary sm" [^>]*@click="doSave"/s);
    /* 963：热重载实调 /cluster/reload-analyzers——按真实端点单独判门（保存仍 canOps） */
    expect(sy).toContain('<button v-if="canReload" class="btn ghost sm" @click="doReload"');
    const csv = V('ClusterSettingsView.vue');
    /* v3.0.1:工具行按钮对齐全站 sm 基准(xs→sm),权限门 v-if="canOps" 契约不变 */
    expect(csv).toContain('<button v-if="canOps" class="btn sm" :disabled="!countDirty || busy" @click="apply(false)">');
    expect(csv).toContain('<button v-if="canOps" class="btn sm" :disabled="!countDirty || busy" @click="apply(true)">');
    const pl = V('PainlessLabView.vue');
    expect(pl).toContain('<button v-if="canOps" class="btn ghost xs" @click="save"');
    expect(pl).toContain('<X v-if="canOps" :size="10" class="pl-stored-x"');
    /* 试跑 execute 可执行脚本/读取 filter 上下文：按写档 canRun 门禁（后端同口径） */
    expect(pl).toContain("const canRun = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/painless/execute', store.target));");
    expect(pl).toContain('<button v-if="canRun" class="btn primary xs" @click="run" :disabled="busy">');
  });
  it('DiffEditorView 推送=write / LifecycleView ILM 起停 rollover move=ops / DevToolsView run=admin', () => {
    const df = V('DiffEditorView.vue');
    expect(df).toContain('<button v-if="canWrite" class="btn primary sm" @click="doPush"');
    expect(df).toContain('写入需 OPERATOR 及以上角色');
    const lc = V('LifecycleView.vue');
    expect(lc).toContain('<button v-if="canOps" class="btn ghost sm" @click="ilmStart"');
    expect(lc).toContain('<button v-if="canOps" class="btn ghost sm" @click="ilmStop"');
    expect(lc).toContain('<button v-if="canRollover" class="btn primary sm" @click="doRollover(false)"');
    /* 984：「推进」走共享写端点 ilm/move（归属 ilm|lifecycle），只看 ilm/start 会把 w:ilm 授权人挡在门外 */
    expect(lc).toContain('<button v-if="canMove" class="btn primary sm" @click="doMove"');
    const dt = V('DevToolsView.vue');
    expect(dt).toContain('class="btn primary sm btn-run-lock" @click="run"'); /* 锁宽 */
    expect(dt).toContain(':disabled="cur.busy || !currentSendable"');
    expect(dt).toContain('运行需 ADMIN 角色');
  });
});

/* ═══ 第三波：写门收口——10 视图残余写/危险按钮按角色隐藏（源码锁） ═══ */
describe('第三波：写门收口（10 视图写按钮 VIEWER 不可见）', () => {
  const V = (f: string) => readFileSync(join(__dirname, '../views', f), 'utf-8');
  it('RestView：发送/失败重试按内层方法分读写档（1133；写档仍走 canPassthroughWrite）', () => {
    const v = V('RestView.vue');
    expect(v).toContain("const canAdmin = computed(() => auth.canPassthroughWrite(RAW_EP, store.target));");
    expect(v).toContain("const canSendAny = computed(() => auth.canPassthroughRead(RAW_EP, store.target));");
    expect(v).toContain("const canExecInner = (m: string, p: string) => auth.canExecutePassthrough(m, p, RAW_EP, store.target);");
    /* 988：发送钮叠非 ADMIN 数据面预暴露门（DevTools 双门同口径），钮面 disabled 与 doSend 体首行同源
       1133：只读身份也可发只读请求，钮的可见条件改为读档 canSendAny */
    expect(v).toContain('<button v-if="canSendAny" class="btn primary sm" :disabled="sending || !path.trim() || !currentSendable"');
    /* 1004：门带 body（根级检索的 PIT 豁免要读 pit.id），提示分档（根级检索缺索引单列） */
    expect(v).toContain('if (!requestInScope(method.value, path.value, body.value)) { store.notify(\'warning\', scopeDenyHint.value); return; }');
    expect(v).toContain('v-if="respErr && canSendAny" class="btn sm" :disabled="sending" @click="send"');
  });
  it('BrowserView：新建索引/ForceMerge 行钮/删除索引行钮=ops', () => {
    const v = V('BrowserView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-index', store.target));");
    expect(v).toContain('<button v-if="canCreateIdx" class="btn sm pri" @click="createOpen = true">');
    /* 1148：行内动作收进「更多 ⋯」弹层（5 颗图标钮把「操作」列撑到 300px+），
       权限门逐字不变——无权限时菜单里就不出现该项。 */
    expect(v).toContain('<button v-if="canForceMerge" class="bw-more-it" role="menuitem" @click="rowMore = \'\'; askFmRow(row)">');
    expect(v).toContain('<button v-if="canOps" class="bw-more-it danger" role="menuitem" @click="rowMore = \'\'; askDelRow(row)">');
  });
  it('SlmView：立即执行卡钮+右键菜单项=ops（AliasesView 条件展开同款形态）', () => {
    const v = V('SlmView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/slm/execute', store.target)");
    expect(v).toContain('&& auth.canClusterScope(store.target)'); /* 1007：集群级动作 rank 硬门前置 */
    expect(v).toContain('<button v-if="canOps" class="btn pri sm" @click="execNow(p.id)" :disabled="execing === p.id">');
    expect(v).toContain("...(canOps.value ? [{ key: 'exec', label: '立即执行', icon: Play, sep: true, run: () => { close(); void execNow(rm.p.id); } }] : []),");
  });
  it('SearchTemplatesView：保存/删除已存模板=ops', () => {
    const v = V('SearchTemplatesView.vue');
    /* 同步更新：定义行升页面感知档 canPage（conn 模型菜单勾选即权限，静态模型回落 canCap），模板锁零改 */
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/scripts/put', store.target));");
    expect(v).toContain('<button v-if="canOps" class="btn primary xs" @click="save" :disabled="!curId || busy">');
    expect(v).toContain('<button v-if="canOps" aria-label="从集群删除这个已存模板（_scripts），引用它的调用方会报错" class="btn danger xs"');
  });
  it('MappingView：添加字段/动态设置入口+两弹窗提交=ops', () => {
    const v = V('MappingView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/put-mapping', store.target));");
    expect(v).toContain('<button v-if="canOps" class="btn sm" @click="addOpen = true">');
    expect(v).toContain('<button v-if="canSettings" class="btn sm" @click="settingsOpen = true">');
    expect(v).toContain('<button v-if="canOps" class="btn pri" :disabled="!newMappingValid || putting"'); /*  G213 同步更新：在途守卫入 disabled 绑定 */
    expect(v).toContain('<button v-if="canSettings" class="btn pri" :disabled="!newSettingsValid || putting"');
  });
  it('AnalysisSettingsView：热重载按 reload-analyzers / 保存=ops（加载为读操作不受门禁）', () => {
    const v = V('AnalysisSettingsView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/analysis-update', store.target));");
    expect(v).toContain('<button v-if="canOps" class="btn sm pri" @click="doSave" :disabled="!index || !loaded || busy || !hasChanges">');
    /* 963：热重载实调 /cluster/reload-analyzers——按真实端点单独判门 */
    expect(v).toContain('<button v-if="canReload" class="btn ghost sm" @click="doReload" :disabled="!index || busy">');
  });
  it('IndexOptimizerView：下发优化项/执行 force_merge=ops', () => {
    const v = V('IndexOptimizerView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/force-merge', store.target));");
    /* 963：应用勾选实调 index-settings/update——按真实端点单独判门（force_merge 仍 canOps） */
    expect(v).toContain('<button v-if="canApply" class="btn sm pri" :disabled="!hasChecked || applying" @click="applyChecked">');
    expect(v).toContain('<button v-if="canOps" class="btn sm warn" :disabled="segMerging" @click="runForceMerge">');
  });
  it('ConfigValidatorView：真实创建索引=ops（校验为 dry 读不受门禁）', () => {
    const v = V('ConfigValidatorView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target));");
    expect(v).toContain('<button v-if="canOps" class="btn primary sm" @click="askCreate" :disabled="!createName.trim() || creating">');
  });
  it('DslQueryView：按查询删除=ops（新文档 write 门 既有，此处不重复锁）', () => {
    const v = V('DslQueryView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-by-query', store.target));");
    /* 1146：入口收进工具行「更多 ⋯」菜单（1024 档工具行溢出治理），
       权限门与「点开才可见」语义不变：无 ops 权限时菜单里不出现该项。 */
    expect(v).toContain('<button v-if="canOps" class="dq-more-it danger" @click="moreOpen = false; askDeleteByQuery()">');
    expect(v).toContain('<Trash2 :size="13" /> 按当前 query 删除');
  });
  it('ReindexAdvancedView：开始 Reindex/失败重试=ops（reindex-advanced 同批升 rank3 归 ops 档）', () => {
    const v = V('ReindexAdvancedView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reindex-advanced', store.target));");
    expect(v).toContain('<button v-if="canOps" class="btn pri" @click="submit" :disabled="running">');
    expect(v).toContain('v-if="result.error && canOps" class="btn ghost sm" :disabled="running" @click="submit"');
  });
  it('RestView：send()/doSend() 执行体按内层方法收口（@enter 裸键盘与重试钮同汇入，守卫单源在执行体）', () => {
    const v = V('RestView.vue');
    /* 1133：守卫条件改为内层方法分档，但「执行体首行即早退」的强度不变 */
    const hits = v.split('if (!canExecInner(method.value, path.value)) {').length - 1;
    expect(hits, 'send 与 doSend 都必须有该守卫').toBe(2);
    expect(v).toContain("'当前身份对该连接只有只读权限：写请求需要「REST 直连」写权限'");
  });
  it('MappingDesignerView：添加字段=ops（mapping-put 是 rank3 写端点，令直接补刀+584 页面感知）', () => {
    const v = V('MappingDesignerView.vue');
    expect(v).toContain("const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/mapping-put', store.target));");
    expect(v).toContain('<button v-if="canOps" class="btn primary sm" @click="doAdd" :disabled="!newPath || busy">');
  });
});

/* ═══ 第四波： canWrite 连接感知扫荡——全局角色档升连接感知档（源码锁） ═══
   背景：后端已放行 conn 模型下持 conn:{tid}:w:* 写键的用户（飞书授权恒 VIEWER 角色）
   调共享低危写端点；前端这些按钮的门控仍是 auth.can('write')（全局角色档，VIEWER 恒 false）
   →「有权限但看不到按钮」。已立范式（ResultTable canWriteOn(store.target)），本波把
   6 个消费面升到同一连接感知档：静态模型（grantedPages=null）回落 can('write') 零破坏。 */
describe('第四波： canWrite 连接感知扫荡（6 文件定义行 canWriteOn(store.target)）', () => {
  const V = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');
  it('DslQueryView：canWrite=canWriteOn(store.target)（新文档门接连接感知档）', () => {
    expect(V('views/DslQueryView.vue')).toContain("const canWrite = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc', store.target));");
  });
  it('TasksView：canWrite=canWriteOn(store.target)（取消任务门接连接感知档；取消与重建中止同族提档 ops）', () => {
    expect(V('views/TasksView.vue')).toContain("const canWrite = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/tasks/cancel', store.target)");
    expect(V('views/TasksView.vue')).toContain('&& auth.canClusterScope(store.target)');
  });
  it('TaskTreeView：canWrite=canWriteOn(store.target)（批量 cancel/行 Cancel/右键取消项同源提档 ops）', () => {
    expect(V('views/TaskTreeView.vue')).toContain("const canWrite = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/tasks/cancel', store.target)");
    expect(V('views/TaskTreeView.vue')).toContain('&& auth.canClusterScope(store.target)');
  });
  it('DiffEditorView：canWrite=canWriteOn(store.target)（推送门接连接感知档）', () => {
    expect(V('views/DiffEditorView.vue')).toContain("const canWrite = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc/update', store.target));");
  });
  it('IndexHubView：canWrite=canWriteOn(store.target)（189 只读提示文案随连接感知——conn 写键用户实际可编辑）', () => {
    expect(V('views/IndexHubView.vue')).toContain("const canWrite = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/update-partial', store.target));");
  });
  it('CmdPalette：canW/canO 端点级；raw 数据面命令按 rest/devtools 写键、reroute 按 ADMIN', () => {
    const v = V('components/CmdPalette.vue');
    expect(v).toContain("const canW = auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc', store.target), canO = auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target);");
    expect(v).toContain("const canRawOps = () => auth.canAdminOps();");
  });
});
